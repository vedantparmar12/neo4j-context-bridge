import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateSimpleEmbedding, cosineSimilarity, estimateTokens } from "../utils/tfidf-embeddings";
import { 
  Props,
  StoreContextSchema,
  SearchContextSchema,
  RetrieveContextSchema,
  InjectContextSchema,
  createErrorResponse,
  createSuccessResponse,
  ContextNode,
  ContextType
} from "../types";
import { withNeo4j } from "../neo4j/connection";

const ALLOWED_USERNAMES = new Set<string>([
  'vedantparmar12',
  // Add more usernames who should have write access
]);

export function registerContextTools(server: McpServer, env: Env, props: Props) {
  // Tool 1: Store Context
  server.tool(
    "storeContext",
    "Store a new context node in the knowledge graph. Extracts and saves important information from chat conversations.",
    StoreContextSchema,
    async ({ chat_id, project_id, content_type, summary, full_content, importance_score = 5, tags = [], parent_id }) => {
      // Ensure numeric values are proper integers
      const cleanImportanceScore = Math.floor(Number(importance_score));
      try {
        return await withNeo4j(
          env.NEO4J_URI,
          env.NEO4J_USER,
          env.NEO4J_PASSWORD,
          async (session) => {
            // Generate embedding using local method (no API needed)
            let embedding: number[] = [];
            try {
              // Combine summary and content for better embedding
              const textForEmbedding = summary + " " + full_content.substring(0, 500);
              embedding = generateSimpleEmbedding(textForEmbedding);
            } catch (error) {
              console.error('Failed to generate embedding:', error);
              embedding = generateSimpleEmbedding(summary); // Fallback to just summary
            }

            // Create context node
            const result = await session.run(
              `
              CREATE (c:Context {
                id: randomUUID(),
                chat_id: $chat_id,
                project_id: $project_id,
                timestamp: datetime(),
                content_type: $content_type,
                summary: $summary,
                full_content: $full_content,
                importance_score: $importance_score,
                embedding: $embedding,
                tags: $tags,
                version: 1,
                created_by: $username
              })
              
              // Create project node if doesn't exist
              MERGE (p:Project {id: $project_id})
              CREATE (c)-[:BELONGS_TO]->(p)
              
              // Create chat node if doesn't exist
              MERGE (ch:Chat {id: $chat_id, project_id: $project_id})
              CREATE (c)-[:FROM_CHAT]->(ch)
              
              // Link to parent if specified
              WITH c
              WHERE $parent_id IS NOT NULL
              OPTIONAL MATCH (parent:Context {id: $parent_id})
              FOREACH (p IN CASE WHEN parent IS NOT NULL THEN [parent] ELSE [] END |
                CREATE (c)-[:EVOLVES_FROM]->(p)
              )
              
              RETURN c.id as context_id, c.timestamp as timestamp
              `,
              {
                chat_id,
                project_id,
                content_type,
                summary,
                full_content,
                importance_score: cleanImportanceScore,
                embedding,
                tags,
                parent_id,
                username: props.login
              }
            );

            const contextId = result.records[0].get('context_id');
            const timestamp = result.records[0].get('timestamp');

            // Store in KV for fast retrieval
            await env.CONTEXT_KV.put(
              `context:${project_id}:${contextId}`,
              JSON.stringify({
                chat_id,
                project_id,
                content_type,
                summary,
                full_content,
                importance_score: cleanImportanceScore,
                tags,
                timestamp: timestamp.toString(),
                embedding
              }),
              { expirationTtl: 60 * 60 * 24 * 30 } // 30 days
            );

            return createSuccessResponse(
              "Context stored successfully",
              { context_id: contextId, timestamp: timestamp.toString() }
            );
          }
        );
      } catch (error) {
        console.error('storeContext error:', error);
        return createErrorResponse(`Failed to store context: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  // Tool 2: Search Context
  server.tool(
    "searchContext",
    "Search for relevant contexts using semantic search or keyword matching. Returns contexts that match the query.",
    SearchContextSchema,
    async ({ query, project_id, content_type, limit, use_semantic = true }) => {
      // Handle limit - if not provided, don't limit results
      const cleanLimit = limit ? Math.floor(Number(limit)) : null;
      try {
        return await withNeo4j(
          env.NEO4J_URI,
          env.NEO4J_USER,
          env.NEO4J_PASSWORD,
          async (session) => {
            let results;

            if (use_semantic) {
              // Generate embedding for query using local method
              const queryEmbedding = generateSimpleEmbedding(query);

              // First get all contexts with embeddings
              const contextsWithEmbeddings = await session.run(
                `
                MATCH (c:Context)
                WHERE ($project_id IS NULL OR c.project_id = $project_id)
                  AND ($content_type IS NULL OR c.content_type = $content_type)
                  AND c.embedding IS NOT NULL
                RETURN c
                `,
                { project_id, content_type }
              );

              // Calculate similarities in JavaScript
              const contextsWithSimilarity = contextsWithEmbeddings.records
                .map(record => {
                  const context = record.get('c').properties;
                  const similarity = cosineSimilarity(context.embedding, queryEmbedding);
                  return { context, similarity };
                })
                .filter(item => item.similarity > 0.7)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, cleanLimit || undefined);

              // Format results to match expected structure
              if (contextsWithSimilarity.length > 0) {
                results = {
                  records: contextsWithSimilarity.map(item => ({
                    get: (key: string) => {
                      if (key === 'c') return { properties: item.context };
                      if (key === 'similarity') return item.similarity;
                      return null;
                    }
                  }))
                };
              } else {
                // Fallback to keyword search if no semantic matches
                results = await session.run(
                  `
                  MATCH (c:Context)
                  WHERE ($project_id IS NULL OR c.project_id = $project_id)
                    AND ($content_type IS NULL OR c.content_type = $content_type)
                    AND (
                      toLower(c.summary) CONTAINS toLower($query) OR 
                      toLower(c.full_content) CONTAINS toLower($query)
                    )
                  RETURN c, 
                    CASE 
                      WHEN toLower(c.summary) CONTAINS toLower($query) THEN 0.9
                      ELSE 0.7
                    END as similarity
                  ORDER BY c.importance_score DESC, c.timestamp DESC
                  ${cleanLimit ? 'LIMIT $limit' : ''}
                  `,
                  { project_id, content_type, query, limit: cleanLimit }
                );
              }
            } else {
              // Keyword search
              results = await session.run(
                `
                MATCH (c:Context)
                WHERE ($project_id IS NULL OR c.project_id = $project_id)
                  AND ($content_type IS NULL OR c.content_type = $content_type)
                  AND (
                    toLower(c.summary) CONTAINS toLower($query) OR 
                    toLower(c.full_content) CONTAINS toLower($query) OR
                    ANY(tag IN c.tags WHERE toLower(tag) CONTAINS toLower($query))
                  )
                RETURN c, c.importance_score as similarity
                ORDER BY c.importance_score DESC, c.timestamp DESC
                ${cleanLimit ? 'LIMIT $limit' : ''}
                `,
                { project_id, content_type, query, limit: cleanLimit }
              );
            }

            const contexts = results.records.map(record => {
              const context = record.get('c').properties;
              const similarity = record.get('similarity');
              return {
                ...context,
                similarity,
                timestamp: context.timestamp?.toString()
              };
            });

            return createSuccessResponse(
              `Found ${contexts.length} matching contexts`,
              { contexts, total: contexts.length }
            );
          }
        );
      } catch (error) {
        console.error('searchContext error:', error);
        return createErrorResponse(`Context search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  // Tool 3: Retrieve Context with Relationships
  server.tool(
    "retrieveContext",
    "Retrieve contexts for a project or chat, including their relationships and evolution history.",
    RetrieveContextSchema,
    async ({ project_id, chat_id, limit, include_relationships = true }) => {
      // Handle limit - if not provided, don't limit results
      const cleanLimit = limit ? Math.floor(Number(limit)) : null;
      try {
        return await withNeo4j(
          env.NEO4J_URI,
          env.NEO4J_USER,
          env.NEO4J_PASSWORD,
          async (session) => {
            let query = `
              MATCH (c:Context)
              WHERE c.project_id = $project_id
                ${chat_id ? 'AND c.chat_id = $chat_id' : ''}
            `;

            if (include_relationships) {
              query += `
                OPTIONAL MATCH (c)-[r:REFERENCES|DEPENDS_ON|EVOLVES_FROM|RELATED_TO]-(related:Context)
                WITH c, collect({
                  type: type(r),
                  direction: CASE WHEN startNode(r) = c THEN 'outgoing' ELSE 'incoming' END,
                  related_id: related.id,
                  related_summary: related.summary,
                  related_type: related.content_type
                }) as relationships
              `;
            } else {
              query += `
                WITH c, [] as relationships
              `;
            }

            query += `
              RETURN c, relationships
              ORDER BY c.timestamp DESC
              ${cleanLimit ? 'LIMIT $limit' : ''}
            `;

            const params: any = {
              project_id,
              chat_id
            };
            
            if (cleanLimit) {
              params.limit = cleanLimit;
            }

            const results = await session.run(query, params);

            const contexts = results.records.map(record => {
              const context = record.get('c').properties;
              const relationships = record.get('relationships');
              return {
                ...context,
                timestamp: context.timestamp?.toString(),
                relationships: relationships.filter((r: any) => r.related_id !== null)
              };
            });

            // Get project statistics
            const statsResult = await session.run(
              `
              MATCH (c:Context {project_id: $project_id})
              WITH count(c) as total_contexts,
                   count(DISTINCT c.chat_id) as total_chats,
                   collect(DISTINCT c.content_type) as content_types
              RETURN total_contexts, total_chats, content_types
              `,
              { project_id }
            );

            const stats = statsResult.records[0];

            return createSuccessResponse(
              "Contexts retrieved successfully",
              {
                contexts,
                statistics: {
                  total_contexts: stats.get('total_contexts'),
                  total_chats: stats.get('total_chats'),
                  content_types: stats.get('content_types')
                }
              }
            );
          }
        );
      } catch (error) {
        console.error('retrieveContext error:', error);
        return createErrorResponse(`Failed to retrieve contexts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  // Tool 4: Inject Context into Prompt
  server.tool(
    "injectContext",
    "Intelligently inject relevant past contexts into the current prompt without exceeding token limits.",
    InjectContextSchema,
    async ({ project_id, current_prompt, max_tokens, context_types }) => {
      try {
        const maxTokenLimit = max_tokens || parseInt(env.MAX_INJECTION_TOKENS || '2000');

        return await withNeo4j(
          env.NEO4J_URI,
          env.NEO4J_USER,
          env.NEO4J_PASSWORD,
          async (session) => {
            // Search for relevant contexts using local embeddings
            const queryEmbedding = generateSimpleEmbedding(current_prompt);

            // Get relevant contexts
            let contextQuery = `
              MATCH (c:Context {project_id: $project_id})
              WHERE ($context_types IS NULL OR $context_types = [] OR c.content_type IN $context_types)
            `;

            // Get contexts with embeddings (no limit - process all available)
            const contextsWithEmbeddings = await session.run(
              contextQuery + `
                AND c.embedding IS NOT NULL
              RETURN c
              `,
              { project_id, context_types: context_types || null }
            );

            // Calculate similarities
            let contexts = contextsWithEmbeddings.records
              .map(record => {
                const context = record.get('c').properties;
                const similarity = cosineSimilarity(context.embedding, queryEmbedding);
                return { ...context, similarity };
              })
              .filter(c => c.similarity > 0.7)
              .sort((a, b) => b.similarity - a.similarity || b.importance_score - a.importance_score);

            // If no semantic results, fall back to keyword search
            if (contexts.length === 0) {
              const keywordResults = await session.run(
                contextQuery + `
                  AND (
                    ANY(word IN split(toLower($prompt), ' ') WHERE toLower(c.summary) CONTAINS word) OR
                    ANY(word IN split(toLower($prompt), ' ') WHERE toLower(c.full_content) CONTAINS word)
                  )
                RETURN c, c.importance_score as similarity
                ORDER BY c.importance_score DESC, c.timestamp DESC
                `,
                { project_id, context_types: context_types || null, prompt: current_prompt }
              );

              contexts = keywordResults.records.map(record => ({
                ...record.get('c').properties,
                similarity: record.get('similarity')
              }));
            }

            // Prioritize and trim contexts to fit token limit
            let currentTokens = estimateTokens(current_prompt);
            const selectedContexts: any[] = [];

            for (const context of contexts) {
              const contextText = `\n\n---\n**${context.content_type.toUpperCase()}: ${context.summary}**\n${context.full_content}\n---`;
              const contextTokens = estimateTokens(contextText);

              if (currentTokens + contextTokens <= maxTokenLimit) {
                selectedContexts.push({
                  ...context,
                  injected_text: contextText,
                  token_count: contextTokens
                });
                currentTokens += contextTokens;
              } else {
                // Try with just summary
                const summaryText = `\n\n**${context.content_type}: ${context.summary}**`;
                const summaryTokens = estimateTokens(summaryText);
                
                if (currentTokens + summaryTokens <= maxTokenLimit) {
                  selectedContexts.push({
                    ...context,
                    injected_text: summaryText,
                    token_count: summaryTokens,
                    summary_only: true
                  });
                  currentTokens += summaryTokens;
                }
              }
            }

            // Build the enhanced prompt
            let enhancedPrompt = current_prompt;
            if (selectedContexts.length > 0) {
              enhancedPrompt = "## Relevant Context from Previous Conversations:\n";
              enhancedPrompt += selectedContexts.map(c => c.injected_text).join('\n');
              enhancedPrompt += "\n\n## Current Request:\n" + current_prompt;
            }


            return createSuccessResponse(
              "Context injection completed",
              {
                enhanced_prompt: enhancedPrompt,
                injected_contexts: selectedContexts.length,
                total_tokens: currentTokens,
                token_limit: maxTokenLimit,
                contexts_summary: selectedContexts.map(c => ({
                  id: c.id,
                  type: c.content_type,
                  summary: c.summary,
                  similarity: c.similarity,
                  tokens: c.token_count,
                  summary_only: c.summary_only || false
                }))
              }
            );
          }
        );
      } catch (error) {
        console.error('injectContext error:', error);
        return createErrorResponse(`Failed to inject context: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  // Tool 5: Create Context Relationship
  if (ALLOWED_USERNAMES.has(props.login)) {
    server.tool(
      "linkContexts",
      "Create relationships between context nodes to build the knowledge graph structure.",
      {
        source_id: z.string().min(1, "Source context ID is required"),
        target_id: z.string().min(1, "Target context ID is required"),
        relationship_type: z.enum(['references', 'depends_on', 'evolves_from', 'related_to']),
        weight: z.number().min(0).max(1).optional().default(0.5)
      },
      async ({ source_id, target_id, relationship_type, weight = 0.5 }) => {
        try {
          return await withNeo4j(
            env.NEO4J_URI,
            env.NEO4J_USER,
            env.NEO4J_PASSWORD,
            async (session) => {
              const result = await session.run(
                `
                MATCH (source:Context {id: $source_id})
                MATCH (target:Context {id: $target_id})
                MERGE (source)-[r:${relationship_type.toUpperCase()} {weight: $weight}]->(target)
                SET r.created_at = datetime(),
                    r.created_by = $username
                RETURN source.summary as source_summary, 
                       target.summary as target_summary,
                       type(r) as relationship
                `,
                { source_id, target_id, weight, username: props.login }
              );

              if (result.records.length === 0) {
                return createErrorResponse("One or both context nodes not found");
              }

              const record = result.records[0];
              return createSuccessResponse(
                "Context relationship created",
                {
                  source: record.get('source_summary'),
                  target: record.get('target_summary'),
                  relationship: record.get('relationship')
                }
              );
            }
          );
        } catch (error) {
          console.error('linkContexts error:', error);
          return createErrorResponse(`Failed to create relationship: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    );

    // Tool 6: Summarize Contexts
    server.tool(
      "summarizeProjectContext",
      "Generate a comprehensive summary of all contexts in a project, organized by type and importance.",
      {
        project_id: z.string().min(1, "Project ID is required"),
        include_graph_viz: z.boolean().optional().default(true)
      },
      async ({ project_id, include_graph_viz = true }) => {
        try {
          return await withNeo4j(
            env.NEO4J_URI,
            env.NEO4J_USER,
            env.NEO4J_PASSWORD,
            async (session) => {
              // Get context statistics by type
              const statsResult = await session.run(
                `
                MATCH (c:Context {project_id: $project_id})
                WITH c.content_type as type, 
                     count(c) as count,
                     avg(c.importance_score) as avg_importance,
                     collect({
                       id: c.id,
                       summary: c.summary,
                       score: c.importance_score,
                       timestamp: c.timestamp
                     })[..5] as top_contexts
                RETURN type, count, avg_importance, top_contexts
                ORDER BY count DESC
                `,
                { project_id }
              );

              const contextsByType = statsResult.records.map(record => ({
                type: record.get('type'),
                count: record.get('count'),
                avg_importance: record.get('avg_importance'),
                top_contexts: record.get('top_contexts').map((c: any) => ({
                  ...c,
                  timestamp: c.timestamp?.toString()
                }))
              }));

              // Get relationship statistics
              const relResult = await session.run(
                `
                MATCH (c1:Context {project_id: $project_id})-[r]-(c2:Context {project_id: $project_id})
                WITH type(r) as rel_type, count(r) as count
                RETURN rel_type, count
                ORDER BY count DESC
                `,
                { project_id }
              );

              const relationships = relResult.records.map(record => ({
                type: record.get('rel_type'),
                count: record.get('count')
              }));

              // Get evolution chains
              const evolutionResult = await session.run(
                `
                MATCH path = (c1:Context {project_id: $project_id})-[:EVOLVES_FROM*]->(c2:Context {project_id: $project_id})
                WHERE NOT (c2)-[:EVOLVES_FROM]->()
                WITH path, length(path) as chain_length
                ORDER BY chain_length DESC
                LIMIT 5
                RETURN [n in nodes(path) | {id: n.id, summary: n.summary, type: n.content_type}] as evolution_chain
                `,
                { project_id }
              );

              const evolutionChains = evolutionResult.records.map(record => 
                record.get('evolution_chain')
              );

              let visualization = null;
              if (include_graph_viz) {
                // Generate a simple graph visualization data
                const vizResult = await session.run(
                  `
                  MATCH (c:Context {project_id: $project_id})
                  OPTIONAL MATCH (c)-[r]-(other:Context {project_id: $project_id})
                  WITH c, collect(DISTINCT {
                    target_id: other.id,
                    relationship: type(r)
                  }) as connections
                  RETURN collect({
                    id: c.id,
                    label: c.summary,
                    type: c.content_type,
                    importance: c.importance_score,
                    connections: connections
                  }) as nodes
                  `,
                  { project_id }
                );

                visualization = vizResult.records[0]?.get('nodes') || [];
              }

              // Generate summary based on data (no AI needed)
              let projectSummary = null;
              if (contextsByType.length > 0) {
                const totalContexts = contextsByType.reduce((sum, t) => sum + t.count, 0);
                const topTypes = contextsByType.slice(0, 3).map(t => `${t.type} (${t.count})`).join(', ');
                const topRelationships = relationships.slice(0, 3).map(r => `${r.type} (${r.count})`).join(', ');
                
                projectSummary = `Project contains ${totalContexts} contexts across ${contextsByType.length} types. ` +
                  `Main content types: ${topTypes}. ` +
                  `Key relationships: ${topRelationships || 'none yet'}. ` +
                  `Evolution chains: ${evolutionChains.length} identified.`;
              }

              return createSuccessResponse(
                "Project context summary generated",
                {
                  project_id,
                  summary: projectSummary,
                  contexts_by_type: contextsByType,
                  total_contexts: contextsByType.reduce((sum, t) => sum + t.count, 0),
                  relationships,
                  evolution_chains: evolutionChains,
                  visualization: include_graph_viz ? visualization : null
                }
              );
            }
          );
        } catch (error) {
          console.error('summarizeProjectContext error:', error);
          return createErrorResponse(`Failed to summarize project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    );
  }
}

