import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { withNeo4j } from '../neo4j/connection';
import { EmbeddingsService } from '../embeddings/cloudflare-ai';
import { SemanticSearch } from '../search/semantic-search';
import { 
  Props,
  createSuccessResponse,
  createErrorResponse 
} from '../types';
import { 
  InjectContextInputSchema,
  ContextNode
} from '../types/neo4j-types';

export function registerInjectionTools(server: McpServer, env: Env, props: Props) {
  const embeddings = new EmbeddingsService(env.AI, env.CONTEXT_KV);
  const search = new SemanticSearch(embeddings, env);

  server.tool(
    "inject_context",
    "Inject relevant historical context into the current chat based on a query",
    {
      query: InjectContextInputSchema.shape.query,
      maxTokens: InjectContextInputSchema.shape.maxTokens,
      projectId: InjectContextInputSchema.shape.projectId,
      format: InjectContextInputSchema.shape.format
    },
    async ({ query, maxTokens, projectId, format }, extra) => {
      try {
        console.log(`Injecting context for query: "${query}" (max tokens: ${maxTokens})`);
        
        const results = await search.searchContexts({
          query,
          limit: 20,
          projectId,
          useSemanticSearch: true
        });

        if (results.length === 0) {
          return createSuccessResponse(
            'No relevant context found to inject',
            { query, totalResults: 0 }
          );
        }

        let totalTokens = 0;
        const selectedContexts: Array<{
          context: ContextNode;
          score: number;
          chatTitle: string;
          format: 'full' | 'summary' | 'reference';
        }> = [];

        for (const result of results) {
          const context = result.context;
          
          if (format === 'reference') {
            selectedContexts.push({
              ...result,
              format: 'reference'
            });
            totalTokens += 50;
            
          } else if (format === 'summary' && context.summary) {
            const summaryTokens = Math.ceil(context.summary.length / 4);
            if (totalTokens + summaryTokens <= maxTokens) {
              selectedContexts.push({
                ...result,
                format: 'summary'
              });
              totalTokens += summaryTokens;
            }
            
          } else {
            const fullTokens = context.tokenCount;
            if (totalTokens + fullTokens <= maxTokens) {
              selectedContexts.push({
                ...result,
                format: 'full'
              });
              totalTokens += fullTokens;
            } else if (context.summary) {
              const summaryTokens = Math.ceil(context.summary.length / 4);
              if (totalTokens + summaryTokens <= maxTokens) {
                selectedContexts.push({
                  ...result,
                  format: 'summary'
                });
                totalTokens += summaryTokens;
              }
            }
          }
          
          if (totalTokens >= maxTokens * 0.9) break;
        }

        const injection = formatInjection(selectedContexts, query);
        
        const response = createSuccessResponse(
          `Injected ${selectedContexts.length} contexts (${totalTokens} tokens)`,
          {
            query,
            injectedContexts: selectedContexts.length,
            totalTokens,
            format
          }
        );
        
        response.content[0].text += '\n\n' + injection;
        return response;

      } catch (error) {
        console.error('Context injection failed:', error);
        return createErrorResponse(
          'Failed to inject context',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );

  server.tool(
    "get_chat_context",
    "Retrieve all stored contexts for a specific chat",
    {
      chatId: z.string().describe("ID of the chat to retrieve contexts for"),
      includeRelated: z.boolean().default(false).describe("Include related contexts from other chats")
    },
    async ({ chatId, includeRelated }, extra) => {
      try {
        console.log(`Retrieving contexts for chat: ${chatId}`);
        
        const results = await withNeo4j(env, async (session) => {
          let cypher = `
            MATCH (c:Chat {id: $chatId})
            OPTIONAL MATCH (ctx:Context)-[:BELONGS_TO]->(c)
            WITH c, collect(ctx) as contexts
          `;
          
          if (includeRelated) {
            cypher += `
              UNWIND contexts as ctx
              OPTIONAL MATCH (ctx)-[:RELATED_TO|REFERENCES|EVOLVES_TO]-(related:Context)
              OPTIONAL MATCH (related)-[:BELONGS_TO]->(relatedChat:Chat)
              WITH c, contexts, collect(DISTINCT {
                context: related,
                chatTitle: relatedChat.title
              }) as relatedContexts
            `;
          } else {
            cypher += `
              WITH c, contexts, [] as relatedContexts
            `;
          }
          
          cypher += `
            RETURN c as chat, contexts, relatedContexts
          `;
          
          const result = await session.run(cypher, { chatId });
          
          if (result.records.length === 0) {
            return null;
          }
          
          const record = result.records[0];
          return {
            chat: record.get('chat').properties,
            contexts: record.get('contexts').map((c: any) => c.properties),
            relatedContexts: record.get('relatedContexts').map((r: any) => ({
              context: r.context.properties,
              chatTitle: r.chatTitle
            }))
          };
        });

        if (!results) {
          return createErrorResponse('Chat not found', { chatId });
        }

        const { chat, contexts, relatedContexts } = results;
        
        if (contexts.length === 0) {
          return createSuccessResponse(
            `Chat "${chat.title}" has no stored contexts`,
            { chatId, contextCount: 0 }
          );
        }

        let output = `## Contexts for "${chat.title}"\n\n`;
        output += `**Chat ID:** ${chatId}\n`;
        output += `**Created:** ${new Date(chat.createdAt).toLocaleDateString()}\n`;
        output += `**Total Contexts:** ${contexts.length}\n\n`;
        
        const groupedByType = contexts.reduce((acc: any, ctx: any) => {
          const type = ctx.contextType;
          if (!acc[type]) acc[type] = [];
          acc[type].push(ctx);
          return acc;
        }, {});
        
        for (const [type, typeContexts] of Object.entries(groupedByType)) {
          output += `### ${type.charAt(0).toUpperCase() + type.slice(1)} Contexts (${(typeContexts as any[]).length})\n\n`;
          
          for (const ctx of typeContexts as any[]) {
            output += `#### Context ${ctx.id.substring(4, 12)}...\n`;
            output += `**Importance:** ${(ctx.importanceScore * 100).toFixed(0)}%\n`;
            output += `**Tokens:** ${ctx.tokenCount}\n`;
            output += `**Date:** ${new Date(ctx.timestamp).toLocaleDateString()}\n`;
            
            const content = ctx.isSummarized && ctx.summary ? ctx.summary : ctx.content;
            
            if (ctx.contextType === 'code' && ctx.metadata?.language) {
              output += `\n\`\`\`${ctx.metadata.language}\n${content}\n\`\`\`\n`;
            } else {
              output += `\n${content}\n`;
            }
            
            output += '\n---\n\n';
          }
        }
        
        if (includeRelated && relatedContexts.length > 0) {
          output += `### Related Contexts from Other Chats (${relatedContexts.length})\n\n`;
          
          for (const { context, chatTitle } of relatedContexts) {
            output += `#### From "${chatTitle}"\n`;
            output += `**Type:** ${context.contextType}\n`;
            output += `**Date:** ${new Date(context.timestamp).toLocaleDateString()}\n`;
            
            const content = context.isSummarized && context.summary 
              ? context.summary 
              : context.content.substring(0, 200) + '...';
            
            output += `\n${content}\n\n---\n\n`;
          }
        }

        const response = createSuccessResponse(
          `Retrieved ${contexts.length} contexts${includeRelated ? ` and ${relatedContexts.length} related contexts` : ''}`,
          {
            chatId,
            chatTitle: chat.title,
            contextCount: contexts.length,
            relatedCount: relatedContexts.length
          }
        );
        
        response.content[0].text += '\n\n' + output;
        return response;

      } catch (error) {
        console.error('Get chat context failed:', error);
        return createErrorResponse(
          'Failed to retrieve chat contexts',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );
}

function formatInjection(
  contexts: Array<{
    context: ContextNode;
    score: number;
    chatTitle: string;
    format: 'full' | 'summary' | 'reference';
  }>,
  query: string
): string {
  let output = `## Relevant Context for: "${query}"\n\n`;
  output += `*The following ${contexts.length} contexts were found from previous conversations:*\n\n`;
  
  for (const { context, score, chatTitle, format } of contexts) {
    if (format === 'reference') {
      output += `- **[${context.contextType}]** from "${chatTitle}" - ${context.content.substring(0, 100)}...\n`;
      continue;
    }
    
    output += `### Context from "${chatTitle}"\n`;
    output += `- **Relevance:** ${(score * 100).toFixed(0)}%\n`;
    output += `- **Type:** ${context.contextType}\n`;
    output += `- **Date:** ${new Date(context.timestamp).toLocaleDateString()}\n`;
    
    if (format === 'summary') {
      output += `- **Note:** Summarized to save tokens\n`;
    }
    
    output += '\n';
    
    const content = format === 'summary' && context.summary 
      ? context.summary 
      : context.content;
    
    if (context.contextType === 'code' && context.metadata?.language) {
      output += `\`\`\`${context.metadata.language}\n${content}\n\`\`\``;
    } else {
      output += content;
    }
    
    output += '\n\n---\n\n';
  }
  
  return output;
}