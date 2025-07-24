# Neo4j Context Bridge Documentation

## 🚀 Overview

Neo4j Context Bridge is a sophisticated TypeScript/JavaScript library that provides intelligent context management and knowledge graph capabilities using Neo4j database integration. This project bridges the gap between conversational AI systems and persistent knowledge storage through advanced context extraction, relationship detection, and semantic search capabilities.

### Key Features

- **Knowledge Graph Management**: Build and maintain complex knowledge graphs using Neo4j
- **Context Extraction**: Intelligent extraction of entities, relationships, and semantic information from conversations
- **Semantic Search**: Advanced search capabilities with embedding-based similarity matching
- **OAuth Integration**: Secure authentication with GitHub and other providers
- **MCP (Model Context Protocol) Support**: Integration with AI model context protocols
- **Multi-Database Support**: Both PostgreSQL and Neo4j backend options
- **Cloudflare Workers Compatible**: Designed for serverless deployment
- **Error Monitoring**: Integrated Sentry support for production monitoring

## 📁 Project Structure

```
neo4j-context-bridge/
├── src/
│   ├── auth/                   # Authentication & OAuth handlers
│   ├── database/               # Database connections & utilities
│   ├── embeddings/             # AI embeddings generation
│   ├── extractors/             # Context & relationship extraction
│   ├── injection/              # Context injection mechanisms
│   ├── knowledge-graph/        # Knowledge graph storage & management
│   ├── neo4j/                  # Neo4j specific implementations
│   ├── search/                 # Semantic search functionality
│   ├── tools/                  # MCP tools & API endpoints
│   ├── types/                  # TypeScript type definitions
│   └── utils/                  # Utility functions & helpers
├── examples/                   # Usage examples & demos
├── tests/                      # Test suites & fixtures
└── docs/                       # Additional documentation
```

## 🔧 Core Components

### 1. Authentication System (`src/auth/`)

**GitHub Handler** (`github-handler.ts`)
- OAuth flow management for GitHub integration
- Token validation and refresh mechanisms
- User profile retrieval and management

**OAuth Utils** (`oauth-utils.ts`)
- Generic OAuth provider support
- Secure token storage and validation
- Multi-provider authentication flows

### 2. Database Layer (`src/database/` & `src/neo4j/`)

**Connection Management**
- Secure database connections with retry logic
- Connection pooling and optimization
- Environment-based configuration

**Security Features**
- SQL injection prevention
- Query sanitization and validation
- Role-based access control

### 3. Knowledge Graph Engine (`src/knowledge-graph/`)

**Storage System** (`storage.ts`)
- Entity and relationship management
- Graph traversal algorithms
- Data persistence and retrieval
- Semantic relationship mapping

### 4. Context Processing (`src/extractors/`)

**Context Extractor** (`context-extractor.ts`)
- Natural language processing for entity extraction
- Named entity recognition (NER)
- Contextual information parsing
- Multi-format content support

**Relationship Detector** (`relationship-detector.ts`)
- Automatic relationship discovery between entities
- Semantic relationship classification
- Confidence scoring for detected relationships
- Temporal relationship tracking

### 5. Semantic Search (`src/search/`)

**Semantic Search Engine** (`semantic-search.ts`)
- Vector-based similarity search
- Embedding generation and comparison
- Multi-modal search capabilities
- Relevance ranking algorithms

### 6. AI Embeddings (`src/embeddings/`)

**Cloudflare AI Integration** (`cloudflare-ai.ts`)
- Text-to-vector embedding generation
- Multiple embedding model support
- Batch processing capabilities
- Caching mechanisms for performance

### 7. MCP Tools (`src/tools/`)

The project provides extensive MCP (Model Context Protocol) tools:

- **Context Tools**: Manage conversational context and history
- **Database Tools**: Direct database query and management interfaces
- **Extraction Tools**: Extract entities and relationships from text
- **Injection Tools**: Inject context into conversations
- **Knowledge Graph Tools**: Manipulate and query the knowledge graph
- **Management Tools**: Administrative and maintenance operations
- **Neo4j Tools**: Specialized Neo4j database operations
- **Search Tools**: Semantic and traditional search capabilities

## 🛠 Installation & Setup

### Prerequisites

- Node.js 18+ or compatible runtime
- Neo4j database instance
- PostgreSQL database (optional)
- Cloudflare account (for deployment)

### Environment Configuration

Create a `.env` file with the following variables:

```env
# Database Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password

POSTGRES_URL=postgresql://user:password@localhost:5432/dbname

# Authentication
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# AI Services
OPENAI_API_KEY=your_openai_key
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account
CLOUDFLARE_API_TOKEN=your_cloudflare_token

# Monitoring
SENTRY_DSN=your_sentry_dsn
```

