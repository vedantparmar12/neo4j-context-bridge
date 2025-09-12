// Cloudflare Worker for Neo4j Light RAG MCP Server
// Optimized for Cloudflare's runtime environment

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from './standalone/register-tools.js';
import { configManager } from './standalone/config.js';

// Cloudflare Worker Environment
interface Env {
  // KV Storage
  CACHE: KVNamespace;
  
  // D1 Database (optional)
  DB?: D1Database;
  
  // AI binding for Cloudflare AI
  AI: Ai;
  
  // Analytics
  ANALYTICS: AnalyticsEngineDataset;
  
  // Environment variables
  NEO4J_URI: string;
  NEO4J_USER: string;
  NEO4J_PASSWORD: string;
  NEO4J_DATABASE?: string;
  
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_EMBEDDING_MODEL?: string;
  OLLAMA_API_KEY?: string;
  
  LIGHTRAG_ENABLED?: string;
  LIGHTRAG_AUTO_EXTRACTION?: string;
  LIGHTRAG_EMBEDDING_DIMENSION?: string;
  LIGHTRAG_SIMILARITY_THRESHOLD?: string;
  LIGHTRAG_MAX_HOPS?: string;
  
  MCP_API_KEY?: string;
  NODE_ENV?: string;
  LOG_LEVEL?: string;
}

// Cloudflare-specific Ollama client that can fallback to Cloudflare AI
class CloudflareOllamaClient {
  constructor(private env: Env) {}
  
  async generate(prompt: string, model?: string): Promise<string> {
    // Try Ollama first if configured
    if (this.env.OLLAMA_BASE_URL) {
      try {
        return await this.generateWithOllama(prompt, model);
      } catch (error) {
        console.warn('Ollama failed, falling back to Cloudflare AI:', error);
      }
    }
    
    // Fallback to Cloudflare AI
    return await this.generateWithCloudflareAI(prompt);
  }
  
  private async generateWithOllama(prompt: string, model?: string): Promise<string> {
    const requestModel = model || this.env.OLLAMA_MODEL || 'llama3.2:latest';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.env.OLLAMA_API_KEY) {
      headers['Authorization'] = `Bearer ${this.env.OLLAMA_API_KEY}`;
    }
    
    const response = await fetch(`${this.env.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: requestModel,
        prompt,
        stream: false,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.response.trim();
  }
  
  private async generateWithCloudflareAI(prompt: string): Promise<string> {
    const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
      prompt: prompt,
      max_tokens: 512,
      temperature: 0.7,
    });
    
    return (response as any).response || '';
  }
  
  async generateEmbedding(text: string): Promise<number[]> {
    // Try Ollama embedding first
    if (this.env.OLLAMA_BASE_URL && this.env.OLLAMA_EMBEDDING_MODEL) {
      try {
        return await this.generateEmbeddingWithOllama(text);
      } catch (error) {
        console.warn('Ollama embedding failed, falling back to Cloudflare AI:', error);
      }
    }
    
    // Fallback to Cloudflare AI embeddings
    const response = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: text,
    });
    
    return (response as any).data[0] || [];
  }
  
  private async generateEmbeddingWithOllama(text: string): Promise<number[]> {
    const embeddingModel = this.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text:latest';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.env.OLLAMA_API_KEY) {
      headers['Authorization'] = `Bearer ${this.env.OLLAMA_API_KEY}`;
    }
    
    const response = await fetch(`${this.env.OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: embeddingModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.embedding;
  }
}

// Enhanced configuration for Cloudflare Workers
function createCloudflareConfig(env: Env) {
  return {
    NEO4J_URI: env.NEO4J_URI,
    NEO4J_USER: env.NEO4J_USER,
    NEO4J_PASSWORD: env.NEO4J_PASSWORD,
    NEO4J_DATABASE: env.NEO4J_DATABASE || 'neo4j',
    NEO4J_ENCRYPTED: 'true',
    NEO4J_TRUST: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES',
    
    // Connection optimized for Workers
    NEO4J_MAX_CONNECTION_LIFETIME: 1800000, // 30 minutes
    NEO4J_MAX_CONNECTION_POOL_SIZE: 10,     // Smaller pool for Workers
    NEO4J_CONNECTION_TIMEOUT: 10000,       // 10 seconds
    NEO4J_MAX_TRANSACTION_RETRY_TIME: 15000,
    
    // MCP Configuration
    MAX_CONTEXT_TOKENS: 4000,
    MAX_INJECTION_TOKENS: 2000,
    
    // API Security
    MCP_API_KEY: env.MCP_API_KEY,
    MCP_API_KEY_REQUIRED: env.MCP_API_KEY ? true : false,
    
    // Environment
    LOG_LEVEL: env.LOG_LEVEL || 'info',
    NODE_ENV: env.NODE_ENV || 'production',
    
    // Caching with KV
    CACHE_ENABLED: true,
    CACHE_TTL: 600000, // 10 minutes
    CACHE_MAX_SIZE: 1000,
    
    // Rate limiting
    RATE_LIMIT_ENABLED: true,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    RATE_LIMIT_WINDOW_MS: 60000,
    
    // Light RAG Configuration
    OLLAMA_BASE_URL: env.OLLAMA_BASE_URL || '',
    OLLAMA_MODEL: env.OLLAMA_MODEL || '@cf/meta/llama-3-8b-instruct',
    OLLAMA_EMBEDDING_MODEL: env.OLLAMA_EMBEDDING_MODEL || '@cf/baai/bge-base-en-v1.5',
    OLLAMA_TIMEOUT: 30000, // Reduced for Workers
    
    LIGHTRAG_ENABLED: env.LIGHTRAG_ENABLED !== 'false',
    LIGHTRAG_AUTO_EXTRACTION: env.LIGHTRAG_AUTO_EXTRACTION !== 'false',
    LIGHTRAG_MAX_ENTITIES_PER_EXTRACTION: Number(env.LIGHTRAG_MAX_ENTITIES_PER_EXTRACTION) || 25, // Reduced for Workers
    LIGHTRAG_MAX_RELATIONS_PER_EXTRACTION: Number(env.LIGHTRAG_MAX_RELATIONS_PER_EXTRACTION) || 50,
    LIGHTRAG_EMBEDDING_DIMENSION: Number(env.LIGHTRAG_EMBEDDING_DIMENSION) || 768,
    LIGHTRAG_SIMILARITY_THRESHOLD: Number(env.LIGHTRAG_SIMILARITY_THRESHOLD) || 0.75,
    LIGHTRAG_MAX_HOPS: Number(env.LIGHTRAG_MAX_HOPS) || 2, // Reduced for performance
    LIGHTRAG_MIN_RELATION_STRENGTH: Number(env.LIGHTRAG_MIN_RELATION_STRENGTH) || 0.2,
  };
}

// Cache implementation using Cloudflare KV
class CloudflareCache {
  constructor(private kv: KVNamespace) {}
  
