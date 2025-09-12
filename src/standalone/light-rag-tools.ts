import { 
  createSuccessResponse, 
  createErrorResponse, 
  StandaloneEnv,
  LightRAGQuerySchema,
  LightRAGExtractSchema,
  LightRAGAnalyzeSchema,
  LightRAGHealthSchema
} from './types.js';
import { LightRAGStorage } from './light-rag-storage.js';
import { OllamaClient } from './ollama-client.js';

export function createLightRAGTools(env: StandaloneEnv) {
  const lightRag = new LightRAGStorage(env);
  const ollama = new OllamaClient(env);

  return {
    lightrag_query: {
      name: "lightrag_query",
      description: "Query the knowledge graph using Light RAG dual-level retrieval with automatic entity extraction and subgraph analysis",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language query for Light RAG retrieval"
          },
          max_results: {
            type: "number",
            description: "Maximum number of results to return",
            default: 20
          },
          include_subgraphs: {
            type: "boolean",
            description: "Include subgraph analysis",
            default: true
          },
          similarity_threshold: {
            type: "number",
            description: "Override default similarity threshold (0-1)",
            minimum: 0,
            maximum: 1
          }
        },
        required: ["query"]
      },
      handler: async (args: any) => {
        try {
          if (!env.LIGHTRAG_ENABLED) {
            return createErrorResponse("Light RAG is disabled. Enable it in configuration.");
          }

          const parsed = LightRAGQuerySchema.parse(args);
          
          // Initialize schema if first time
          await lightRag.initializeSchema();
          
          // Perform Light RAG retrieval
          const result = await lightRag.retrieveWithLightRAG(parsed.query);
          
          // Format response with relevance scores
          const sortedEntities = result.entities
            .map(entity => ({
              ...entity,
              relevance_score: result.relevance_scores[entity.name] || 0
            }))
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, parsed.max_results);

          const response = {
            query: parsed.query,
            total_entities_found: result.entities.length,
            total_relations_found: result.relations.length,
            entities: sortedEntities,
            relations: result.relations,
            subgraphs: parsed.include_subgraphs ? result.subgraphs : [],
            metadata: {
              dual_level_extraction: true,
              vector_similarity: result.entities.some(e => e.embedding),
              subgraph_analysis: parsed.include_subgraphs,
              timestamp: new Date().toISOString()
            }
          };

          return createSuccessResponse("Light RAG query executed successfully", response);
        } catch (error) {
          console.error('Light RAG query error:', error);
          return createErrorResponse(`Light RAG query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    },

    lightrag_extract: {
      name: "lightrag_extract",
      description: "Extract entities and relationships from text using Ollama LLM and optionally store them in the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to extract entities and relations from"
          },
          user: {
            type: "string",
            description: "User context for extraction",
            default: "default_user"
          },
          auto_store: {
            type: "boolean",
            description: "Automatically store extracted entities",
            default: true
          }
        },
        required: ["text"]
      },
      handler: async (args: any) => {
        try {
          if (!env.LIGHTRAG_ENABLED) {
            return createErrorResponse("Light RAG is disabled. Enable it in configuration.");
          }

          const parsed = LightRAGExtractSchema.parse(args);
          
          // Extract entities and relations
          const extracted = await ollama.extractEntitiesAndRelations(parsed.text);
          
          let storedEntities = [];
          let storedRelations = [];
          
          if (parsed.auto_store && (extracted.entities.length > 0 || extracted.relations.length > 0)) {
            // Initialize schema if first time
            await lightRag.initializeSchema();
            
            // Convert to Light RAG format
            const lightRagEntities = extracted.entities.map(entity => ({
              name: entity.name,
              entityType: entity.type,
              observations: [entity.description],
              importance_score: entity.importance,
              creation_context: `Extracted from text by ${parsed.user}`,
              keywords: [entity.name.toLowerCase(), entity.type.toLowerCase()]
            }));
            
            const lightRagRelations = extracted.relations.map(relation => ({
              from: relation.from,
              to: relation.to,
              relationType: relation.type,
              strength_score: relation.strength,
              description: relation.description,
              keywords: [relation.type.toLowerCase()]
            }));
            
            // Store in Neo4j
            if (lightRagEntities.length > 0) {
              storedEntities = await lightRag.createLightRAGEntities(lightRagEntities);
            }
            
            if (lightRagRelations.length > 0) {
              storedRelations = await lightRag.createLightRAGRelations(lightRagRelations);
            }
          }
          
          const response = {
            extracted: {
              entities: extracted.entities,
              relations: extracted.relations,
              total_entities: extracted.entities.length,
              total_relations: extracted.relations.length
            },
            stored: parsed.auto_store ? {
              entities: storedEntities.length,
              relations: storedRelations.length,
              successful_storage: storedEntities.length > 0 || storedRelations.length > 0
            } : null,
            metadata: {
              extraction_method: "ollama_llm",
              auto_stored: parsed.auto_store,
              user_context: parsed.user,
              timestamp: new Date().toISOString()
            }
          };

          return createSuccessResponse("Text extraction completed", response);
        } catch (error) {
          console.error('Light RAG extract error:', error);
          return createErrorResponse(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    },

    lightrag_analyze: {
      name: "lightrag_analyze",
      description: "Analyze specific entities using multi-hop subgraph analysis to understand relationships and context",
      inputSchema: {
        type: "object",
        properties: {
          entity_names: {
            type: "array",
            items: { type: "string" },
            description: "Entity names to analyze"
          },
          max_hops: {
            type: "number",
            description: "Maximum relationship hops for analysis",
            default: 3,
            minimum: 1,
            maximum: 5
          },
          include_context: {
            type: "boolean",
            description: "Include creation context",
            default: true
          }
        },
        required: ["entity_names"]
      },
      handler: async (args: any) => {
        try {
          if (!env.LIGHTRAG_ENABLED) {
            return createErrorResponse("Light RAG is disabled. Enable it in configuration.");
          }

          const parsed = LightRAGAnalyzeSchema.parse(args);
          
          if (parsed.entity_names.length === 0) {
            return createErrorResponse("At least one entity name is required for analysis");
          }
          
          // Get the entities and their subgraphs
          const entityDetails = await lightRag.openNodes(parsed.entity_names);
          
          // Generate comprehensive analysis for each entity
          const analysis = [];
          
          for (const entityName of parsed.entity_names) {
            const entity = entityDetails.entities.find(e => e.name === entityName);
            if (!entity) {
              analysis.push({
                entity_name: entityName,
                found: false,
                message: "Entity not found in knowledge graph"
              });
              continue;
            }
            
            // Get connected entities (multi-hop)
            const connectedQuery = `
              MATCH path = (start:Entity {name: $entityName})-[*1..${parsed.max_hops}]-(connected:Entity)
              WITH start, connected, relationships(path) as rels, length(path) as pathLength
              RETURN connected.name as name, connected.entityType as entityType, 
                     connected.observations as observations, connected.importance_score as importance,
                     collect(DISTINCT {type: type(rels[0]), strength: rels[0].strength_score}) as relationships,
                     pathLength
              ORDER BY pathLength, importance DESC
              LIMIT 50
            `;
            
            // Generate subgraphs through a proper retrieval call
            const subgraphResult = await lightRag.retrieveWithLightRAG(`entity: ${entityName}`);
            const subgraphs = subgraphResult.subgraphs;
            
            analysis.push({
              entity_name: entityName,
              found: true,
              entity_details: {
                ...entity,
                creation_context: parsed.include_context ? entity.creation_context : undefined
              },
              connected_entities: subgraphs.length > 0 ? subgraphs[0].entities.length - 1 : 0,
              relationship_count: subgraphs.length > 0 ? subgraphs[0].relations.length : 0,
              subgraph_score: subgraphs.length > 0 ? subgraphs[0].score : 0,
              multi_hop_analysis: subgraphs.length > 0 ? {
                total_hops: parsed.max_hops,
                entities_by_hop: subgraphs[0].entities.map((e: any) => ({
                  name: e.name,
                  type: e.entityType,
                  importance: e.importance_score
                }))
              } : null
            });
          }
          
          const response = {
            analyzed_entities: analysis.length,
            found_entities: analysis.filter(a => a.found).length,
            analysis,
            metadata: {
              max_hops: parsed.max_hops,
              include_context: parsed.include_context,
              analysis_timestamp: new Date().toISOString()
            }
          };

          return createSuccessResponse("Entity analysis completed", response);
        } catch (error) {
          console.error('Light RAG analyze error:', error);
          return createErrorResponse(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    },

    lightrag_health: {
      name: "lightrag_health",
      description: "Check Light RAG system health including Ollama connectivity and embedding capabilities",
      inputSchema: {
        type: "object",
        properties: {
          check_ollama: {
            type: "boolean",
            description: "Check Ollama service health",
            default: true
          },
          check_embeddings: {
            type: "boolean",
            description: "Check embedding capabilities",
            default: true
          }
        }
      },
      handler: async (args: any) => {
        try {
          const parsed = LightRAGHealthSchema.parse(args);
          const health: any = {
            lightrag_enabled: env.LIGHTRAG_ENABLED,
            auto_extraction: env.LIGHTRAG_AUTO_EXTRACTION,
            timestamp: new Date().toISOString()
          };
          
          if (parsed.check_ollama) {
            try {
              const isHealthy = await ollama.isHealthy();
              const models = isHealthy ? await ollama.listModels() : [];
              
              health.ollama = {
                status: isHealthy ? 'healthy' : 'unhealthy',
                base_url: env.OLLAMA_BASE_URL,
                configured_model: env.OLLAMA_MODEL,
                configured_embedding_model: env.OLLAMA_EMBEDDING_MODEL,
                available_models: models,
                timeout: env.OLLAMA_TIMEOUT
              };
            } catch (error) {
              health.ollama = {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
              };
            }
          }
          
          if (parsed.check_embeddings) {
            try {
              const testEmbedding = await ollama.generateEmbedding("test embedding");
              health.embeddings = {
                status: 'working',
                dimension: testEmbedding.length,
                configured_dimension: env.LIGHTRAG_EMBEDDING_DIMENSION,
                model: env.OLLAMA_EMBEDDING_MODEL
              };
            } catch (error) {
              health.embeddings = {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
              };
            }
          }
          
          // Check Neo4j vector index status
          try {
            await lightRag.initializeSchema();
            health.neo4j_vector_index = {
              status: 'initialized',
              embedding_dimension: env.LIGHTRAG_EMBEDDING_DIMENSION,
              similarity_threshold: env.LIGHTRAG_SIMILARITY_THRESHOLD
            };
          } catch (error) {
            health.neo4j_vector_index = {
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
          
          const overallHealth = [
            health.ollama?.status === 'healthy',
            health.embeddings?.status === 'working',
            health.neo4j_vector_index?.status === 'initialized'
          ].filter(Boolean).length;
          
          health.overall_status = overallHealth >= 2 ? 'healthy' : 'degraded';
          
          return createSuccessResponse("Health check completed", health);
        } catch (error) {
          console.error('Light RAG health check error:', error);
          return createErrorResponse(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    },

    lightrag_auto_process: {
      name: "lightrag_auto_process",
      description: "Automatically process conversation messages for entity extraction and knowledge graph updates",
      inputSchema: {
        type: "object",
        properties: {
          user: {
            type: "string",
            description: "User identifier",
            default: "default_user"
          },
          messages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                role: {
                  type: "string",
                  enum: ["user", "assistant"]
                },
                content: {
                  type: "string"
                }
              },
              required: ["role", "content"]
            },
            description: "Array of conversation messages to process"
          }
        },
        required: ["messages"]
      },
      handler: async (args: any) => {
        try {
          if (!env.LIGHTRAG_ENABLED || !env.LIGHTRAG_AUTO_EXTRACTION) {
            return createErrorResponse("Light RAG auto-processing is disabled. Enable LIGHTRAG_AUTO_EXTRACTION in configuration.");
          }

          const { user = "default_user", messages } = args;
          
          if (!Array.isArray(messages) || messages.length === 0) {
            return createErrorResponse("Messages array is required and must not be empty");
          }
          
          // Initialize schema if first time
          await lightRag.initializeSchema();
          
          // Process conversation for automatic extraction
          const result = await lightRag.processConversationForAutoExtraction(user, messages);
          
          const response = {
            processed_messages: messages.length,
            extracted_entities: result.entities.length,
            extracted_relations: result.relations.length,
            entities: result.entities,
            relations: result.relations,
            metadata: {
              user_context: user,
              auto_extraction_enabled: env.LIGHTRAG_AUTO_EXTRACTION,
              processing_timestamp: new Date().toISOString(),
              extraction_limits: {
                max_entities: env.LIGHTRAG_MAX_ENTITIES_PER_EXTRACTION,
                max_relations: env.LIGHTRAG_MAX_RELATIONS_PER_EXTRACTION,
                min_relation_strength: env.LIGHTRAG_MIN_RELATION_STRENGTH
              }
            }
          };

          return createSuccessResponse("Conversation auto-processing completed", response);
        } catch (error) {
          console.error('Light RAG auto-process error:', error);
          return createErrorResponse(`Auto-processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
  };
}