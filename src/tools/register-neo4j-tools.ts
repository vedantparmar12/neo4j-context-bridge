import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Props } from "../types";
import { registerExtractionTools } from "./extraction-tools";
import { registerSearchTools } from "./search-tools";
import { registerManagementTools } from "./management-tools";
import { registerInjectionTools } from "./injection-tools";

/**
 * Register all Neo4j context management tools
 */
export function registerNeo4jTools(server: McpServer, env: Env, props: Props) {
  console.log(`Registering Neo4j tools for user: ${props.login}`);
  
  registerExtractionTools(server, env, props);
  
  registerSearchTools(server, env, props);
  
  registerManagementTools(server, env, props);
  
  registerInjectionTools(server, env, props);
  
  console.log('All Neo4j tools registered successfully');
}