  async get(key: string): Promise<any> {
    try {
      const value = await this.kv.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }
  
  async set(key: string, value: any, ttl: number = 600): Promise<void> {
    try {
      await this.kv.put(key, JSON.stringify(value), {
        expirationTtl: ttl
      });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }
  
  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }
}

// Main Worker export
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };
      
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }
      
      // Health check endpoint
      if (request.url.includes('/health')) {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          lightrag_enabled: env.LIGHTRAG_ENABLED !== 'false',
          ollama_configured: !!env.OLLAMA_BASE_URL,
          cloudflare_ai_available: !!env.AI
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Initialize MCP Server
      const config = createCloudflareConfig(env);
      const cache = new CloudflareCache(env.CACHE);
      
      // Track analytics
      if (env.ANALYTICS) {
        ctx.waitUntil(env.ANALYTICS.writeDataPoint({
          blobs: [request.url, request.method],
          doubles: [Date.now()],
          indexes: [request.headers.get('User-Agent') || 'unknown']
        }));
      }
      
      const server = new Server(
        {
          name: "neo4j-lightrag-cloudflare",
          version: "1.0.0",
          description: "Neo4j Light RAG MCP Server running on Cloudflare Workers"
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          }
        }
      );
      
      // Register tools with Cloudflare-specific config
      registerAllTools(server, config as any);
      
      // Handle MCP requests
      if (request.method === 'POST') {
        try {
          const body = await request.json() as any;
          
          // Simple request routing for MCP protocol
          if (body.method === 'tools/list') {
            // Return available tools
            const response = await server.request(body);
            return new Response(JSON.stringify(response), {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
          
          if (body.method === 'tools/call') {
            // Execute tool
            const response = await server.request(body);
            return new Response(JSON.stringify(response), {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
          
          // Generic MCP request handling
          const response = await server.request(body);
          return new Response(JSON.stringify(response), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
          
        } catch (error) {
          console.error('MCP request error:', error);
          return new Response(JSON.stringify({
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : 'Unknown error'
            }
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      }
      
      // Default response for non-POST requests
      return new Response(JSON.stringify({
        name: "Neo4j Light RAG MCP Server",
        version: "1.0.0",
        status: "running",
        endpoints: {
          health: "/health",
          mcp: "/" 
        },
        lightrag: {
          enabled: config.LIGHTRAG_ENABLED,
          ollama_url: config.OLLAMA_BASE_URL,
          auto_extraction: config.LIGHTRAG_AUTO_EXTRACTION
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};