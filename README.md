# Neo4j MCP Server with Conversation Memory

A Model Context Protocol (MCP) server that provides persistent conversation memory and code storage using Neo4j graph database.

## Features

- 🧠 **Conversation Memory**: Automatically stores all conversations between users and AI assistants
- 💻 **Code Storage**: Detects and stores code snippets with metadata and relationships
- 🔍 **Knowledge Graph**: Creates entities and relationships from conversations
- 📊 **Search & Retrieval**: Find past conversations, code, and knowledge
- 🚀 **Easy Integration**: Works seamlessly with Claude Desktop and other MCP-compatible clients

### 🌟 Light RAG (NEW!)
- 🤖 **LLM-Powered Entity Extraction**: Uses Ollama for automatic entity and relationship extraction
- 🎯 **Dual-Level Retrieval**: Combines low-level (specific entities) and high-level (themes) search
- 🔗 **Multi-Hop Subgraph Analysis**: Understand complex relationships across multiple hops
- 📊 **Vector Similarity Search**: Semantic similarity using embeddings for better matches
- ⚡ **Incremental Learning**: Automatically updates knowledge graph from conversations
- 🎪 **Hybrid RAG**: Best of both graph and vector retrieval methods

## Prerequisites

- Node.js 18+ 
- Neo4j Database (local or cloud)
- **Ollama** (for Light RAG features) - [Install Ollama](https://ollama.ai/)
- Claude Desktop (or other MCP-compatible client)

### Quick Ollama Setup for Light RAG
```bash
# Install Ollama (if not already installed)
# Visit https://ollama.ai/ for installation instructions

# Pull required models
ollama pull llama3.2:latest          # Main LLM for extraction
ollama pull nomic-embed-text:latest  # Embedding model
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

4. Configure environment (recommended for production):
```bash
cp .env.example .env
# Edit .env with your configuration
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

#### Basic Configuration
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

#### Light RAG Configuration (Recommended)
```json
{
  "mcpServers": {
    "neo4j-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\neo4j-mcp\\dist\\standalone-server.js"],
      "env": {
        "NEO4J_URI": "neo4j+s://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-secure-password",
        "NEO4J_ENCRYPTED": "true",
        "MCP_API_KEY_REQUIRED": "true",
        "MCP_CLIENT_API_KEY": "your-api-key-here",
        "NODE_ENV": "production",
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "OLLAMA_MODEL": "llama3.2:latest",
        "OLLAMA_EMBEDDING_MODEL": "nomic-embed-text:latest",
        "LIGHTRAG_ENABLED": "true",
        "LIGHTRAG_AUTO_EXTRACTION": "true"
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

### 🌟 Light RAG Tools
- `lightrag_query` - Advanced hybrid retrieval using dual-level keyword extraction and vector similarity
- `lightrag_extract` - Extract entities and relationships from text using Ollama LLM
- `lightrag_analyze` - Deep analysis of entities with multi-hop subgraph exploration
- `lightrag_health` - Check Ollama connectivity and Light RAG system health
- `lightrag_auto_process` - Auto-process conversations for knowledge extraction

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

## 🌟 Light RAG Usage Examples

### Smart Query with Dual-Level Retrieval
```javascript
lightrag_query({
  query: "Show me Python projects related to machine learning",
  max_results: 15,
  include_subgraphs: true
})
```

### Automatic Entity Extraction
```javascript
lightrag_extract({
  text: "I'm working on a React project with TypeScript. It uses Redux for state management and connects to a PostgreSQL database.",
  user: "vedant",
  auto_store: true
})
```

### Deep Entity Analysis
```javascript
lightrag_analyze({
  entity_names: ["React", "TypeScript", "Redux"],
  max_hops: 3,
  include_context: true
})
```

### Automatic Conversation Processing
```javascript
lightrag_auto_process({
  user: "vedant",
  messages: [
    { role: "user", content: "I need help with my Flask API project" },
    { role: "assistant", content: "I can help you with Flask! What specific issues are you facing?" }
  ]
})
```

### Health Check
```javascript
lightrag_health({
  check_ollama: true,
  check_embeddings: true
})
```

## How It Works

### Traditional Knowledge Graph
The MCP server automatically:
1. Captures all conversation messages
2. Detects code in responses (via ``` markers)  
3. Creates a knowledge graph of entities and relationships
4. Stores everything in Neo4j for permanent access

### 🌟 Light RAG Enhancement
When Light RAG is enabled, the system additionally:
1. **LLM-Powered Extraction**: Uses Ollama to automatically identify entities, relationships, and their importance scores
2. **Dual-Level Processing**: 
   - **Low-Level**: Extracts specific entities (names, technologies, locations)
   - **High-Level**: Identifies broader themes and concepts
3. **Vector Embeddings**: Generates embeddings for semantic similarity search
4. **Multi-Hop Analysis**: Explores relationships across multiple degrees of connection
5. **Incremental Updates**: Continuously improves knowledge graph from new conversations
6. **Hybrid Retrieval**: Combines graph traversal with vector similarity for comprehensive results

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
