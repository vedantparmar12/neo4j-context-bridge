import * as Sentry from "@sentry/cloudflare";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Props } from "./types";
import { GitHubHandler } from "./auth/github-handler";
import { closeNeo4jDriver, ensureIndexes, createVectorIndex, testNeo4jConnection } from "./neo4j/connection";
import { registerNeo4jToolsWithSentry } from "./tools/register-neo4j-tools-sentry";

// Sentry configuration helper
function getSentryConfig(env: Env) {
  return {
    // You can disable Sentry by setting SENTRY_DSN to a falsey-value
    dsn: (env as any).SENTRY_DSN,
    // A sample rate of 1.0 means "capture all traces"
    tracesSampleRate: 1,
    // Optionally include environment
    environment: (env as any).NODE_ENV || 'development',
  };
}

export class Neo4jContextMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "Neo4j Context Manager",
    version: "1.0.0",
  });

  /**
   * Cleanup Neo4j connections when Durable Object is shutting down
   */
  async cleanup(): Promise<void> {
    try {
      await closeNeo4jDriver();
      console.log('Neo4j driver closed successfully');
    } catch (error) {
      console.error('Error during Neo4j cleanup:', error);
      Sentry.captureException(error);
    }
  }

  /**
   * Durable Objects alarm handler - used for cleanup
   */
  async alarm(): Promise<void> {
    await this.cleanup();
  }

  async init() {
    // Initialize Sentry
    const sentryConfig = getSentryConfig(this.env);
    if (sentryConfig.dsn) {
      // @ts-ignore - Sentry.init exists but types may not be complete
      Sentry.init(sentryConfig);
    }

    console.log(`Initializing Neo4j Context MCP for user: ${this.props.login}`);
    
    // Set user context for Sentry
    Sentry.setUser({
      username: this.props.login,
      email: this.props.email,
    });

    return await Sentry.startSpan({
      name: 'neo4j.mcp.init',
      op: 'initialization',
    }, async () => {
      try {
        const isConnected = await testNeo4jConnection(this.env);
        if (!isConnected) {
          const error = new Error('Neo4j connection failed');
          Sentry.captureException(error);
          throw error;
        }
        
        console.log('Neo4j connection established successfully');
        
        await ensureIndexes(this.env);
        console.log('Neo4j indexes ensured');
        
        await createVectorIndex(this.env);
        console.log('Neo4j vector index created/verified');
        
        // Register all tools with Sentry instrumentation
        registerNeo4jToolsWithSentry(this.server, this.env, this.props);
        
        console.log('Neo4j Context MCP initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Neo4j Context MCP:', error);
        Sentry.captureException(error, {
          tags: {
            component: 'neo4j-mcp-init',
            user: this.props.login,
          },
        });
        throw error;
      }
    });
  }
}

export default new OAuthProvider({
  apiHandlers: {
    '/sse': Neo4jContextMCP.serveSSE('/sse') as any,
    '/mcp': Neo4jContextMCP.serve('/mcp') as any,
  },
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: GitHubHandler as any,
  tokenEndpoint: "/token",
});