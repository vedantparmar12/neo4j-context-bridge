# MCP Server Deployment Guide

This guide documents all the commands used to deploy the MCP server to Cloudflare Workers.

## Prerequisites

- Wrangler CLI installed (`npm install -g wrangler`)
- Cloudflare account
- `.dev.vars` file with environment variables

## Deployment Steps

### 1. Login to Cloudflare

```bash
wrangler login
```

### 2. Create KV Namespaces

Create the CONTEXT_KV namespace:
```bash
wrangler kv namespace create "CONTEXT_KV"
```

List all KV namespaces to get the IDs:
```bash
wrangler kv namespace list
```

### 3. Update wrangler.jsonc

Update the KV namespace IDs in `wrangler.jsonc`:
- OAUTH_KV: `4afa711b13744cc19514ae66c9f04760`
- CONTEXT_KV: `022eb1017898434f8f87b6aaaca2a774`

### 4. Set Environment Variables as Secrets

Set all the required secrets for production:

```bash
# GitHub OAuth Configuration
echo "Ov23lirydGXMeIPe9NEZ" | wrangler secret put GITHUB_CLIENT_ID
echo "e57b874e8142f29a6338484885bde9db803258ac" | wrangler secret put GITHUB_CLIENT_SECRET
echo "kE8!ztP9e@cQ7yaVgF5yL1wN6uB3mX4h" | wrangler secret put COOKIE_ENCRYPTION_KEY

# Neo4j Database Configuration
echo "neo4j+s://a81bfd2f.databases.neo4j.io" | wrangler secret put NEO4J_URI
echo "neo4j" | wrangler secret put NEO4J_USER
echo "nJalMA79b3Cl8y9YY6XaBs28P2B_ZnfdOht2ElC_gBM" | wrangler secret put NEO4J_PASSWORD

# Sentry Monitoring (Optional)
echo "https://d449571cee439cfde1797cd631400cd0@o4509655809327104.ingest.us.sentry.io/4509688171003904" | wrangler secret put SENTRY_DSN
echo "production" | wrangler secret put NODE_ENV

# Context Management Configuration
echo "4000" | wrangler secret put MAX_CONTEXT_TOKENS
echo "2000" | wrangler secret put MAX_INJECTION_TOKENS

# Database Configuration (Required for database tools)
# Replace with your actual PostgreSQL connection string
echo "postgresql://user:password@host:5432/database" | wrangler secret put DATABASE_URL

# Gemini API Key (Required for AI features and embeddings)
echo "your-gemini-api-key" | wrangler secret put GEMINI_API_KEY
```

### 5. Deploy to Cloudflare Workers

```bash
wrangler deploy
```

## Deployment Verification

After deployment, you should see output similar to:
```
Uploaded my-mcp-server (10.34 sec)
Deployed my-mcp-server triggers (3.63 sec)
  https://my-mcp-server.vedantparmarsingh.workers.dev
Current Version ID: d07d277e-83f8-461a-b26f-e237107319ba
```

## Managing Secrets

To list all secrets:
```bash
wrangler secret list
```

To update a secret:
```bash
wrangler secret put SECRET_NAME
```

To delete a secret:
```bash
wrangler secret delete SECRET_NAME
```

## Troubleshooting

### KV Namespace Issues

If you encounter KV namespace errors during deployment:

1. List all namespaces:
   ```bash
   wrangler kv namespace list
   ```

2. Update the namespace IDs in `wrangler.jsonc` to match the actual IDs

### Build Errors

If you encounter import errors:
- Ensure all tool files are in the `src/tools/` directory
- Don't import from the `examples/` directory
- Create any missing directories with `mkdir -p`

## Claude Desktop Configuration

Add this to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "npx",
      "args": ["mcp-remote", "https://my-mcp-server.vedantparmarsingh.workers.dev/mcp"],
      "env": {}
    }
  }
}
```

## Notes

- All secrets are stored securely in Cloudflare and are not visible in the deployed code
- The OAuth flow requires users to authenticate with GitHub before accessing the MCP tools
- Database tools are permission-based - only whitelisted GitHub usernames can perform write operations