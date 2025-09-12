# Deployment Guide for Neo4j Light RAG MCP Server

This guide covers multiple deployment options for the Neo4j Light RAG MCP Server.

## Local Development

### Prerequisites
- Node.js 18+
- Neo4j Database running
- Ollama installed and running

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Build the project
npm run build

# 4. Start the server
npm start
```

### Claude Desktop Configuration
Copy the appropriate config to Claude Desktop:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Use `claude-desktop-config.json` for local development.

## Cloudflare Workers Deployment

### Prerequisites
- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)
- Neo4j database (cloud or accessible)
- Ollama endpoint (or use Cloudflare AI)

### Automated Deployment
```bash
# Run the deployment script
./deploy-cloudflare.sh
```

### Manual Deployment
```bash
# 1. Login to Cloudflare
wrangler login

# 2. Create KV namespace
wrangler kv:namespace create "CACHE"
wrangler kv:namespace create "CACHE" --preview

# 3. Update wrangler.toml with KV IDs

# 4. Set secrets
wrangler secret put NEO4J_URI
wrangler secret put NEO4J_USER
wrangler secret put NEO4J_PASSWORD
wrangler secret put OLLAMA_BASE_URL
wrangler secret put MCP_API_KEY

# 5. Deploy
wrangler deploy --env production
```

### Cloudflare Configuration Features
- **KV Caching**: Fast response caching
- **Analytics**: Request monitoring
- **AI Binding**: Fallback to Cloudflare AI if Ollama unavailable
- **Multiple Environments**: staging, production
- **Automatic scaling**: Handle thousands of concurrent requests

### Claude Desktop for Cloudflare
Use `claude-desktop-config-cloudflare.json` with your Worker URL.

## Docker Deployment (Optional)

### Docker Compose
```yaml
version: '3.8'
services:
  neo4j-lightrag-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEO4J_URI=neo4j://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=password
      - OLLAMA_BASE_URL=http://ollama:11434
      - LIGHTRAG_ENABLED=true
    depends_on:
      - neo4j
      - ollama
      
  neo4j:
    image: neo4j:5.15
    environment:
      - NEO4J_AUTH=neo4j/password
    ports:
      - "7687:7687"
      - "7474:7474"
    volumes:
      - neo4j_data:/data
      
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  neo4j_data:
  ollama_data:
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEO4J_URI` | Neo4j connection string | `neo4j://localhost:7687` |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `LIGHTRAG_ENABLED` | Enable Light RAG features | `true` |
| `LIGHTRAG_AUTO_EXTRACTION` | Auto-extract entities | `true` |
| `LIGHTRAG_SIMILARITY_THRESHOLD` | Vector search threshold | `0.7` |

### Model Configuration

#### Recommended Ollama Models
- **LLM**: `llama3.2:latest`, `mistral:7b`, `phi3:mini`
- **Embeddings**: `nomic-embed-text:latest`, `all-minilm:l6-v2`

#### Cloudflare AI Models
- **LLM**: `@cf/meta/llama-3-8b-instruct`
- **Embeddings**: `@cf/baai/bge-base-en-v1.5`

## Monitoring & Analytics

### Health Checks
- Local: `http://localhost:3000/health`
- Cloudflare: `https://your-worker.workers.dev/health`

### Logging
```bash
# Local logs
npm run dev

# Cloudflare Worker logs
wrangler tail

# Filter Light RAG logs
wrangler tail --format=pretty | grep "lightrag"
```

### Performance Monitoring
- **Neo4j**: Use Neo4j Browser for query performance
- **Ollama**: Monitor model response times
- **Cloudflare**: Use Workers Analytics dashboard

## Security

### API Key Configuration
```bash
# Generate secure API key
openssl rand -hex 32

# Set in environment
export MCP_API_KEY="your-generated-key"
```

### Production Security Checklist
- [ ] Enable API key authentication
- [ ] Use encrypted Neo4j connections (`neo4j+s://`)
- [ ] Configure rate limiting
- [ ] Set up monitoring and alerts
- [ ] Use strong passwords
- [ ] Enable CORS restrictions
- [ ] Review access logs regularly

## Troubleshooting

### Common Issues

#### Ollama Connection Failed
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Pull required models
ollama pull llama3.2:latest
ollama pull nomic-embed-text:latest
```

#### Neo4j Connection Issues
```bash
# Test Neo4j connection
curl -u neo4j:password http://localhost:7474/db/neo4j/tx/commit
```

#### Cloudflare Worker Errors
```bash
# Check worker logs
wrangler tail

# Test worker directly
curl https://your-worker.workers.dev/health
```

#### High Memory Usage
- Reduce `LIGHTRAG_MAX_ENTITIES_PER_EXTRACTION`
- Lower `LIGHTRAG_EMBEDDING_DIMENSION`
- Disable `LIGHTRAG_AUTO_EXTRACTION` for high-volume usage

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
npm run dev
```

## Updates & Maintenance

### Updating Models
```bash
# Update Ollama models
ollama pull llama3.2:latest
ollama pull nomic-embed-text:latest

# Restart services
npm restart
```

### Database Maintenance
```cypher
// Clean up old conversations (Neo4j Browser)
MATCH (m:Message)
WHERE m.timestamp < datetime() - duration('P30D')
DELETE m;

// Optimize indexes
CALL db.indexes();
CALL db.resampleIndex('index_name');
```

### Cloudflare Worker Updates
```bash
# Deploy new version
npm run build
wrangler deploy --env production

# Rollback if needed
wrangler rollback --env production
```

## Scaling

### Performance Optimization
- Enable caching (`CACHE_ENABLED=true`)
- Increase connection pools for high load
- Use read replicas for Neo4j
- Configure Ollama for GPU acceleration
- Use Cloudflare Workers for global distribution

### Load Testing
```bash
# Test Light RAG query performance
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"lightrag_query","arguments":{"query":"test"}}}'
```

---

For more help, check the [README.md](README.md) or open an issue on GitHub.