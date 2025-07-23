import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { 
  Props, 
  createErrorResponse,
  createSuccessResponse
} from "../types";
import { withNeo4j } from "../neo4j/connection";

// Zod schemas for legacy Neo4j tools
const ListLabelsSchema = {};

const ExecuteCypherSchema = {
  cypher: z
    .string()
    .min(1, "Cypher command cannot be empty")
    .describe("Cypher command to execute (CREATE, MERGE, DELETE, etc.)"),
};

const ShowSchemaSchema = {};

const ALLOWED_USERNAMES = new Set<string>([
  'vedantparmar12',
  // Add more usernames who should have write access
]);

export function registerNeo4jLegacyTools(server: McpServer, env: Env, props: Props) {
  // Tool 1: List all labels and relationship types
  server.tool(
    "listLabels",
    "Get all node labels and relationship types in the Neo4j graph database",
    ListLabelsSchema,
    async () => {
      try {
        return await withNeo4j(
          env.NEO4J_URI,
          env.NEO4J_USER,
          env.NEO4J_PASSWORD,
          async (session) => {
            // Get all node labels
            const labelsResult = await session.run('CALL db.labels()');
            const labels = labelsResult.records.map(record => record.get('label'));
            
            // Get all relationship types
            const relsResult = await session.run('CALL db.relationshipTypes()');
            const relationships = relsResult.records.map(record => record.get('relationshipType'));
            
            // Get counts for each label
            const labelCounts: Record<string, number> = {};
            for (const label of labels) {
              const countResult = await session.run(
                `MATCH (n:\`${label}\`) RETURN count(n) as count`
              );
              const count = countResult.records[0].get('count');
              labelCounts[label] = count.toNumber ? count.toNumber() : count;
            }
            
            return createSuccessResponse(
              "Graph schema retrieved successfully",
              {
                labels: labelCounts,
                relationshipTypes: relationships,
                totalLabels: labels.length,
                totalRelationshipTypes: relationships.length
              }
            );
          }
        );
      } catch (error) {
        console.error('listLabels error:', error);
        return createErrorResponse(
          `Error retrieving graph schema: ${formatNeo4jError(error)}`
        );
      }
    }
  );

  // Tool 2: Execute Cypher (write operations) - available to all for knowledge graph
  server.tool(
    "executeCypher",
    "Execute any Cypher statement against the Neo4j graph database, including CREATE, MERGE, DELETE, and other write operations.",
    ExecuteCypherSchema,
    async ({ cypher }) => {
      try {
        return await withNeo4j(
          env.NEO4J_URI,
          env.NEO4J_USER,
          env.NEO4J_PASSWORD,
          async (session) => {
            const result = await session.run(cypher);
            
            const isWrite = isWriteOperation(cypher);
            const operationType = isWrite ? "Write Operation" : "Read Operation";
            
            // Format results
            const records = result.records.map(record => {
              const obj: any = {};
              record.keys.forEach(key => {
                const value = record.get(key);
                obj[key] = formatNeo4jValue(value);
              });
              return obj;
            });
            
            // Get summary info
            const summary = result.summary;
            const counters = summary.counters.updates();
            
            return {
              content: [
                {
                  type: "text",
                  text: `**${operationType} Executed Successfully**\n\`\`\`cypher\n${cypher}\n\`\`\`\n\n**Results:**\n\`\`\`json\n${JSON.stringify(records, null, 2)}\n\`\`\`\n\n${isWrite ? `**⚠️ Graph was modified**\n${formatCounters(counters)}` : `**Records returned:** ${records.length}`}\n\n**Executed by:** ${props.login} (${props.name})`
                }
              ]
            };
          }
        );
      } catch (error) {
        console.error('executeCypher error:', error);
        return createErrorResponse(`Cypher execution error: ${formatNeo4jError(error)}`);
      }
    }
  );

  // Tool 3: Show detailed schema
  server.tool(
    "showSchema",
    "Get detailed schema information including node properties and relationship properties",
    ShowSchemaSchema,
    async () => {
      try {
        return await withNeo4j(
          env.NEO4J_URI,
          env.NEO4J_USER,
          env.NEO4J_PASSWORD,
          async (session) => {
            // Get schema visualization
            const schemaResult = await session.run('CALL db.schema.visualization()');
            
            if (schemaResult.records.length > 0) {
              const nodes = schemaResult.records[0].get('nodes');
              const relationships = schemaResult.records[0].get('relationships');
              
              const schema = {
                nodes: nodes.map((node: any) => ({
                  label: node.labels[0],
                  properties: node.properties || {}
                })),
                relationships: relationships.map((rel: any) => ({
                  type: rel.type,
                  startLabel: rel.start?.labels?.[0],
                  endLabel: rel.end?.labels?.[0],
                  properties: rel.properties || {}
                }))
              };
              
              return createSuccessResponse(
                "Detailed schema retrieved successfully",
                schema
              );
            }
            
            return createSuccessResponse(
              "No schema found. The database might be empty.",
              { nodes: [], relationships: [] }
            );
          }
        );
      } catch (error) {
        console.error('showSchema error:', error);
        return createErrorResponse(
          `Error retrieving detailed schema: ${formatNeo4jError(error)}`
        );
      }
    }
  );
}

