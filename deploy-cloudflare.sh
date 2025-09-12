#!/bin/bash
# Deployment script for Neo4j Light RAG MCP Server to Cloudflare Workers

set -e

echo "Deploying Neo4j Light RAG MCP Server to Cloudflare Workers..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "ERROR: Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Check if logged in to Cloudflare
echo "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "Please login to Cloudflare:"
    wrangler login
fi

# Build the project
echo "Building TypeScript project..."
npm run build

# Create Cloudflare Worker specific build
echo "Creating Cloudflare Worker build..."
if [ ! -f "dist/cloudflare-worker.js" ]; then
    echo "ERROR: Cloudflare Worker build not found. Make sure src/cloudflare-worker.ts is compiled."
    exit 1
fi

# Set up secrets (if not already set)
echo "Setting up secrets..."
read -p "Enter your Neo4j URI: " NEO4J_URI
read -p "Enter your Neo4j username: " NEO4J_USER
read -s -p "Enter your Neo4j password: " NEO4J_PASSWORD
echo
read -p "Enter your Ollama base URL (optional, press enter to skip): " OLLAMA_BASE_URL
read -s -p "Enter your Ollama API key (optional, press enter to skip): " OLLAMA_API_KEY
echo
read -s -p "Enter your MCP API key (optional, press enter to skip): " MCP_API_KEY
echo

# Set secrets using wrangler
echo "Setting Cloudflare Worker secrets..."
echo "$NEO4J_URI" | wrangler secret put NEO4J_URI
echo "$NEO4J_USER" | wrangler secret put NEO4J_USER
echo "$NEO4J_PASSWORD" | wrangler secret put NEO4J_PASSWORD

if [ ! -z "$OLLAMA_BASE_URL" ]; then
    echo "$OLLAMA_BASE_URL" | wrangler secret put OLLAMA_BASE_URL
fi

if [ ! -z "$OLLAMA_API_KEY" ]; then
    echo "$OLLAMA_API_KEY" | wrangler secret put OLLAMA_API_KEY
fi

if [ ! -z "$MCP_API_KEY" ]; then
    echo "$MCP_API_KEY" | wrangler secret put MCP_API_KEY
fi

# Create KV namespace for caching
echo "Creating KV namespace for caching..."
CACHE_KV_ID=$(wrangler kv:namespace create "CACHE" --preview false | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
CACHE_PREVIEW_KV_ID=$(wrangler kv:namespace create "CACHE" --preview true | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

echo "Please update your wrangler.toml with these KV namespace IDs:"
echo "  id = \"$CACHE_KV_ID\""
echo "  preview_id = \"$CACHE_PREVIEW_KV_ID\""

# Deploy to staging first
echo "Deploying to staging..."
wrangler deploy --env staging

echo "SUCCESS: Staging deployment complete!"
echo "Staging URL: https://neo4j-lightrag-mcp-staging.your-domain.workers.dev"

# Ask if user wants to deploy to production
read -p "Deploy to production? (y/N): " DEPLOY_PROD
if [[ $DEPLOY_PROD =~ ^[Yy]$ ]]; then
    echo "Deploying to production..."
    wrangler deploy --env production
    echo "SUCCESS: Production deployment complete!"
    echo "Production URL: https://neo4j-lightrag-mcp-prod.your-domain.workers.dev"
fi

echo ""
echo "Deployment completed successfully!"
echo ""
echo "Next steps:"
echo "1. Update your Claude Desktop config to use the Worker URL"
echo "2. Test the deployment with: curl https://your-worker-url.workers.dev/health"
echo "3. Monitor logs with: wrangler tail"
echo ""
echo "Useful commands:"
echo "  wrangler tail                    # View live logs"
echo "  wrangler kv:key list --binding=CACHE  # Check cached data"
echo "  wrangler secret list             # View configured secrets"
echo ""