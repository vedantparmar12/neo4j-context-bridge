import { z } from "zod";

export enum ContextType {
  CODE = "code",
  DECISION = "decision",
  REQUIREMENT = "requirement",
  DISCUSSION = "discussion",
  ERROR = "error"
}

export enum RelationshipType {
  REFERENCES = "REFERENCES",
  EVOLVES_TO = "EVOLVES_TO",
  DEPENDS_ON = "DEPENDS_ON",
  RELATED_TO = "RELATED_TO",
  IMPLEMENTS = "IMPLEMENTS",
  BELONGS_TO = "BELONGS_TO"
}

export const ContextNodeSchema = z.object({
  id: z.string().describe("Unique identifier for the context node"),
  chatId: z.string().describe("ID of the chat this context belongs to"),
  projectId: z.string().describe("ID of the project this context belongs to"),
  content: z.string().describe("The actual content of the context"),
  summary: z.string().optional().describe("Summarized version for token efficiency"),
  contextType: z.nativeEnum(ContextType).describe("Type of context content"),
  importanceScore: z.number().min(0).max(1).describe("Relevance score between 0 and 1"),
  timestamp: z.string().describe("ISO date string when context was created"),
  tokenCount: z.number().int().positive().describe("Number of tokens in the content"),
  isSummarized: z.boolean().describe("Whether content has been summarized"),
  embedding: z.array(z.number()).optional().describe("Vector embedding for semantic search"),
  metadata: z.record(z.any()).optional().describe("Additional metadata (e.g., language for code)")
});

export type ContextNode = z.infer<typeof ContextNodeSchema>;

export const RelationshipSchema = z.object({
  fromId: z.string().describe("Source node ID"),
  toId: z.string().describe("Target node ID"),
  type: z.nativeEnum(RelationshipType).describe("Type of relationship"),
  properties: z.record(z.any()).optional().describe("Additional relationship properties")
});

export type Relationship = z.infer<typeof RelationshipSchema>;

export const ChatNodeSchema = z.object({
  id: z.string().describe("Unique chat identifier"),
  projectId: z.string().describe("Project this chat belongs to"),
  title: z.string().describe("Chat title or summary"),
  createdAt: z.string().describe("ISO date string when chat was created"),
  updatedAt: z.string().describe("ISO date string when chat was last updated"),
  userId: z.string().describe("GitHub username who created the chat"),
  tokenCount: z.number().int().describe("Total tokens in this chat"),
  contextCount: z.number().int().describe("Number of contexts extracted")
});

export type ChatNode = z.infer<typeof ChatNodeSchema>;

export const SearchResultSchema = z.object({
  context: ContextNodeSchema,
  score: z.number().min(0).max(1).describe("Similarity score"),
  chatTitle: z.string().describe("Title of the chat containing this context"),
  highlights: z.array(z.string()).optional().describe("Highlighted snippets")
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const ExtractContextInputSchema = z.object({
  content: z.string().min(1).describe("Chat content to extract contexts from"),
  chatId: z.string().describe("ID of the current chat"),
  projectId: z.string().describe("ID of the current project"),
  maxContexts: z.number().int().positive().default(50).describe("Maximum contexts to extract")
});

export const SearchContextInputSchema = z.object({
  query: z.string().min(1).describe("Search query text"),
  contextTypes: z.array(z.nativeEnum(ContextType)).optional().describe("Filter by context types"),
  limit: z.number().int().positive().min(1).max(20).default(5).describe("Maximum results to return"),
  projectId: z.string().optional().describe("Filter by project ID"),
  useSemanticSearch: z.boolean().default(true).describe("Use vector similarity search")
});

export const InjectContextInputSchema = z.object({
  query: z.string().describe("Query to find relevant contexts"),
  maxTokens: z.number().int().positive().default(2000).describe("Maximum tokens to inject"),
  projectId: z.string().optional().describe("Filter by project ID"),
  format: z.enum(["full", "summary", "reference"]).default("full").describe("How to format injected contexts")
});

export const ManageRelationshipInputSchema = z.object({
  fromId: z.string().describe("Source context node ID"),
  toId: z.string().describe("Target context node ID"),
  type: z.nativeEnum(RelationshipType).describe("Type of relationship"),
  action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
  properties: z.record(z.any()).optional().describe("Relationship properties")
});

export const VisualizeGraphInputSchema = z.object({
  projectId: z.string().optional().describe("Project to visualize"),
  chatId: z.string().optional().describe("Specific chat to visualize"),
  depth: z.number().int().positive().max(3).default(2).describe("Graph traversal depth"),
  format: z.enum(["mermaid", "graphviz", "json"]).default("mermaid").describe("Output format")
});

export const GetEvolutionInputSchema = z.object({
  contextId: z.string().describe("Context ID to track evolution for"),
  depth: z.number().int().positive().max(10).default(5).describe("How many evolution steps to follow")
});

export const ListChatsInputSchema = z.object({
  projectId: z.string().optional().describe("Filter by project ID"),
  limit: z.number().int().positive().max(50).default(20).describe("Maximum chats to return"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset")
});

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
  connectionTimeout?: number;
  maxTransactionRetryTime?: number;
}

export interface EmbeddingConfig {
  model: string;
  cacheNamespace: KVNamespace;
  cacheTtl: number;
}

export interface ContextExtractionResult {
  contexts: ContextNode[];
  relationships: Relationship[];
  totalTokens: number;
  extractionTime: number;
}

export interface GraphVisualization {
  format: "mermaid" | "graphviz" | "json";
  content: string;
  nodeCount: number;
  edgeCount: number;
}

export interface EvolutionChain {
  contexts: ContextNode[];
  relationships: Relationship[];
  totalEvolutions: number;
}