# Neo4j MCP Server with Conversation Memory

A Model Context Protocol (MCP) server that provides persistent conversation memory and code storage using Neo4j graph database.

## Features

- 🧠 **Conversation Memory**: Automatically stores all conversations between users and AI assistants
- 💻 **Code Storage**: Detects and stores code snippets with metadata and relationships
- 🔍 **Knowledge Graph**: Creates entities and relationships from conversations
- 📊 **Search & Retrieval**: Find past conversations, code, and knowledge
- 🚀 **Easy Integration**: Works seamlessly with Claude Desktop and other MCP-compatible clients

## 🏗️ Architecture

### Core Components

```
neo4j-context-bridge/
├── src/
│   ├── standalone-server.ts          # Main MCP server entry point
│   └── standalone/
│       ├── knowledge-graph-storage.ts # Core knowledge graph operations
│       ├── neo4j-connection.ts       # Database connection management
│       ├── register-tools.ts         # MCP tool registration & handlers
│       └── types.ts                 # TypeScript type definitions
├── CONVERSATION_MEMORY_GUIDE.md     # Memory management documentation
├── CONVERSATION_STORAGE_GUIDE.md    # Storage architecture guide
├── claude_desktop_config.json       # Claude Desktop configuration
└── WORKING.md                      # Development notes and workflows
```
### Technology Stack

- **Database**: Neo4j Graph Database
- **Runtime**: Node.js with TypeScript
- **Protocol**: Model Context Protocol (MCP)
- **Validation**: Zod schema validation
- **Driver**: Neo4j JavaScript Driver

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

5. Data Operations
- **CRUD Operations**: Complete Create, Read, Update, Delete functionality
- **Graph Queries**: Advanced Cypher query support
- **Batch Processing**: Efficient bulk operations
- **Schema Validation**: Type-safe data operations with Zod

```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/vedantparmar12/neo4j-context-bridge.git
cd neo4j-context-bridge
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

## 📋 API Reference

### Entity Operations

#### Create Entity
```typescript
interface CreateEntityParams {
  type: string;
  properties: Record<string, any>;
  labels?: string[];
}
```

#### Retrieve Entity
```typescript
interface RetrieveEntityParams {
  id?: string;
  type?: string;
  properties?: Record<string, any>;
}
```

### Relationship Operations

#### Create Relationship
```typescript
interface CreateRelationshipParams {
  fromEntityId: string;
  toEntityId: string;
  type: string;
  properties?: Record<string, any>;
}
```

### Query Operations

#### Execute Cypher Query
```typescript
interface CypherQueryParams {
  query: string;
  parameters?: Record<string, any>;
}
```

## 🔧 Usage Examples

### Basic Entity Creation
```typescript
// Create a person entity
const person = await createEntity({
  type: "Person",
  properties: {
    name: "John Doe",
    age: 30,
    email: "john@example.com"
  },
  labels: ["User", "Person"]
});
```

### Creating Relationships
```typescript
// Connect two entities
await createRelationship({
  fromEntityId: personId,
  toEntityId: companyId,
  type: "WORKS_FOR",
  properties: {
    since: "2023-01-01",
    role: "Developer"
  }
});
```

### Querying the Graph
```typescript
// Find all connections for a person
const connections = await executeCypherQuery({
  query: `
    MATCH (p:Person {name: $name})-[r]->(connected)
    RETURN p, r, connected
  `,
  parameters: { name: "John Doe" }
});
```

## 🧠 Memory Management

### Conversation Context
The system maintains conversation context through:
- **Session Tracking**: Unique session identifiers
- **Temporal Relationships**: Time-based entity connections
- **Context Graphs**: Hierarchical context structures

### Memory Retrieval Strategies
1. **Recency-based**: Recent interactions prioritized
2. **Relevance-based**: Semantic similarity matching
3. **Relationship-based**: Connected entity traversal

## 🚀 Deployment

### Standalone Deployment
```bash
# Production build
npm run build

# Start server
NODE_ENV=production npm start
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Cloud Deployment Options
- **AWS**: EC2, ECS, or Lambda
- **Google Cloud**: Cloud Run, GKE
- **Azure**: Container Instances, AKS
- **Railway**: Direct Git deployment

## 🧪 Development

### Development Setup
```bash
# Install development dependencies
npm install

# Start in development mode
npm run dev

# Run tests
npm test

# Type checking
npm run type-check
```

### Code Structure Guidelines
- **Modular Design**: Separate concerns across modules
- **Type Safety**: Comprehensive TypeScript usage
- **Error Handling**: Robust error boundaries
- **Testing**: Unit and integration test coverage

## 📊 Monitoring & Debugging

### Logging
The system provides comprehensive logging for:
- Connection events
- Query execution
- Error tracking
- Performance metrics

### Health Checks
- Database connectivity
- MCP server status
- Memory usage monitoring
- Query performance tracking

## 🔒 Security Considerations

### Database Security
- Encrypted connections (TLS/SSL)
- Authentication and authorization
- Query parameter sanitization
- Rate limiting and throttling

### Data Privacy
- PII handling protocols
- Data retention policies
- Access control mechanisms
- Audit trail maintenance

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Submit pull request

### Code Standards
- TypeScript strict mode
- ESLint/Prettier formatting
- Comprehensive JSDoc comments
- Test coverage requirements

## 📄 License

This project is open source. Please refer to the LICENSE file for specific terms and conditions.

## 🆘 Support & Troubleshooting

### Common Issues

#### Connection Failures
- Verify Neo4j server status
- Check connection credentials
- Confirm network accessibility

#### Memory Issues
- Monitor heap usage
- Optimize query patterns
- Implement connection pooling

#### Performance Problems
- Index optimization
- Query profiling
- Caching strategies

### Getting Help
- GitHub Issues: Bug reports and feature requests
- Discussions: General questions and usage help
- Documentation: Comprehensive guides and references

## 🔄 Changelog

### Version History
- **v1.0.0**: Initial release with core functionality
- **v1.1.0**: Enhanced MCP integration
- **v1.2.0**: Performance optimizations
- **v2.0.0**: Major architecture updates

---

**Maintained by**: Vedant Parmar  
**Repository**: [github.com/vedantparmar12/neo4j-context-bridge](https://github.com/vedantparmar12/neo4j-context-bridge)  
