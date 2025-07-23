# Neo4j Context Manager MCP Server

A production-ready Model Context Protocol (MCP) server that uses Neo4j graph database to maintain context across multiple Claude chat sessions. Built with TypeScript on Cloudflare Workers with GitHub OAuth authentication.

## Features

- 🔗 **Graph-Based Context Storage**: Store chat contexts as nodes with semantic relationships in Neo4j
- 🤖 **Smart Context Extraction**: Automatically identify and store code blocks, decisions, and requirements
- 🔍 **Semantic Search**: Vector similarity search using Cloudflare AI embeddings
- 💡 **Token-Aware Injection**: Intelligently inject relevant context while respecting token limits
- 🔐 **GitHub OAuth Security**: Secure authentication with role-based access control
- ☁️ **Cloudflare Native**: Built for Workers runtime with Durable Objects and KV storage

## Prerequisites

- Node.js 18+ and npm
- Cloudflare account with Workers enabled
- Neo4j Aura account (free tier available)
- GitHub OAuth App
- Claude Desktop application

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd use-cases/mcp-server
npm install
```

### 2. Set Up Neo4j Aura

1. Create a free Neo4j Aura instance at https://console.neo4j.io/
2. Choose the "Free" tier
3. Save your connection details:
   - Connection URI (starts with `neo4j+s://`)
   - Username (usually `neo4j`)
   - Password

### 3. Create GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - Application name: `Neo4j Context MCP`
   - Homepage URL: `http://localhost:8793`
   - Authorization callback URL: `http://localhost:8793/callback`
4. Save the Client ID and generate a Client Secret

### 4. Configure Environment Variables

Copy the example configuration:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your credentials:

```env
# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
COOKIE_ENCRYPTION_KEY=generate_a_random_32_char_string

# Neo4j Configuration
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_neo4j_password

# Context Management
MAX_CONTEXT_TOKENS=4000
MAX_INJECTION_TOKENS=2000
```

### 5. Run the Development Server

```bash
# Using the Neo4j-specific configuration
wrangler dev --config wrangler-neo4j.jsonc

# Or using npm script (if configured)
npm run dev:neo4j
```

The server will start at `http://localhost:8793`

### 6. Configure Claude Desktop

#### Option A: Manual Configuration

1. Open Claude Desktop settings
2. Go to Developer > MCP Servers
3. Add the configuration from `claude_desktop_config.json`

#### Option B: Direct File Edit

On Windows, edit:
```
%APPDATA%\Claude\claude_desktop_config.json
```

On macOS:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add this configuration:

```json
{
  "mcpServers": {
    "neo4j-context": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8793/mcp"],
      "env": {}
    }
  }
}
```

### 7. Authenticate

1. Restart Claude Desktop
2. When you first use a Neo4j context tool, you'll be prompted to authenticate
3. Click the authentication link to authorize with GitHub
4. Once authorized, the MCP tools will be available

## Available MCP Tools

### Context Extraction
- **`extract_context`** - Extract important contexts from the current chat
- **`extract_from_export`** - Import contexts from an exported chat JSON file

### Search & Retrieval
- **`search_context`** - Search for relevant contexts using keywords or semantic search
- **`find_related`** - Find contexts related to a specific context
- **`get_evolution`** - Track how a context has evolved across chats
- **`get_chat_context`** - Retrieve all contexts from a specific chat

### Context Management
- **`inject_context`** - Inject relevant historical context into the current chat
- **`list_chats`** - List all chats in a project with summaries
- **`visualize_graph`** - Generate a visualization of the context graph
- **`manage_relationships`** - Create/update/delete relationships between contexts

## Usage Examples

### Extract Context from Current Chat
```
Use the extract_context tool to save important parts of this conversation
```

### Search for Past Contexts
```
Search for previous discussions about "authentication" using the search_context tool
```

### Inject Relevant Context
```
Find and inject any previous context about "database schema design" into this chat
```

### Visualize Knowledge Graph
```
Show me a visualization of how our discussions about "API design" have evolved
```

## Production Deployment

### 1. Set Production Secrets

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY
wrangler secret put NEO4J_URI
wrangler secret put NEO4J_USER
wrangler secret put NEO4J_PASSWORD
```

### 2. Create KV Namespaces

```bash
# Create OAuth KV namespace
wrangler kv:namespace create "OAUTH_KV"

# Create Context KV namespace
wrangler kv:namespace create "CONTEXT_KV"
```

Update `wrangler-neo4j.jsonc` with the generated IDs.

### 3. Deploy to Cloudflare

```bash
wrangler deploy --config wrangler-neo4j.jsonc
```

### 4. Update Claude Configuration

Update the production URL in Claude Desktop:

```json
{
  "mcpServers": {
    "neo4j-context": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-neo4j-mcp.workers.dev/mcp"],
      "env": {}
    }
  }
}
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Desktop │────▶│  MCP Server      │────▶│  Neo4j Aura     │
│                 │     │  (CF Workers)    │     │  (Graph DB)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                           │
                               ▼                           ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │  Cloudflare KV   │     │  Vector Index   │
                        │  (Embeddings)    │     │  (Semantic)     │
                        └──────────────────┘     └─────────────────┘
```

## Security Considerations

- **Authentication**: GitHub OAuth with signed cookies
- **Authorization**: Role-based access control
- **Query Validation**: Cypher injection protection
- **Error Handling**: Sanitized error messages
- **Token Management**: Strict token budget enforcement

## Troubleshooting

### Neo4j Connection Issues
- Verify your Neo4j Aura instance is running
- Check connection URI includes `+s` for SSL
- Ensure IP allowlist includes Cloudflare Workers

### Authentication Problems
- Clear cookies and re-authenticate
- Verify GitHub OAuth callback URL matches configuration
- Check COOKIE_ENCRYPTION_KEY is consistent

### Tool Errors
- Check Claude Desktop console for detailed errors
- Verify all environment variables are set
- Ensure Neo4j indexes are created (automatic on first run)

### Performance Issues
- Monitor token usage in responses
- Adjust MAX_CONTEXT_TOKENS for memory limits
- Use semantic search for large datasets

## Development

### Running Tests
```bash
npm test
```

### Type Checking
```bash
npm run type-check
```

### Local Neo4j Setup (Optional)
For local development, you can use Neo4j Desktop instead of Aura:
1. Download Neo4j Desktop
2. Create a local database
3. Update NEO4J_URI to `bolt://localhost:7687`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- GitHub Issues: [Report bugs or request features]
- Documentation: [MCP Protocol Docs](https://modelcontextprotocol.io)
- Neo4j Support: [Neo4j Community](https://community.neo4j.com)

---

Built with ❤️ using Model Context Protocol, Neo4j, and Cloudflare Workers