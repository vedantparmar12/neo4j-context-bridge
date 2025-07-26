import { z } from "zod";

// Environment configuration
export interface StandaloneEnv {
  NEO4J_URI: string;
  NEO4J_USER: string;
  NEO4J_PASSWORD: string;
  MAX_CONTEXT_TOKENS?: string;
  MAX_INJECTION_TOKENS?: string;
}

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