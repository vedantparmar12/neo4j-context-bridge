import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Props } from "./types";
import { GitHubHandler } from "./auth/github-handler";
import { closeNeo4jDriver, ensureIndexes, createVectorIndex, testNeo4jConnection } from "./neo4j/connection";
import { registerNeo4jTools } from "./tools/register-neo4j-tools";

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
    }
  }

  /**
   * Durable Objects alarm handler - used for cleanup
   */
  async alarm(): Promise<void> {
    await this.cleanup();
  }

  async init() {
    console.log(`Initializing Neo4j Context MCP for user: ${this.props.login}`);
    
    try {
      const isConnected = await testNeo4jConnection(this.env);
      if (!isConnected) {
        console.error('Failed to connect to Neo4j database');
        throw new Error('Neo4j connection failed');
      }
      
      console.log('Neo4j connection established successfully');
      
      await ensureIndexes(this.env);
      console.log('Neo4j indexes ensured');
      
      await createVectorIndex(this.env);
      console.log('Neo4j vector index created/verified');
      
    } catch (error) {
      console.error('Neo4j initialization failed:', error);
      throw error;
    }
    
    registerNeo4jTools(this.server, this.env, this.props);
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