import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { 
  StandaloneEnv,
  createErrorResponse,
  createSuccessResponse,
  CreateEntitiesSchema,
  CreateRelationsSchema,
  AddObservationsSchema,
  DeleteEntitiesSchema,
  DeleteRelationsSchema,
  DeleteObservationsSchema,
  ReadGraphSchema,
  SearchNodesSchema,
  OpenNodesSchema,
  ListLabelsSchema,
  ExecuteCypherSchema,
  ShowSchemaSchema,
  ConversationMemorySchema,
  StoreConversationSchema,
  StoreCodeSchema,
  Entity,
  Relation
} from './types.js';
import { KnowledgeGraphStorage } from './knowledge-graph-storage.js';
import { withNeo4j } from './neo4j-connection.js';

export function registerAllTools(server: Server, env: StandaloneEnv) {
  const storage = new KnowledgeGraphStorage(env);

  // Knowledge Graph Tools
  
  // Use correct MCP SDK API
  server.setRequestHandler(
    z.object({
      method: z.literal('tools/list')
    }),
    async (request) => {
    console.error("tools/list handler called");
    return {
      tools: [
        // Knowledge Graph Tools
        {
          name: "create_entities",
          description: "Create multiple new entities in the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              entities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Unique name identifier" },
                    entityType: { type: "string", description: "Type of entity" },
                    observations: { type: "array", items: { type: "string" } }
                  },
                  required: ["name", "entityType", "observations"]
                }
              }
            },
            required: ["entities"]
          }
        },
        {
          name: "create_relations",
          description: "Create relations between entities",
          inputSchema: {
            type: "object",
            properties: {
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    relationType: { type: "string" }
                  },
                  required: ["from", "to", "relationType"]
                }
              }
            },
            required: ["relations"]
          }
        },
        {
          name: "add_observations",
          description: "Add observations to an existing entity",
          inputSchema: {
            type: "object",
            properties: {
              entity: { type: "string" },
              observations: { type: "array", items: { type: "string" } }
            },
            required: ["entity", "observations"]
          }
        },
        {
          name: "delete_entities",
          description: "Delete entities from the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              entities: { type: "array", items: { type: "string" } }
            },
            required: ["entities"]
          }
        },
        {
          name: "delete_relations",
          description: "Delete specific relations",
          inputSchema: {
            type: "object",
            properties: {
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    relationType: { type: "string" }
                  },
                  required: ["from", "to", "relationType"]
                }
              }
            },
            required: ["relations"]
          }
        },
        {
          name: "delete_observations",
          description: "Delete specific observations from an entity",
          inputSchema: {
            type: "object",
            properties: {
              entity: { type: "string" },
              observations: { type: "array", items: { type: "string" } }
            },
            required: ["entity", "observations"]
          }
        },
        {
          name: "read_graph",
          description: "Read the entire knowledge graph",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "search_nodes",
          description: "Search for nodes by name, type, or observations",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" }
            },
            required: ["query"]
          }
        },
        {
          name: "open_nodes",
          description: "Get specific nodes and their relations",
          inputSchema: {
            type: "object",
            properties: {
              names: { type: "array", items: { type: "string" } }
            },
            required: ["names"]
          }
        },
        // Neo4j Legacy Tools
        {
          name: "list_labels",
          description: "List all node labels in the Neo4j database",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "execute_cypher",
          description: "Execute a Cypher query on the Neo4j database",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Cypher query to execute" },
              parameters: { type: "object", description: "Query parameters" }
            },
            required: ["query"]
          }
        },
        {
          name: "show_schema",
          description: "Show the database schema including node labels, relationship types, and constraints",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        // Conversation Memory Tool
        {
          name: "conversation_memory",
          description: "Manage conversation memory - remember user context, store information, and identify users",
          inputSchema: {
            type: "object",
            properties: {
              user: { type: "string", default: "default_user" },
              action: { type: "string", enum: ["remember", "store", "identify", "store_message", "store_code", "get_history"] },
              data: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  entities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        type: { type: "string", enum: ["person", "project", "technology", "organization", "event", "goal", "preference"] },
                        observations: { type: "array", items: { type: "string" } }
                      }
                    }
                  },
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        from: { type: "string" },
                        to: { type: "string" },
                        type: { type: "string" }
                      }
                    }
                  }
                }
              }
            },
            required: ["action"]
          }
        },
        // Store Conversation Tool
        {
          name: "store_conversation",
          description: "Store conversation messages (both user and assistant) for future reference",
          inputSchema: {
            type: "object",
            properties: {
              user: { type: "string", default: "default_user" },
              messages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role: { type: "string", enum: ["user", "assistant"] },
                    content: { type: "string" },
                    timestamp: { type: "string" },
                    hasCode: { type: "boolean" }
                  },
                  required: ["role", "content"]
                }
              }
            },
            required: ["messages"]
          }
        },
        // Store Code Tool
        {
          name: "store_code",
          description: "Store code snippets with metadata and relationships to other entities",
          inputSchema: {
            type: "object",
            properties: {
              user: { type: "string", default: "default_user" },
              code: {
                type: "object",
                properties: {
                  content: { type: "string", description: "The code content" },
                  language: { type: "string", description: "Programming language" },
                  filename: { type: "string", description: "Optional filename" },
                  description: { type: "string", description: "What the code does" },
                  context: { type: "string", description: "Context or purpose of the code" }
                },
                required: ["content", "language"]
              },
              relatedTo: {
                type: "array",
                items: { type: "string" },
                description: "Entity names this code relates to"
              }
            },
            required: ["code"]
          }
        }
      ]
    };
  });

  // Tool call handler
  server.setRequestHandler(
    z.object({
      method: z.literal('tools/call'),
      params: z.object({
        name: z.string(),
        arguments: z.record(z.any()).optional()
      })
    }),
    async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      switch (name) {
        // Knowledge Graph Tools
        case "create_entities": {
          const validated = CreateEntitiesSchema.parse(args);
          const created = await storage.createEntities(validated.entities);
          return createSuccessResponse(
            `Created ${created.length} entities`,
            {
              created: created.map(e => e.name),
              ignored: validated.entities.length - created.length
            }
          );
        }

        case "create_relations": {
          const validated = CreateRelationsSchema.parse(args);
          const created = await storage.createRelations(validated.relations);
          return createSuccessResponse(
            `Created ${created.length} relations`,
            {
              created: created.map(r => `${r.from} -[${r.relationType}]-> ${r.to}`),
              skipped: validated.relations.length - created.length
            }
          );
        }

        case "add_observations": {
          const validated = AddObservationsSchema.parse(args);
          const observations = await storage.addObservations(validated.entity, validated.observations);
          return createSuccessResponse(
            `Added observations to ${validated.entity}`,
            { totalObservations: observations.length }
          );
        }

        case "delete_entities": {
          const validated = DeleteEntitiesSchema.parse(args);
          const count = await storage.deleteEntities(validated.entities);
          return createSuccessResponse(`Deleted ${count} entities`);
        }

        case "delete_relations": {
          const validated = DeleteRelationsSchema.parse(args);
          const count = await storage.deleteRelations(validated.relations);
          return createSuccessResponse(`Deleted ${count} relations`);
        }

        case "delete_observations": {
          const validated = DeleteObservationsSchema.parse(args);
          const remaining = await storage.deleteObservations(validated.entity, validated.observations);
          return createSuccessResponse(
            `Deleted observations from ${validated.entity}`,
            { remainingObservations: remaining.length }
          );
        }

        case "read_graph": {
          const graph = await storage.readGraph();
          return createSuccessResponse("Retrieved knowledge graph", graph);
        }

        case "search_nodes": {
          const validated = SearchNodesSchema.parse(args);
          const nodes = await storage.searchNodes(validated.query);
          return createSuccessResponse(
            `Found ${nodes.length} matching nodes`,
            { nodes }
          );
        }

        case "open_nodes": {
          const validated = OpenNodesSchema.parse(args);
          const result = await storage.openNodes(validated.names);
          return createSuccessResponse(
            `Retrieved ${result.entities.length} entities and ${result.relations.length} relations`,
            result
          );
        }

        // Neo4j Legacy Tools
        case "list_labels": {
          const result = await withNeo4j(env, async (session) => {
            const labelsResult = await session.run('CALL db.labels()');
            return labelsResult.records.map(record => record.get('label'));
          });
          return createSuccessResponse("Retrieved node labels", { labels: result });
        }

        case "execute_cypher": {
          const validated = ExecuteCypherSchema.parse(args);
          const result = await withNeo4j(env, async (session) => {
            const queryResult = await session.run(validated.query, validated.parameters || {});
            return {
              records: queryResult.records.map(record => record.toObject()),
              summary: {
                counters: queryResult.summary.counters,
                database: queryResult.summary.database.name,
                queryType: queryResult.summary.queryType
              }
            };
          });
          return createSuccessResponse("Query executed successfully", result);
        }

        case "show_schema": {
          const result = await withNeo4j(env, async (session) => {
            // Get node labels
            const labels = await session.run('CALL db.labels()');
            const nodeLabels = labels.records.map(r => r.get('label'));

            // Get relationship types
            const relTypes = await session.run('CALL db.relationshipTypes()');
            const relationshipTypes = relTypes.records.map(r => r.get('relationshipType'));

            // Get constraints
            const constraints = await session.run('SHOW CONSTRAINTS');
            const constraintsList = constraints.records.map(r => ({
              name: r.get('name'),
              type: r.get('type'),
              entityType: r.get('entityType'),
              labelsOrTypes: r.get('labelsOrTypes'),
              properties: r.get('properties')
            }));

            // Get indexes
            const indexes = await session.run('SHOW INDEXES');
            const indexesList = indexes.records.map(r => ({
              name: r.get('name'),
              type: r.get('type'),
              entityType: r.get('entityType'),
              labelsOrTypes: r.get('labelsOrTypes'),
              properties: r.get('properties'),
              state: r.get('state')
            }));

            return {
              nodeLabels,
              relationshipTypes,
              constraints: constraintsList,
              indexes: indexesList
            };
          });
          return createSuccessResponse("Database schema retrieved", result);
        }

        // Conversation Memory Tool
        case "conversation_memory": {
          const validated = ConversationMemorySchema.parse(args);
          const { user, action, data } = validated;

          switch (action) {
            case "remember": {
              // Retrieve user's context
              const userGraph = await storage.openNodes([user]);
              const relatedNames = new Set<string>();
              
              // Get all related entities
              const relatedResult = await withNeo4j(env, async (session) => {
                const result = await session.run(
                  `
                  MATCH (u:Entity {name: $user})-[:RELATED*1..2]-(related:Entity)
                  RETURN DISTINCT related.name as name
                  `,
                  { user }
                );
                return result.records.map(r => r.get('name'));
              });
              
              relatedResult.forEach(name => relatedNames.add(name));
              const allRelated = await storage.openNodes(Array.from(relatedNames));
              
              return createSuccessResponse("Retrieved user memory", {
                user: userGraph.entities[0] || null,
                relatedEntities: allRelated.entities,
                relations: [...userGraph.relations, ...allRelated.relations]
              });
            }

            case "store": {
              if (!data) {
                return createErrorResponse("No data provided to store");
              }

              const results = {
                entities: [] as string[],
                relations: [] as string[]
              };

              // Store entities
              if (data.entities && data.entities.length > 0) {
                const entities: Entity[] = data.entities.map(e => ({
                  name: e.name,
                  entityType: e.type,
                  observations: e.observations
                }));
                const created = await storage.createEntities(entities);
                results.entities = created.map(e => e.name);
              }

              // Store relationships
              if (data.relationships && data.relationships.length > 0) {
                const relations: Relation[] = data.relationships.map(r => ({
                  from: r.from,
                  to: r.to,
                  relationType: r.type
                }));
                const created = await storage.createRelations(relations);
                results.relations = created.map(r => `${r.from}->${r.to}`);
              }

              return createSuccessResponse("Stored conversation memory", results);
            }

            case "identify": {
              // Create or update user entity
              const userEntity: Entity = {
                name: user,
                entityType: "person",
                observations: [`Identified as user: ${user}`]
              };
              
              if (data?.message) {
                userEntity.observations.push(data.message);
              }
              
              await storage.createEntities([userEntity]);
              return createSuccessResponse(`User ${user} identified and stored`);
            }

            case "store_message": {
              if (!data?.message || !data?.role) {
                return createErrorResponse("Message and role are required");
              }
              
              const messageId = await storage.storeConversationMessage(
                user,
                data.role,
                data.message,
                data.message.includes('```') || data.message.includes('function') || data.message.includes('class')
              );
              
              return createSuccessResponse("Message stored", { messageId });
            }

            case "store_code": {
              if (!data?.code) {
                return createErrorResponse("Code data is required");
              }
              
              const codeId = await storage.storeCodeSnippet(
                user,
                data.code,
                data.entities?.map(e => e.name) || []
              );
              
              return createSuccessResponse("Code snippet stored", { codeId });
            }

            case "get_history": {
              const messages = await storage.getConversationHistory(user);
              const codeSnippets = await storage.getCodeSnippets(user);
              
              return createSuccessResponse("Retrieved conversation history", {
                messages,
                codeSnippets,
                messageCount: messages.length,
                codeCount: codeSnippets.length
              });
            }

            default:
              return createErrorResponse(`Unknown action: ${action}`);
          }
        }

        // Store Conversation Handler
        case "store_conversation": {
          const validated = StoreConversationSchema.parse(args);
          const messageIds = [];
          
          for (const message of validated.messages) {
            const messageId = await storage.storeConversationMessage(
              validated.user,
              message.role,
              message.content,
              message.hasCode || message.content.includes('```')
            );
            messageIds.push(messageId);
          }
          
          return createSuccessResponse(
            `Stored ${messageIds.length} messages`,
            { messageIds }
          );
        }

        // Store Code Handler
        case "store_code": {
          const validated = StoreCodeSchema.parse(args);
          const codeId = await storage.storeCodeSnippet(
            validated.user,
            validated.code,
            validated.relatedTo || []
          );
          
          return createSuccessResponse(
            "Code snippet stored successfully",
            { 
              codeId,
              language: validated.code.language,
              filename: validated.code.filename
            }
          );
        }

        default:
          return createErrorResponse(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`Error in tool ${name}:`, error);
      return createErrorResponse(
        error instanceof Error ? error.message : String(error)
      );
    }
  });
}