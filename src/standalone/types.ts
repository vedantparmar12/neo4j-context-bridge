import { z } from "zod";
import { Config } from './config.js';

// Re-export Config type for backwards compatibility
export type StandaloneEnv = Config;

// Tool response helpers
export function createSuccessResponse(message: string, data?: any) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, message, ...data }, null, 2)
      }
    ]
  };
}

export function createErrorResponse(error: string) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: false, error }, null, 2)
      }
    ],
    isError: true
  };
}

// Knowledge Graph Types
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

// Zod Schemas for Knowledge Graph Tools
export const CreateEntitiesSchema = z.object({
  entities: z.array(z.object({
    name: z.string().describe("Unique name identifier for the entity"),
    entityType: z.string().describe("Type of entity (e.g., person, project, technology)"),
    observations: z.array(z.string()).describe("List of observations about the entity")
  })).describe("Array of entities to create")
});

export const CreateRelationsSchema = z.object({
  relations: z.array(z.object({
    from: z.string().describe("Name of the source entity"),
    to: z.string().describe("Name of the target entity"),
    relationType: z.string().describe("Type of relationship (e.g., 'WORKS_ON', 'KNOWS', 'USES')")
  })).describe("Array of relations to create")
});

export const AddObservationsSchema = z.object({
  entity: z.string().describe("Name of the entity"),
  observations: z.array(z.string()).describe("New observations to add")
});

export const DeleteEntitiesSchema = z.object({
  entities: z.array(z.string()).describe("Names of entities to delete")
});

export const DeleteRelationsSchema = z.object({
  relations: z.array(z.object({
    from: z.string(),
    to: z.string(),
    relationType: z.string()
  })).describe("Relations to delete")
});

export const DeleteObservationsSchema = z.object({
  entity: z.string().describe("Entity name"),
  observations: z.array(z.string()).describe("Observations to delete")
});

export const ReadGraphSchema = z.object({});

export const SearchNodesSchema = z.object({
  query: z.string().describe("Search query")
});

export const OpenNodesSchema = z.object({
  names: z.array(z.string()).describe("Entity names to retrieve")
});

// Neo4j Legacy Tool Schemas
export const ListLabelsSchema = z.object({});

export const ExecuteCypherSchema = z.object({
  query: z.string().describe("Cypher query to execute"),
  parameters: z.record(z.any()).optional().describe("Query parameters")
});

export const ShowSchemaSchema = z.object({});

// Conversation Memory Schema
export const ConversationMemorySchema = z.object({
  user: z.string().default("default_user"),
  action: z.enum(["remember", "store", "identify", "store_message", "store_code", "get_history"]),
  data: z.object({
    message: z.string().optional(),
    code: z.object({
      content: z.string(),
      language: z.string().optional(),
      filename: z.string().optional(),
      description: z.string().optional()
    }).optional(),
    entities: z.array(z.object({
      name: z.string(),
      type: z.enum(["person", "project", "technology", "organization", "event", "goal", "preference", "code_snippet", "conversation"]),
      observations: z.array(z.string())
    })).optional(),
    relationships: z.array(z.object({
      from: z.string(),
      to: z.string(),
      type: z.string()
    })).optional(),
    role: z.enum(["user", "assistant"]).optional(),
    timestamp: z.string().optional()
  }).optional()
});

// Store Conversation Schema
export const StoreConversationSchema = z.object({
  user: z.string().default("default_user"),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    timestamp: z.string().optional(),
    hasCode: z.boolean().optional()
  }))
});

// Store Code Schema
export const StoreCodeSchema = z.object({
  user: z.string().default("default_user"),
  code: z.object({
    content: z.string(),
    language: z.string(),
    filename: z.string().optional(),
    description: z.string().optional(),
    context: z.string().optional()
  }),
  relatedTo: z.array(z.string()).optional()
});

// Light RAG Enhanced Types
export interface LightRAGEntity extends Entity {
  embedding?: number[];
  importance_score?: number;
  creation_context?: string;
  keywords?: string[];
}

export interface LightRAGRelation extends Relation {
  strength_score: number;
  description: string;
  keywords: string[];
}

export interface QueryContext {
  low_level_keywords: string[];
  high_level_keywords: string[];
  query_embedding: number[];
}

export interface RetrievalResult {
  entities: LightRAGEntity[];
  relations: LightRAGRelation[];
  relevance_scores: Record<string, number>;
  subgraphs: Array<{
    entities: LightRAGEntity[];
    relations: LightRAGRelation[];
    score: number;
  }>;
}

// Light RAG Tool Schemas
export const LightRAGQuerySchema = z.object({
  query: z.string().describe("Natural language query for Light RAG retrieval"),
  max_results: z.number().optional().default(20).describe("Maximum number of results to return"),
  include_subgraphs: z.boolean().optional().default(true).describe("Include subgraph analysis"),
  similarity_threshold: z.number().optional().describe("Override default similarity threshold")
});

export const LightRAGExtractSchema = z.object({
  text: z.string().describe("Text to extract entities and relations from"),
  user: z.string().default("default_user").describe("User context for extraction"),
  auto_store: z.boolean().optional().default(true).describe("Automatically store extracted entities")
});

export const LightRAGAnalyzeSchema = z.object({
  entity_names: z.array(z.string()).describe("Entity names to analyze"),
  max_hops: z.number().optional().default(3).describe("Maximum relationship hops for analysis"),
  include_context: z.boolean().optional().default(true).describe("Include creation context")
});

export const LightRAGHealthSchema = z.object({
  check_ollama: z.boolean().optional().default(true).describe("Check Ollama service health"),
  check_embeddings: z.boolean().optional().default(true).describe("Check embedding capabilities")
});