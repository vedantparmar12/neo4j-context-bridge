# Neo4j MCP Server with Conversation Memory

A Model Context Protocol (MCP) server that provides persistent conversation memory and code storage using Neo4j graph database.

## Features

- 🧠 **Conversation Memory**: Automatically stores all conversations between users and AI assistants
- 💻 **Code Storage**: Detects and stores code snippets with metadata and relationships
- 🔍 **Knowledge Graph**: Creates entities and relationships from conversations
- 📊 **Search & Retrieval**: Find past conversations, code, and knowledge
- 🚀 **Easy Integration**: Works seamlessly with Claude Desktop and other MCP-compatible clients

## Prerequisites

- Node.js 18+ 
- Neo4j Database (local or cloud)
- Claude Desktop (or other MCP-compatible client)

- In setting of Claude desktop add this in Profile section
- What personal preferences should Claude consider in responses?Beta
Your preferences will apply to all conversations, within Anthropic’s guidelines. Learn about preferences

```

Follow these steps for each interaction:

1. User Identification:
   - You should assume that you are interacting with default_user
   - If you have not identified default_user, proactively try to do so.

2. Memory Retrieval:
   - Always begin your chat by saying only "Remembering..." and retrieve all relevant information from your knowledge graph
   - Always refer to your knowledge graph as your "memory"

3. Memory
   - While conversing with the user, be attentive to any new information that falls into these categories:
     a) Basic Identity (age, gender, location, job title, education level, etc.)
     b) Behaviors (interests, habits, etc.)
     c) Preferences (communication style, preferred language, etc.)
     d) Goals (goals, targets, aspirations, etc.)
     e) Relationships (personal and professional relationships up to 3 degrees of separation)

4. Memory Update:
   - If any new information was gathered during the interaction, update your memory as follows:
     a) Create entities for recurring organizations, people, and significant events
     b) Connect them to the current entities using relations
     c) Store facts about them as observations

```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/neo4j-mcp.git
cd neo4j-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the server:
```bash
npm run build
```

## Configuration

### Neo4j Setup

1. Install Neo4j Desktop or use Neo4j Aura (cloud)
2. Create a new database
3. Note your connection details:
   - URI (e.g., `neo4j://localhost:7687`)
   - Username (default: `neo4j`)
   - Password

### Claude Desktop Configuration

Create or update your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "neo4j-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\neo4j-mcp\\dist\\standalone-server.js"],
      "env": {
        "NEO4J_URI": "neo4j://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-password"
      }
    }
  }
}
```

## Available Tools

### Knowledge Graph Tools
- `create_entities` - Create entities with observations
- `create_relations` - Create relationships between entities
- `add_observations` - Add observations to existing entities
- `delete_entities` - Remove entities from the graph
- `delete_relations` - Remove specific relationships
- `delete_observations` - Remove observations from entities
- `read_graph` - Read the entire knowledge graph
- `search_nodes` - Search for nodes by name, type, or observations
- `open_nodes` - Get specific nodes and their relationships

### Conversation Memory Tools
- `conversation_memory` - Main tool for memory operations
  - Actions: `remember`, `store`, `identify`, `store_message`, `store_code`, `get_history`
- `store_conversation` - Store entire conversations with messages
- `store_code` - Store code snippets with metadata and relationships

### Neo4j Tools
- `list_labels` - List all node labels in the database
- `execute_cypher` - Execute custom Cypher queries
- `show_schema` - Display database schema, constraints, and indexes

## Usage Examples

### Storing a Conversation

```javascript
store_conversation({
  user: "vedant",
  messages: [
    {
      role: "user",
      content: "How do I create a REST API in Python?"
    },
    {
      role: "assistant",
      content: "Here's how to create a REST API using Flask...",
      hasCode: true
    }
  ]
})
```

### Storing Code

```javascript
store_code({
  user: "vedant",
  code: {
    content: "from flask import Flask\napp = Flask(__name__)",
    language: "python",
    filename: "app.py",
    description: "Basic Flask application setup"
  },
  relatedTo: ["Flask", "Python", "REST API"]
})
```

### Retrieving History

```javascript
conversation_memory({
  user: "vedant",
  action: "get_history"
})
```

## How It Works

The MCP server automatically:
1. Captures all conversation messages
2. Detects code in responses (via ``` markers)
3. Creates a knowledge graph of entities and relationships
4. Stores everything in Neo4j for permanent access

## Development

### Project Structure

```
src/
├── standalone-server.ts       # Main server entry point
└── standalone/
    ├── types.ts              # TypeScript types and schemas
    ├── neo4j-connection.ts   # Neo4j connection management
    ├── knowledge-graph-storage.ts  # Graph operations
    └── register-tools.ts     # MCP tool registration
```

### Running in Development

```bash
npm run dev
```

### Building

```bash
npm run build
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
