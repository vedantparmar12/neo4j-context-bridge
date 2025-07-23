# Knowledge Graph Memory Server

A Model Context Protocol (MCP) server that implements persistent memory using a local knowledge graph stored in Neo4j. This enables AI assistants like Claude to remember information about users across chat sessions.

## Overview

This MCP server provides a knowledge graph-based memory system that allows AI models to:
- Store information about entities (people, organizations, events, etc.)
- Create relationships between entities
- Add observations and facts about entities
- Search and retrieve stored knowledge
- Maintain context across conversations

## Core Features

### Knowledge Graph Tools

1. **create_entities** - Create multiple new entities in the knowledge graph
2. **create_relations** - Create relationships between entities
3. **add_observations** - Add observations to existing entities
4. **delete_entities** - Remove entities and their relations
5. **delete_observations** - Remove specific observations from entities
6. **delete_relations** - Remove specific relations
7. **read_graph** - Read the entire knowledge graph
8. **search_nodes** - Search for nodes based on query
9. **open_nodes** - Retrieve specific nodes by name

### Legacy Neo4j Tools

1. **listLabels** - Get all node labels and relationship types
2. **executeCypher** - Execute any Cypher statement
3. **showSchema** - Get detailed schema information

## Core Concepts

### Entities
Entities are the primary nodes in the knowledge graph. Each entity has:
- A unique name (identifier)
- An entity type (e.g., "person", "organization", "event")
- A list of observations

Example:
```json
{
  "name": "John_Smith",
  "entityType": "person",
  "observations": ["Speaks fluent Spanish", "Works at Anthropic"]
}
```

### Relations
Relations define directed connections between entities. They are always stored in active voice and describe how entities interact.

Example:
```json
{
  "from": "John_Smith",
  "to": "Anthropic",
  "relationType": "works_at"
}
```

### Observations
Observations are discrete pieces of information about an entity. They should be:
- Stored as strings
- Atomic (one fact per observation)
- Attached to specific entities

## Setup

### Prerequisites
- Neo4j database (local or cloud)
- GitHub account for OAuth
- Cloudflare account

### Configuration

1. Create a `.dev.vars` file with your Neo4j credentials:
```env
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
COOKIE_ENCRYPTION_KEY=your-32-char-key
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "knowledge-graph": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8792/mcp"],
      "env": {}
    }
  }
}
```

## Example Usage

### Creating Entities and Relations

```javascript
// Create entities
create_entities({
  entities: [
    {
      name: "Alice_Johnson",
      entityType: "person",
      observations: ["Software engineer", "Lives in San Francisco"]
    },
    {
      name: "TechCorp",
      entityType: "organization",
      observations: ["Founded in 2020", "Specializes in AI"]
    }
  ]
})

// Create a relationship
create_relations({
  relations: [{
    from: "Alice_Johnson",
    to: "TechCorp",
    relationType: "works_at"
  }]
})
```

### Searching the Knowledge Graph

```javascript
// Search for all entities related to "engineer"
search_nodes({ query: "engineer" })

// Open specific nodes
open_nodes({ names: ["Alice_Johnson", "TechCorp"] })
```

## Security

- GitHub OAuth authentication required for all operations
- Role-based access control for write operations
- SQL injection protection for Cypher queries
- Encrypted cookie-based session management

## Deployment

Deploy to Cloudflare Workers:

```bash
# Set production secrets
wrangler secret put NEO4J_URI
wrangler secret put NEO4J_USER
wrangler secret put NEO4J_PASSWORD
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY

# Deploy
wrangler deploy
```

## Architecture

- **Cloudflare Workers**: Serverless runtime
- **Durable Objects**: State management for MCP agents
- **Neo4j**: Graph database for knowledge storage
- **GitHub OAuth**: Authentication provider
- **MCP SDK**: Model Context Protocol implementation

## License

MIT