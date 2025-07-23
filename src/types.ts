import { z } from "zod";
import type { AuthRequest, OAuthHelpers, ClientInfo } from "@cloudflare/workers-oauth-provider";

// User context passed through OAuth
export type Props = {
  login: string;
  name: string;
  email: string;
  accessToken: string;
};

// Extended environment with OAuth provider
export type ExtendedEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

// OAuth URL construction parameters
export interface UpstreamAuthorizeParams {
  upstream_url: string;
  client_id: string;
  scope: string;
  redirect_uri: string;
  state?: string;
}

// OAuth token exchange parameters
export interface UpstreamTokenParams {
  code: string | undefined;
  upstream_url: string;
  client_secret: string;
  redirect_uri: string;
  client_id: string;
}

// Approval dialog configuration
export interface ApprovalDialogOptions {
  client: ClientInfo | null;
  server: {
    name: string;
    logo?: string;
    description?: string;
  };
  state: Record<string, any>;
  cookieName?: string;
  cookieSecret?: string | Uint8Array;
  cookieDomain?: string;
  cookiePath?: string;
  cookieMaxAge?: number;
}

// Result of parsing approval form
export interface ParsedApprovalResult {
  state: any;
  headers: Record<string, string>;
}

// MCP tool schemas using Zod
export const ListTablesSchema = {};

export const QueryDatabaseSchema = {
  sql: z
    .string()
    .min(1, "SQL query cannot be empty")
    .describe("SQL query to execute (SELECT queries only)"),
};

export const ExecuteDatabaseSchema = {
  sql: z
    .string()
    .min(1, "SQL command cannot be empty")
    .describe("SQL command to execute (INSERT, UPDATE, DELETE, CREATE, etc.)"),
};

// MCP response types
export interface McpTextContent {
  type: "text";
  text: string;
  isError?: boolean;
  [key: string]: any;
}

export interface McpResponse {
  content: McpTextContent[];
  [key: string]: any;
}

// Standard response creators
export function createSuccessResponse(message: string, data?: any): McpResponse {
  let text = `**Success**\n\n${message}`;
  if (data !== undefined) {
    text += `\n\n**Result:**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
  return {
    content: [{
      type: "text",
      text,
    }],
  };
}

export function createErrorResponse(message: string, details?: any): McpResponse {
  let text = `**Error**\n\n${message}`;
  if (details !== undefined) {
    text += `\n\n**Details:**\n\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``;
  }
  return {
    content: [{
      type: "text",
      text,
      isError: true,
    }],
  };
}

// Database operation result type
export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

// SQL validation result
export interface SqlValidationResult {
  isValid: boolean;
  error?: string;
}

// Context Management Types
export type ContextType = 'code' | 'decision' | 'requirement' | 'discussion' | 'error' | 'solution';

export interface ContextNode {
  id?: string;
  chat_id: string;
  project_id: string;
  timestamp: string;
  content_type: ContextType;
  summary: string;
  full_content: string;
  importance_score: number;
  embedding?: number[];
  tags?: string[];
  version?: number;
  parent_id?: string;
}

export interface ContextRelationship {
  type: 'references' | 'depends_on' | 'evolves_from' | 'related_to';
  weight: number;
}

// Context Management Schemas
export const StoreContextSchema = {
  chat_id: z.string().min(1, "Chat ID is required"),
  project_id: z.string().min(1, "Project ID is required"),
  content_type: z.enum(['code', 'decision', 'requirement', 'discussion', 'error', 'solution']),
  summary: z.string().min(1, "Summary is required"),
  full_content: z.string().min(1, "Content is required"),
  importance_score: z.number().min(0).max(10).optional().default(5),
  tags: z.array(z.string()).optional(),
  parent_id: z.string().optional(),
};

export const SearchContextSchema = {
  query: z.string().min(1, "Search query is required"),
  project_id: z.string().optional(),
  content_type: z.enum(['code', 'decision', 'requirement', 'discussion', 'error', 'solution']).optional(),
  limit: z.number().int().positive().optional(),
  use_semantic: z.boolean().default(true),
};

export const RetrieveContextSchema = {
  project_id: z.string().min(1, "Project ID is required"),
  chat_id: z.string().optional(),
  limit: z.number().int().positive().optional(),
  include_relationships: z.boolean().optional().default(true),
};

export const InjectContextSchema = {
  project_id: z.string().min(1, "Project ID is required"),
  current_prompt: z.string().min(1, "Current prompt is required"),
  max_tokens: z.number().int().positive().optional(),
  context_types: z.array(z.enum(['code', 'decision', 'requirement', 'discussion', 'error', 'solution'])).optional(),
};

// Re-export external types that are used throughout
export type { AuthRequest, OAuthHelpers, ClientInfo };