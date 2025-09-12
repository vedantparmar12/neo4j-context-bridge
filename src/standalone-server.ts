#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./standalone/register-tools.js";
import { configManager } from "./standalone/config.js";
import { wrapWithAuth } from "./standalone/auth-middleware.js";
import { testNeo4jConnection } from "./standalone/neo4j-connection.js";

// Create MCP server
const server = new Server(
  {
    name: "neo4j-mcp-standalone",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Error handling
server.onerror = (error) => {
  console.error("[MCP Error]", error);
};

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
async function main() {
  try {
    // Load and validate configuration
    const config = configManager.loadConfig();
    
    console.error("Starting Neo4j MCP Standalone Server...");
    console.error(`Environment: ${config.NODE_ENV}`);
    console.error(`Neo4j URI: ${config.NEO4J_URI}`);
    console.error(`Neo4j User: ${config.NEO4J_USER}`);
    console.error(`Encryption: ${config.NEO4J_ENCRYPTED ? 'Enabled' : 'Disabled'}`);
    console.error(`API Key Required: ${config.MCP_API_KEY_REQUIRED ? 'Yes' : 'No'}`);
    
    // Test Neo4j connection before proceeding
    console.error("Testing Neo4j connection...");
    const connectionTest = await testNeo4jConnection(config);
    if (!connectionTest) {
      throw new Error("Failed to connect to Neo4j database");
    }
    
    // Wrap server with authentication if enabled
    if (config.MCP_API_KEY_REQUIRED) {
      console.error("Enabling API key authentication...");
      wrapWithAuth(server, config);
    }
    
    // Register all tools with validated config
    console.error("Registering tools...");
    registerAllTools(server, config);
    console.error("All tools registered successfully");
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Neo4j MCP Server is running on stdio");
    
    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error("Shutting down gracefully...");
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error("Shutting down gracefully...");
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});