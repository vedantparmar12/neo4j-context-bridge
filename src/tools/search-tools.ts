import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddingsService } from '../embeddings/cloudflare-ai';
import { SemanticSearch } from '../search/semantic-search';
import { 
  Props,
  createSuccessResponse,
  createErrorResponse 
} from '../types';
import { 
  SearchContextInputSchema,
  GetEvolutionInputSchema
} from '../types/neo4j-types';

export function registerSearchTools(server: McpServer, env: Env, props: Props) {
  const embeddings = new EmbeddingsService(env.AI, env.CONTEXT_KV);
  const search = new SemanticSearch(embeddings, env);

  server.tool(
    "search_context",
    "Search for relevant context across all past chats using keywords or semantic search",
    {
      query: SearchContextInputSchema.shape.query,
      contextTypes: SearchContextInputSchema.shape.contextTypes,
      limit: SearchContextInputSchema.shape.limit,
      projectId: SearchContextInputSchema.shape.projectId,
      useSemanticSearch: SearchContextInputSchema.shape.useSemanticSearch
    },
    async ({ query, contextTypes, limit, projectId, useSemanticSearch }, extra) => {
      try {
        console.log(`Searching for: "${query}" (semantic: ${useSemanticSearch})`);
        
        const results = await search.searchContexts({
          query,
          contextTypes,
          limit,
          projectId,
          useSemanticSearch
        });

        if (results.length === 0) {
          return createSuccessResponse(
            'No matching contexts found',
            { query, totalResults: 0 }
          );
        }

        const maxTokens = parseInt(env.MAX_INJECTION_TOKENS || '2000');
        let totalTokens = 0;
        const selectedResults = [];

        for (const result of results) {
          const tokens = result.context.tokenCount;
          if (totalTokens + tokens <= maxTokens) {
            selectedResults.push(result);
            totalTokens += tokens;
          } else if (result.context.summary) {
            const summaryTokens = Math.ceil(result.context.summary.length / 4);
            if (totalTokens + summaryTokens <= maxTokens) {
              result.context.isSummarized = true;
              selectedResults.push(result);
              totalTokens += summaryTokens;
            }
          }
        }

        const formatted = selectedResults.map(r => {
          const content = r.context.isSummarized && r.context.summary 
            ? r.context.summary 
            : r.context.content;
          
          let output = `### Context from "${r.chatTitle}" (Score: ${r.score.toFixed(2)})\n`;
          output += `**Type:** ${r.context.contextType}\n`;
          output += `**Date:** ${new Date(r.context.timestamp).toLocaleDateString()}\n`;
          
          if (r.highlights && r.highlights.length > 0) {
            output += `**Highlights:**\n${r.highlights.map(h => `> ${h}`).join('\n')}\n\n`;
          }
          
          output += `**Content:**\n`;
          
          if (r.context.contextType === 'code' && r.context.metadata?.language) {
            output += `\`\`\`${r.context.metadata.language}\n${content}\n\`\`\``;
          } else {
            output += content;
          }
          
          return output;
        }).join('\n\n---\n\n');

        const response = createSuccessResponse(
          `Found ${selectedResults.length} relevant contexts (${results.length} total matches)`,
          {
            query,
            totalResults: results.length,
            displayedResults: selectedResults.length,
            totalTokens,
            searchType: useSemanticSearch ? 'semantic' : 'keyword'
          }
        );
        
        response.content[0].text += '\n\n' + formatted;
        return response;

      } catch (error) {
        console.error('Context search failed:', error);
        return createErrorResponse(
          'Failed to search contexts',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );

  server.tool(
    "find_related",
    "Find contexts related to a specific context through graph relationships",
    {
      contextId: z.string().describe("ID of the context to find related contexts for"),
      limit: z.number().int().positive().max(20).default(5).describe("Maximum related contexts to return")
    },
    async ({ contextId, limit }, extra) => {
      try {
        console.log(`Finding contexts related to: ${contextId}`);
        
        const results = await search.findRelatedContexts(contextId, limit);

        if (results.length === 0) {
          return createSuccessResponse(
            'No related contexts found',
            { contextId, totalResults: 0 }
          );
        }

        const formatted = results.map(r => {
          let output = `### Related Context from "${r.chatTitle}" (Relevance: ${r.score.toFixed(2)})\n`;
          output += `**Type:** ${r.context.contextType}\n`;
          output += `**Date:** ${new Date(r.context.timestamp).toLocaleDateString()}\n`;
          output += `**Content:**\n`;
          
          const content = r.context.isSummarized && r.context.summary 
            ? r.context.summary 
            : r.context.content;
          
          if (r.context.contextType === 'code' && r.context.metadata?.language) {
            output += `\`\`\`${r.context.metadata.language}\n${content}\n\`\`\``;
          } else {
            output += content;
          }
          
          return output;
        }).join('\n\n---\n\n');

        const response = createSuccessResponse(
          `Found ${results.length} related contexts`,
          {
            sourceContextId: contextId,
            relatedCount: results.length
          }
        );
        
        response.content[0].text += '\n\n' + formatted;
        return response;

      } catch (error) {
        console.error('Related context search failed:', error);
        return createErrorResponse(
          'Failed to find related contexts',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );

  server.tool(
    "get_evolution",
    "Track how a context has evolved across multiple chats",
    {
      contextId: GetEvolutionInputSchema.shape.contextId,
      depth: GetEvolutionInputSchema.shape.depth
    },
    async ({ contextId, depth }, extra) => {
      try {
        console.log(`Tracking evolution of context: ${contextId} (depth: ${depth})`);
        
        const { contexts, path } = await search.getEvolutionChain(contextId, depth);

        if (contexts.length === 0) {
          return createSuccessResponse(
            'No evolution history found',
            { contextId, evolutionSteps: 0 }
          );
        }

        const formatted = contexts.map((ctx, index) => {
          const isOriginal = index === 0;
          const evolutionStep = index + 1;
          
          let output = `### Evolution Step ${evolutionStep}${isOriginal ? ' (Original)' : ''}\n`;
          output += `**Date:** ${new Date(ctx.timestamp).toLocaleDateString()}\n`;
          output += `**Type:** ${ctx.contextType}\n`;
          
          if (!isOriginal && index > 0) {
            const prevCtx = contexts[index - 1];
            const timeDiff = new Date(ctx.timestamp).getTime() - new Date(prevCtx.timestamp).getTime();
            const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            output += `**Time since previous:** ${daysDiff} days\n`;
          }
          
          output += `**Content:**\n`;
          
          const content = ctx.isSummarized && ctx.summary ? ctx.summary : ctx.content;
          
          if (ctx.contextType === 'code' && ctx.metadata?.language) {
            output += `\`\`\`${ctx.metadata.language}\n${content}\n\`\`\``;
          } else {
            output += content;
          }
          
          return output;
        }).join('\n\n---\n\n');

        const response = createSuccessResponse(
          `Found ${contexts.length} evolution steps`,
          {
            contextId,
            evolutionSteps: contexts.length,
            timeSpan: contexts.length > 1 ? {
              start: contexts[0].timestamp,
              end: contexts[contexts.length - 1].timestamp
            } : null
          }
        );
        
        response.content[0].text += '\n\n' + formatted;
        return response;

      } catch (error) {
        console.error('Evolution tracking failed:', error);
        return createErrorResponse(
          'Failed to track context evolution',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );
}