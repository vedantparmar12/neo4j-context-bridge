import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  Props, 
  createErrorResponse,
  createSuccessResponse
} from "../types";
import {
  CreateEntitiesSchema,
  CreateRelationsSchema,
  AddObservationsSchema,
  DeleteEntitiesSchema,
  DeleteObservationsSchema,
  DeleteRelationsSchema,
  ReadGraphSchema,
  SearchNodesSchema,
  OpenNodesSchema
} from "../types/knowledge-graph";
import { KnowledgeGraphStorage } from "../knowledge-graph/storage";

export function registerKnowledgeGraphTools(server: McpServer, env: Env, props: Props) {
  const storage = new KnowledgeGraphStorage(env);

  // Tool 1: Create Entities
  server.tool(
    "create_entities",
    "Create multiple new entities in the knowledge graph. Ignores entities with existing names.",
    CreateEntitiesSchema,
    async ({ entities }) => {
      try {
        const created = await storage.createEntities(entities);
        
        return createSuccessResponse(
          `Created ${created.length} entities`,
          {
            created: created.map(e => e.name),
            ignored: entities.length - created.length
          }
        );
      } catch (error) {
        console.error('create_entities error:', error);
        return createErrorResponse(
          `Failed to create entities: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool 2: Create Relations
  server.tool(
    "create_relations",
    "Create multiple new relations between entities. Skips duplicate relations.",
    CreateRelationsSchema,
    async ({ relations }) => {
      try {
        const created = await storage.createRelations(relations);
        
        return createSuccessResponse(
          `Created ${created.length} relations`,
          {
            created: created.map(r => `${r.from} -[${r.relationType}]-> ${r.to}`),
            skipped: relations.length - created.length
          }
        );
      } catch (error) {
        console.error('create_relations error:', error);
        return createErrorResponse(
          `Failed to create relations: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool 3: Add Observations
  server.tool(
    "add_observations",
    "Add new observations to existing entities. Fails if entity doesn't exist.",
    AddObservationsSchema,
    async ({ observations }) => {
      try {
        const added = await storage.addObservations(observations);
        
        return createSuccessResponse(
          `Added observations to ${Object.keys(added).length} entities`,
          added
        );
      } catch (error) {
        console.error('add_observations error:', error);
        return createErrorResponse(
          `Failed to add observations: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool 4: Delete Entities
  server.tool(
    "delete_entities",
    "Remove entities and their relations from the knowledge graph.",
    DeleteEntitiesSchema,
    async ({ entityNames }) => {
      try {
        await storage.deleteEntities(entityNames);
        
        return createSuccessResponse(
          `Deleted ${entityNames.length} entities and their relations`,
          { deleted: entityNames }
        );
      } catch (error) {
        console.error('delete_entities error:', error);
        return createErrorResponse(
          `Failed to delete entities: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool 5: Delete Observations
  server.tool(
    "delete_observations",
    "Remove specific observations from entities.",
    DeleteObservationsSchema,
    async ({ deletions }) => {
      try {
        await storage.deleteObservations(deletions);
        
        return createSuccessResponse(
          `Deleted observations from ${deletions.length} entities`,
          {
            entities: deletions.map(d => d.entityName),
            totalObservations: deletions.reduce((sum, d) => sum + d.observations.length, 0)
          }
        );
      } catch (error) {
        console.error('delete_observations error:', error);
        return createErrorResponse(
          `Failed to delete observations: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool 6: Delete Relations
  server.tool(
    "delete_relations",
    "Remove specific relations from the knowledge graph.",
    DeleteRelationsSchema,
    async ({ relations }) => {
      try {
        await storage.deleteRelations(relations);
        
        return createSuccessResponse(
          `Deleted ${relations.length} relations`,
          {
            deleted: relations.map(r => `${r.from} -[${r.relationType}]-> ${r.to}`)
          }
        );
      } catch (error) {
        console.error('delete_relations error:', error);
        return createErrorResponse(
          `Failed to delete relations: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool 7: Read Graph
  server.tool(
    "read_graph",
    "Read the entire knowledge graph, returning all entities and relations.",
    ReadGraphSchema,
    async () => {
      try {
        const graph = await storage.readGraph();
        
        return createSuccessResponse(
          `Retrieved knowledge graph`,
          {
            entities: Array.from(graph.entities.values()),
            relations: graph.relations,
            stats: {
              totalEntities: graph.entities.size,
              totalRelations: graph.relations.length
            }
          }
        );
      } catch (error) {
        console.error('read_graph error:', error);
        return createErrorResponse(
          `Failed to read graph: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool 8: Search Nodes
  server.tool(
    "search_nodes",
    "Search for nodes based on query matching entity names, types, or observation content.",
    SearchNodesSchema,
    async ({ query }) => {
      try {
        const results = await storage.searchNodes(query);
        
        return createSuccessResponse(
          `Found ${results.entities.length} entities matching "${query}"`,
          {
            entities: results.entities,
            relations: results.relations,
            stats: {
              totalEntities: results.entities.length,
              totalRelations: results.relations.length
            }
          }
        );
      } catch (error) {
        console.error('search_nodes error:', error);
        return createErrorResponse(
          `Failed to search nodes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool 9: Open Nodes
  server.tool(
    "open_nodes",
    "Retrieve specific nodes by name and relations between them.",
    OpenNodesSchema,
    async ({ names }) => {
      try {
        const results = await storage.openNodes(names);
        
        return createSuccessResponse(
          `Retrieved ${results.entities.length} entities`,
          {
            entities: results.entities,
            relations: results.relations,
            requested: names,
            found: results.entities.map(e => e.name),
            notFound: names.filter(n => !results.entities.find(e => e.name === n))
          }
        );
      } catch (error) {
        console.error('open_nodes error:', error);
        return createErrorResponse(
          `Failed to open nodes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}