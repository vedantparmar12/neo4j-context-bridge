import * as Sentry from "@sentry/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Props } from "../types";
import { registerExtractionTools } from "./extraction-tools";
import { registerSearchTools } from "./search-tools";
import { registerManagementTools } from "./management-tools";
import { registerInjectionTools } from "./injection-tools";
import { z } from "zod";

/**
 * Extract parameters from MCP tool arguments for Sentry tracing
 */
function extractMcpParameters(args: any): Record<string, any> {
  const params: Record<string, any> = {};
  
  if (args && typeof args === 'object') {
    // Extract relevant parameters while avoiding sensitive data
    if ('query' in args) params.query = String(args.query).substring(0, 100);
    if ('chatId' in args) params.chatId = args.chatId;
    if ('projectId' in args) params.projectId = args.projectId;
    if ('contextType' in args) params.contextType = args.contextType;
    if ('limit' in args) params.limit = args.limit;
    if ('tokenBudget' in args) params.tokenBudget = args.tokenBudget;
    if ('format' in args) params.format = args.format;
    if ('maxDepth' in args) params.maxDepth = args.maxDepth;
    if ('relationshipTypes' in args) params.relationshipTypes = args.relationshipTypes;
    
    // Don't include actual content or sensitive data
    if ('content' in args) params.hasContent = true;
    if ('exportData' in args) params.hasExportData = true;
  }
  
  return params;
}

/**
 * Handle errors with Sentry integration
 */
function handleError(error: unknown): any {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const eventId = Sentry.captureException(error, {
    tags: {
      component: 'neo4j-mcp-tool',
    },
  });
  
  console.error('Tool execution failed:', errorMessage);
  
  return {
    content: [{
      type: "text",
      text: `**Error**\n\nOperation failed: ${errorMessage}\n\nError ID: ${eventId}`,
      isError: true
    }]
  };
}

/**
 * Wrap a tool handler with Sentry tracing and error handling
 */
function wrapWithSentry<T extends Record<string, any>>(
  toolName: string,
  handler: (args: T, extra?: any) => Promise<any>
): (args: T, extra?: any) => Promise<any> {
  return async (args: T, extra?: any) => {
    return await Sentry.startNewTrace(async () => {
      return await Sentry.startSpan({
        name: `mcp.tool/${toolName}`,
        op: 'mcp.tool',
        attributes: extractMcpParameters(args),
      }, async (span) => {
        try {
          const result = await handler(args, extra);
          span.setStatus({ code: 1 }); // ok
          return result;
        } catch (error) {
          span.setStatus({ code: 2 }); // error
          return handleError(error);
        }
      });
    });
  };
}

/**
 * Register a tool with Sentry instrumentation
 */
function registerToolWithSentry(
  server: McpServer,
  name: string,
  description: string,
  schema: any,
  handler: (args: any, extra?: any) => Promise<any>
) {
  server.tool(name, description, schema, wrapWithSentry(name, handler));
}

/**
 * Register all Neo4j MCP tools with Sentry monitoring
 */
export function registerNeo4jToolsWithSentry(server: McpServer, env: Env, props: Props) {
  console.log(`Registering Neo4j tools with Sentry monitoring for user: ${props.login}`);

  // Create a wrapped server that adds Sentry instrumentation
  const sentryServer = {
    tool: (name: string, description: string, schema: any, handler: (args: any, extra?: any) => Promise<any>) => {
      registerToolWithSentry(server, name, description, schema, handler);
    }
  } as McpServer;

  // Register all tool groups with Sentry instrumentation
  registerExtractionTools(sentryServer, env, props);
  registerSearchTools(sentryServer, env, props);
  registerManagementTools(sentryServer, env, props);
  registerInjectionTools(sentryServer, env, props);

  console.log('All Neo4j tools registered with Sentry monitoring successfully');
}