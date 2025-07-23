import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Props } from "../types";
import { registerKnowledgeGraphTools } from "./knowledge-graph-tools";
import { registerNeo4jLegacyTools } from "./neo4j-legacy-tools";

/**
 * Register all MCP tools based on user permissions
 */
export function registerAllTools(server: McpServer, env: Env, props: Props) {
	// Register Knowledge Graph Memory tools
	registerKnowledgeGraphTools(server, env, props);
	
	// Register legacy Neo4j tools (listLabels, executeCypher, showSchema)
	registerNeo4jLegacyTools(server, env, props);
}