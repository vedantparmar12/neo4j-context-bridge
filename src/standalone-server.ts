#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./standalone/register-tools.js";

// Environment configuration
const env = {
  NEO4J_URI: process.env.NEO4J_URI || "neo4j://127.0.0.1:7687",
  NEO4J_USER: process.env.NEO4J_USER || "neo4j",
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || "vedant1234",
  MAX_CONTEXT_TOKENS: process.env.MAX_CONTEXT_TOKENS || "2000",
  MAX_INJECTION_TOKENS: process.env.MAX_INJECTION_TOKENS || "1000",
};

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

// Register all tools
console.error("Registering tools...");
try {
  registerAllTools(server, env);
  console.error("All tools registered successfully");
} catch (error) {
  console.error("Error registering tools:", error);
  throw error;
}

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
  console.error("Starting Neo4j MCP Standalone Server...");
  console.error(`Neo4j URI: ${env.NEO4J_URI}`);
  console.error(`Neo4j User: ${env.NEO4J_USER}`);
  
  try {
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