import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { withNeo4j } from '../neo4j/connection';
import { ContextExtractor } from '../extractors/context-extractor';
import { RelationshipDetector } from '../extractors/relationship-detector';
import { EmbeddingsService } from '../embeddings/cloudflare-ai';
import { 
  Props,
  createSuccessResponse,
  createErrorResponse 
} from '../types';
import { 
  ExtractContextInputSchema,
  ChatNode 
} from '../types/neo4j-types';

export function registerExtractionTools(server: McpServer, env: Env, props: Props) {
  const maxContextTokens = parseInt(env.MAX_CONTEXT_TOKENS || '4000');
  const extractor = new ContextExtractor(maxContextTokens);
  const relationshipDetector = new RelationshipDetector();
  const embeddings = new EmbeddingsService(env.AI, env.CONTEXT_KV);

  server.tool(
    "extract_context",
    "Extract important contexts from chat content and store in Neo4j graph database",
    {
      content: ExtractContextInputSchema.shape.content,
      chatId: ExtractContextInputSchema.shape.chatId,
      projectId: ExtractContextInputSchema.shape.projectId,
      maxContexts: ExtractContextInputSchema.shape.maxContexts
    },
    async ({ content, chatId, projectId, maxContexts }, extra) => {
      try {
        console.log(`Extracting contexts for chat ${chatId} in project ${projectId}`);
        
        const extractionResult = await extractor.extractFromChat(content, chatId, projectId);
        
        const contexts = extractionResult.contexts.slice(0, maxContexts);
        const relationships = extractionResult.relationships;
        
        const embeddingMap = await generateEmbeddingsForContexts(contexts, embeddings);
        
        await withNeo4j(env, async (session) => {
          await session.executeWrite(async (tx) => {
            const chatExists = await tx.run(
              'MATCH (c:Chat {id: $chatId}) RETURN c',
              { chatId }
            );
            
            if (chatExists.records.length === 0) {
              await tx.run(
                `CREATE (c:Chat {
                  id: $chatId,
                  projectId: $projectId,
                  title: $title,
                  createdAt: $timestamp,
                  updatedAt: $timestamp,
                  userId: $userId,
                  tokenCount: 0,
                  contextCount: 0
                })`,
                {
                  chatId,
                  projectId,
                  title: `Chat ${new Date().toLocaleDateString()}`,
                  timestamp: new Date().toISOString(),
                  userId: props.login
                }
              );
            }
            
            for (const context of contexts) {
              const contextWithEmbedding = {
                ...context,
                embedding: embeddingMap.get(context.id)
              };
              
              await tx.run(
                `MERGE (ctx:Context {id: $id})
                 SET ctx += $properties`,
                {
                  id: context.id,
                  properties: contextWithEmbedding
                }
              );
              
              await tx.run(
                `MATCH (ctx:Context {id: $contextId}), (c:Chat {id: $chatId})
                 MERGE (ctx)-[:BELONGS_TO]->(c)`,
                { contextId: context.id, chatId }
              );
            }
            
            for (const rel of relationships) {
              await tx.run(
                `MATCH (from:Context {id: $fromId}), (to:Context {id: $toId})
                 MERGE (from)-[r:${rel.type}]->(to)
                 SET r += $properties`,
                {
                  fromId: rel.fromId,
                  toId: rel.toId,
                  properties: rel.properties || {}
                }
              );
            }
            
            await tx.run(
              `MATCH (c:Chat {id: $chatId})
               MATCH (ctx:Context)-[:BELONGS_TO]->(c)
               WITH c, count(ctx) as contextCount, sum(ctx.tokenCount) as totalTokens
               SET c.contextCount = contextCount, c.tokenCount = totalTokens`,
              { chatId }
            );
          });
        });

        const summary = {
          extracted: contexts.length,
          relationships: relationships.length,
          totalTokens: extractionResult.totalTokens,
          extractionTime: `${extractionResult.extractionTime}ms`,
          contextTypes: contexts.reduce((acc, ctx) => {
            acc[ctx.contextType] = (acc[ctx.contextType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        };

        return createSuccessResponse(
          `Extracted ${contexts.length} contexts and ${relationships.length} relationships`,
          summary
        );

      } catch (error) {
        console.error('Context extraction failed:', error);
        return createErrorResponse(
          'Failed to extract contexts',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );

  server.tool(
    "extract_from_export",
    "Extract contexts from an exported chat JSON file",
    {
      exportData: z.string().describe("JSON string of exported chat data"),
      projectId: z.string().describe("Project ID to associate contexts with")
    },
    async ({ exportData, projectId }, extra) => {
      try {
        const chatData = JSON.parse(exportData);
        
        if (!chatData.messages || !Array.isArray(chatData.messages)) {
          return createErrorResponse('Invalid export format - missing messages array');
        }

        const chatId = chatData.id || `chat_export_${Date.now()}`;
        const chatTitle = chatData.title || 'Imported Chat';
        
        const fullContent = chatData.messages
          .filter((msg: any) => msg.role === 'assistant' || msg.role === 'user')
          .map((msg: any) => `## ${msg.role.toUpperCase()}\n${msg.content}`)
          .join('\n\n');

        const extractionResult = await extractor.extractFromChat(fullContent, chatId, projectId);
        
        const contexts = extractionResult.contexts;
        const relationships = extractionResult.relationships;
        
        const embeddingMap = await generateEmbeddingsForContexts(contexts, embeddings);
        
        await withNeo4j(env, async (session) => {
          await session.executeWrite(async (tx) => {
            await tx.run(
              `CREATE (c:Chat {
                id: $chatId,
                projectId: $projectId,
                title: $title,
                createdAt: $timestamp,
                updatedAt: $timestamp,
                userId: $userId,
                tokenCount: 0,
                contextCount: 0,
                isImported: true
              })`,
              {
                chatId,
                projectId,
                title: chatTitle,
                timestamp: new Date().toISOString(),
                userId: props.login
              }
            );
            
            for (const context of contexts) {
              const contextWithEmbedding = {
                ...context,
                embedding: embeddingMap.get(context.id)
              };
              
              await tx.run(
                `CREATE (ctx:Context $properties)`,
                { properties: contextWithEmbedding }
              );
              
              await tx.run(
                `MATCH (ctx:Context {id: $contextId}), (c:Chat {id: $chatId})
                 CREATE (ctx)-[:BELONGS_TO]->(c)`,
                { contextId: context.id, chatId }
              );
            }
            
            for (const rel of relationships) {
              await tx.run(
                `MATCH (from:Context {id: $fromId}), (to:Context {id: $toId})
                 MERGE (from)-[r:${rel.type}]->(to)
                 SET r += $properties`,
                {
                  fromId: rel.fromId,
                  toId: rel.toId,
                  properties: rel.properties || {}
                }
              );
            }
          });
        });

        return createSuccessResponse(
          `Imported chat "${chatTitle}" with ${contexts.length} contexts`,
          {
            chatId,
            chatTitle,
            contexts: contexts.length,
            relationships: relationships.length,
            totalTokens: extractionResult.totalTokens
          }
        );

      } catch (error) {
        console.error('Export extraction failed:', error);
        return createErrorResponse(
          'Failed to extract from export',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );
}

async function generateEmbeddingsForContexts(
  contexts: any[], 
  embeddingsService: EmbeddingsService
): Promise<Map<string, number[]>> {
  const contextsForEmbedding = contexts.map(ctx => ({
    id: ctx.id,
    content: ctx.summary || ctx.content
  }));
  
  return await embeddingsService.generateForContexts(contextsForEmbedding);
}