### Installation

```bash
# Clone the repository
git clone https://github.com/vedantparmar12/neo4j-context-bridge.git
cd neo4j-context-bridge

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## 🚀 Usage Examples

### Basic Knowledge Graph Operations

```typescript
import { KnowledgeGraphStorage } from './src/knowledge-graph/storage';
import { ContextExtractor } from './src/extractors/context-extractor';

// Initialize storage
const storage = new KnowledgeGraphStorage({
  neo4jUri: process.env.NEO4J_URI,
  neo4jUsername: process.env.NEO4J_USERNAME,
  neo4jPassword: process.env.NEO4J_PASSWORD
});

// Extract context from text
const extractor = new ContextExtractor();
const context = await extractor.extractContext("John works at OpenAI and lives in San Francisco");

// Store in knowledge graph
await storage.storeContext(context);
```

### Semantic Search

```typescript
import { SemanticSearch } from './src/search/semantic-search';

const search = new SemanticSearch({
  embeddingProvider: 'cloudflare',
  storage: storage
});

// Perform semantic search
const results = await search.search("AI companies in San Francisco", {
  limit: 10,
  threshold: 0.8
});
```

### MCP Integration

```typescript
import { registerNeo4jTools } from './src/tools/register-neo4j-tools';

// Register all Neo4j tools with MCP
await registerNeo4jTools({
  neo4jConnection: connectionConfig,
  enableSentry: true
});
```

## 🔍 API Reference

### Core Classes

#### `KnowledgeGraphStorage`
Main interface for knowledge graph operations.

**Methods:**
- `storeEntity(entity: Entity)`: Store an entity in the graph
- `storeRelationship(rel: Relationship)`: Store a relationship
- `findEntities(query: string)`: Search for entities
- `getConnections(entityId: string)`: Get entity connections

#### `ContextExtractor`
Extracts structured information from unstructured text.

**Methods:**
- `extractContext(text: string)`: Extract entities and relationships
- `extractEntities(text: string)`: Extract named entities only
- `extractRelationships(text: string)`: Extract relationships only

#### `SemanticSearch`
Provides semantic search capabilities.

**Methods:**
- `search(query: string, options?)`: Perform semantic search
- `indexDocument(doc: Document)`: Index a document for search
- `generateEmbedding(text: string)`: Generate text embeddings

### MCP Tools

The project provides the following MCP tools:

- `store_context`: Store conversational context
- `retrieve_context`: Retrieve relevant context
- `extract_entities`: Extract entities from text
- `find_relationships`: Discover relationships
- `semantic_search`: Perform semantic searches
- `manage_knowledge_graph`: Administrative operations

## 🧪 Testing

The project includes comprehensive test suites:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

### Test Structure

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test component interactions
- **Fixtures**: Reusable test data and configurations
- **Mocks**: Mock implementations for external services

## 🚀 Deployment

### Cloudflare Workers

```bash
# Deploy to Cloudflare Workers
npm run deploy

# Deploy with specific environment
npm run deploy:production
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

## 📊 Performance Considerations

### Optimization Strategies

1. **Connection Pooling**: Efficient database connection management
2. **Caching**: Redis-based caching for frequently accessed data
3. **Batch Processing**: Bulk operations for large datasets
4. **Lazy Loading**: On-demand resource loading
5. **Compression**: Response compression for API endpoints

### Monitoring

- **Sentry Integration**: Error tracking and performance monitoring
- **Custom Metrics**: Business logic monitoring
- **Health Checks**: System health monitoring endpoints

## 🤝 Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **Conventional Commits**: Commit message standards

## 📋 Dependencies

### Production Dependencies

- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **neo4j-driver**: Neo4j database driver
- **@xenova/transformers**: AI/ML transformers for embeddings
- **hono**: Lightweight web framework
- **zod**: Runtime type validation
- **tiktoken**: Token counting and text processing

### Development Dependencies

- **vitest**: Testing framework
- **typescript**: TypeScript compiler
- **@types/node**: Node.js type definitions
- **prettier**: Code formatting
- **@sentry/cloudflare**: Error monitoring

## 📖 Additional Resources

### Documentation

- [Neo4j Implementation Status](./NEO4J_IMPLEMENTATION_STATUS.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
- [Deployment Guide](./deployment.md)
- [Knowledge Graph README](./README_KG.md)

### External Resources

- [Neo4j Documentation](https://neo4j.com/docs/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Cloudflare Workers](https://workers.cloudflare.com/)

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- Open an issue on [GitHub](https://github.com/vedantparmar12/neo4j-context-bridge/issues)
- Check the [documentation](./docs/)
- Review existing issues and discussions

---

**Built with ❤️ by the Neo4j Context Bridge team**