// Helper functions
function isWriteOperation(cypher: string): boolean {
  const writeKeywords = [
    'create', 'merge', 'delete', 'set', 'remove', 'detach',
    'drop', 'constraint', 'index'
  ];
  
  const normalizedCypher = cypher.trim().toLowerCase();
  return writeKeywords.some(keyword => 
    normalizedCypher.includes(keyword)
  );
}

function formatNeo4jError(error: unknown): string {
  if (error instanceof Error) {
    // Remove sensitive information
    let message = error.message;
    
    // Remove connection details
    message = message.replace(/neo4j\+s:\/\/[^@]+@[^\s]+/gi, 'neo4j+s://***');
    message = message.replace(/password['":\s]*[^'"\s,}]+/gi, 'password: ***');
    
    // Common Neo4j error patterns
    if (message.includes('ServiceUnavailable')) {
      return 'Neo4j database is unavailable. Please check your connection.';
    }
    if (message.includes('Neo.ClientError.Security.Unauthorized')) {
      return 'Authentication failed. Please check your Neo4j credentials.';
    }
    if (message.includes('Neo.ClientError.Statement.SyntaxError')) {
      return `Cypher syntax error: ${message}`;
    }
    
    return message;
  }
  
  return 'An unknown error occurred';
}

function formatNeo4jValue(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }
  
  // Handle Neo4j integers
  if (value.toNumber) {
    return value.toNumber();
  }
  
  // Handle nodes
  if (value.labels) {
    return {
      id: value.identity?.toNumber?.() || value.identity,
      labels: value.labels,
      properties: value.properties
    };
  }
  
  // Handle relationships
  if (value.type) {
    return {
      id: value.identity?.toNumber?.() || value.identity,
      type: value.type,
      startNodeId: value.start?.toNumber?.() || value.start,
      endNodeId: value.end?.toNumber?.() || value.end,
      properties: value.properties
    };
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(v => formatNeo4jValue(v));
  }
  
  // Handle objects
  if (typeof value === 'object') {
    const formatted: any = {};
    for (const [k, v] of Object.entries(value)) {
      formatted[k] = formatNeo4jValue(v);
    }
    return formatted;
  }
  
  return value;
}

function formatCounters(counters: any): string {
  const parts = [];
  if (counters.nodesCreated > 0) parts.push(`Nodes created: ${counters.nodesCreated}`);
  if (counters.nodesDeleted > 0) parts.push(`Nodes deleted: ${counters.nodesDeleted}`);
  if (counters.relationshipsCreated > 0) parts.push(`Relationships created: ${counters.relationshipsCreated}`);
  if (counters.relationshipsDeleted > 0) parts.push(`Relationships deleted: ${counters.relationshipsDeleted}`);
  if (counters.propertiesSet > 0) parts.push(`Properties set: ${counters.propertiesSet}`);
  if (counters.labelsAdded > 0) parts.push(`Labels added: ${counters.labelsAdded}`);
  if (counters.labelsRemoved > 0) parts.push(`Labels removed: ${counters.labelsRemoved}`);
  
  return parts.length > 0 ? parts.join('\n') : 'No changes made';
}