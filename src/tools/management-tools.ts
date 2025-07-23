import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { withNeo4j } from '../neo4j/connection';
import { checkUserPermissions } from '../neo4j/security';
import { 
  Props,
  createSuccessResponse,
  createErrorResponse 
} from '../types';
import { 
  ListChatsInputSchema,
  ManageRelationshipInputSchema,
  VisualizeGraphInputSchema,
  GraphVisualization
} from '../types/neo4j-types';

export function registerManagementTools(server: McpServer, env: Env, props: Props) {
  server.tool(
    "list_chats",
    "List all chats in a project with their context summaries",
    {
      projectId: ListChatsInputSchema.shape.projectId,
      limit: ListChatsInputSchema.shape.limit,
      offset: ListChatsInputSchema.shape.offset
    },
    async ({ projectId, limit, offset }, extra) => {
      try {
        console.log(`Listing chats${projectId ? ` for project ${projectId}` : ''}`);
        
        const results = await withNeo4j(env, async (session) => {
          let cypher = `
            MATCH (c:Chat)
            ${projectId ? 'WHERE c.projectId = $projectId' : ''}
            OPTIONAL MATCH (ctx:Context)-[:BELONGS_TO]->(c)
            WITH c, count(ctx) as contextCount, sum(ctx.tokenCount) as totalTokens
            ORDER BY c.updatedAt DESC
            SKIP $offset
            LIMIT $limit
            RETURN c, contextCount, totalTokens
          `;
          
          const params: any = { offset, limit };
          if (projectId) params.projectId = projectId;
          
          const result = await session.run(cypher, params);
          
          return result.records.map(record => ({
            chat: record.get('c').properties,
            contextCount: record.get('contextCount').toNumber(),
            totalTokens: record.get('totalTokens')?.toNumber() || 0
          }));
        });

        if (results.length === 0) {
          return createSuccessResponse('No chats found', { totalChats: 0 });
        }

        const formatted = results.map(r => {
          const chat = r.chat;
          let output = `### ${chat.title}\n`;
          output += `**ID:** ${chat.id}\n`;
          output += `**Created:** ${new Date(chat.createdAt).toLocaleDateString()}\n`;
          output += `**Updated:** ${new Date(chat.updatedAt).toLocaleDateString()}\n`;
          output += `**Contexts:** ${r.contextCount}\n`;
          output += `**Total Tokens:** ${r.totalTokens.toLocaleString()}\n`;
          if (chat.isImported) output += `**Status:** Imported\n`;
          return output;
        }).join('\n---\n');

        const response = createSuccessResponse(
          `Found ${results.length} chats`,
          {
            totalChats: results.length,
            projectId,
            pagination: { offset, limit }
          }
        );
        
        response.content[0].text += '\n\n' + formatted;
        return response;

      } catch (error) {
        console.error('List chats failed:', error);
        return createErrorResponse(
          'Failed to list chats',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );

  server.tool(
    "visualize_graph",
    "Generate a visualization of the context graph",
    {
      projectId: VisualizeGraphInputSchema.shape.projectId,
      chatId: VisualizeGraphInputSchema.shape.chatId,
      depth: VisualizeGraphInputSchema.shape.depth,
      format: VisualizeGraphInputSchema.shape.format
    },
    async ({ projectId, chatId, depth, format }, extra) => {
      try {
        console.log(`Generating ${format} visualization (depth: ${depth})`);
        
        const visualization = await withNeo4j(env, async (session) => {
          let cypher: string;
          let params: any = { depth };
          
          if (chatId) {
            cypher = `
              MATCH (c:Chat {id: $chatId})
              OPTIONAL MATCH path = (ctx:Context)-[:BELONGS_TO]->(c)
              OPTIONAL MATCH relationships = (ctx)-[r*1..${depth}]-(related:Context)
              RETURN collect(DISTINCT ctx) as nodes, 
                     collect(DISTINCT relationships) as paths,
                     c as chat
            `;
            params.chatId = chatId;
          } else if (projectId) {
            cypher = `
              MATCH (c:Chat {projectId: $projectId})
              OPTIONAL MATCH (ctx:Context)-[:BELONGS_TO]->(c)
              WITH collect(DISTINCT ctx) as contexts
              UNWIND contexts as ctx
              OPTIONAL MATCH path = (ctx)-[r*1..${depth}]-(related:Context)
              RETURN collect(DISTINCT ctx) as nodes,
                     collect(DISTINCT path) as paths
            `;
            params.projectId = projectId;
          } else {
            cypher = `
              MATCH (ctx:Context)
              WITH ctx LIMIT 100
              OPTIONAL MATCH path = (ctx)-[r*1..${depth}]-(related:Context)
              RETURN collect(DISTINCT ctx) as nodes,
                     collect(DISTINCT path) as paths
            `;
          }
          
          const result = await session.run(cypher, params);
          
          if (result.records.length === 0) {
            return null;
          }
          
          const record = result.records[0];
          const nodes = record.get('nodes') || [];
          const paths = record.get('paths') || [];
          
          return { nodes, paths };
        });

        if (!visualization) {
          return createSuccessResponse('No graph data found', { nodeCount: 0, edgeCount: 0 });
        }

        const graphViz = generateVisualization(visualization, format);
        
        const response = createSuccessResponse(
          `Generated ${format} visualization`,
          {
            format,
            nodeCount: graphViz.nodeCount,
            edgeCount: graphViz.edgeCount,
            depth
          }
        );
        
        response.content[0].text += '\n\n```' + format + '\n' + graphViz.content + '\n```';
        return response;

      } catch (error) {
        console.error('Graph visualization failed:', error);
        return createErrorResponse(
          'Failed to generate visualization',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );

  if (checkUserPermissions(props.login, 'write')) {
    server.tool(
      "manage_relationships",
      "Create, update, or delete relationships between contexts",
      {
        fromId: ManageRelationshipInputSchema.shape.fromId,
        toId: ManageRelationshipInputSchema.shape.toId,
        type: ManageRelationshipInputSchema.shape.type,
        action: ManageRelationshipInputSchema.shape.action,
        properties: ManageRelationshipInputSchema.shape.properties
      },
      async ({ fromId, toId, type, action, properties }, extra) => {
        try {
          console.log(`${action} relationship: ${fromId} -[${type}]-> ${toId}`);
          
          const result = await withNeo4j(env, async (session) => {
            if (action === 'create') {
              const cypher = `
                MATCH (from:Context {id: $fromId}), (to:Context {id: $toId})
                CREATE (from)-[r:${type}]->(to)
                SET r += $properties
                RETURN from, to, r
              `;
              
              const result = await session.run(cypher, {
                fromId,
                toId,
                properties: properties || {}
              });
              
              if (result.records.length === 0) {
                throw new Error('One or both contexts not found');
              }
              
              return {
                action: 'created',
                from: result.records[0].get('from').properties,
                to: result.records[0].get('to').properties,
                relationship: result.records[0].get('r').properties
              };
              
            } else if (action === 'update') {
              const cypher = `
                MATCH (from:Context {id: $fromId})-[r:${type}]->(to:Context {id: $toId})
                SET r += $properties
                RETURN from, to, r
              `;
              
              const result = await session.run(cypher, {
                fromId,
                toId,
                properties: properties || {}
              });
              
              if (result.records.length === 0) {
                throw new Error('Relationship not found');
              }
              
              return {
                action: 'updated',
                from: result.records[0].get('from').properties,
                to: result.records[0].get('to').properties,
                relationship: result.records[0].get('r').properties
              };
              
            } else if (action === 'delete') {
              const cypher = `
                MATCH (from:Context {id: $fromId})-[r:${type}]->(to:Context {id: $toId})
                DELETE r
                RETURN from, to
              `;
              
              const result = await session.run(cypher, { fromId, toId });
              
              if (result.records.length === 0) {
                throw new Error('Relationship not found');
              }
              
              return {
                action: 'deleted',
                from: result.records[0].get('from').properties,
                to: result.records[0].get('to').properties
              };
            }
          });

          return createSuccessResponse(
            `Successfully ${result!.action} relationship`,
            result!
          );

        } catch (error) {
          console.error('Manage relationship failed:', error);
          return createErrorResponse(
            'Failed to manage relationship',
            { error: error instanceof Error ? error.message : String(error) }
          );
        }
      }
    );
  }
}

function generateVisualization(data: any, format: string): GraphVisualization {
  const nodes = new Map<string, any>();
  const edges = new Set<string>();
  
  for (const node of data.nodes) {
    if (node.properties) {
      nodes.set(node.properties.id, node.properties);
    }
  }
  
  for (const path of data.paths) {
    if (path && path.segments) {
      for (const segment of path.segments) {
        const start = segment.start.properties.id;
        const end = segment.end.properties.id;
        const type = segment.relationship.type;
        edges.add(`${start}-${type}-${end}`);
      }
    }
  }
  
  let content = '';
  
  if (format === 'mermaid') {
    content = 'graph TD\n';
    
    for (const [id, node] of nodes) {
      const label = `${node.contextType}\\n${node.content.substring(0, 30)}...`;
      content += `  ${id.replace(/-/g, '_')}["${label}"]\n`;
    }
    
    for (const edge of edges) {
      const [start, type, end] = edge.split('-');
      content += `  ${start.replace(/-/g, '_')} -->|${type}| ${end.replace(/-/g, '_')}\n`;
    }
    
  } else if (format === 'graphviz') {
    content = 'digraph G {\n';
    content += '  rankdir=LR;\n';
    content += '  node [shape=box];\n';
    
    for (const [id, node] of nodes) {
      const label = `${node.contextType}\\n${node.content.substring(0, 30)}...`;
      content += `  "${id}" [label="${label}"];\n`;
    }
    
    for (const edge of edges) {
      const [start, type, end] = edge.split('-');
      content += `  "${start}" -> "${end}" [label="${type}"];\n`;
    }
    
    content += '}';
    
  } else if (format === 'json') {
    const jsonGraph = {
      nodes: Array.from(nodes.values()).map(node => ({
        id: node.id,
        type: node.contextType,
        content: node.content.substring(0, 100),
        importance: node.importanceScore
      })),
      edges: Array.from(edges).map(edge => {
        const [start, type, end] = edge.split('-');
        return { from: start, to: end, type };
      })
    };
    
    content = JSON.stringify(jsonGraph, null, 2);
  }
  
  return {
    format: format as any,
    content,
    nodeCount: nodes.size,
    edgeCount: edges.size
  };
}