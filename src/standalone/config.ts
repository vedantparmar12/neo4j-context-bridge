import { z } from 'zod';
import * as crypto from 'crypto';
import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env file if it exists
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const ConfigSchema = z.object({
  NEO4J_URI: z.string().url().or(z.string().startsWith('bolt://')).or(z.string().startsWith('neo4j://')),
  NEO4J_USER: z.string().min(1),
  NEO4J_PASSWORD: z.string().min(1),
  NEO4J_DATABASE: z.string().default('neo4j'),
  NEO4J_ENCRYPTED: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  NEO4J_TRUST: z.enum(['TRUST_ALL_CERTIFICATES', 'TRUST_CUSTOM_CA_SIGNED_CERTIFICATES', 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES']).default('TRUST_SYSTEM_CA_SIGNED_CERTIFICATES'),
  NEO4J_REJECTED_HOSTNAMES: z.string().optional(),
  NEO4J_MAX_CONNECTION_LIFETIME: z.string().transform(Number).default('3600000'),
  NEO4J_MAX_CONNECTION_POOL_SIZE: z.string().transform(Number).default('50'),
  NEO4J_CONNECTION_ACQUISITION_TIMEOUT: z.string().transform(Number).default('120000'),
  NEO4J_CONNECTION_TIMEOUT: z.string().transform(Number).default('30000'),
  NEO4J_MAX_TRANSACTION_RETRY_TIME: z.string().transform(Number).default('30000'),
  
  MAX_CONTEXT_TOKENS: z.string().transform(Number).default('2000'),
  MAX_INJECTION_TOKENS: z.string().transform(Number).default('1000'),
  
  MCP_API_KEY: z.string().min(32).optional().or(z.literal('')),
  MCP_API_KEY_REQUIRED: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  
  CACHE_ENABLED: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  CACHE_TTL: z.string().transform(Number).default('300000'),
  CACHE_MAX_SIZE: z.string().transform(Number).default('100'),
  
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),

  // Light RAG Configuration
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2:latest'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text:latest'),
  OLLAMA_TIMEOUT: z.string().transform(Number).default('60000'),
  
  LIGHTRAG_ENABLED: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  LIGHTRAG_AUTO_EXTRACTION: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  LIGHTRAG_MAX_ENTITIES_PER_EXTRACTION: z.string().transform(Number).default('50'),
  LIGHTRAG_MAX_RELATIONS_PER_EXTRACTION: z.string().transform(Number).default('100'),
  LIGHTRAG_EMBEDDING_DIMENSION: z.string().transform(Number).default('768'),
  LIGHTRAG_SIMILARITY_THRESHOLD: z.string().transform(Number).default('0.7'),
  LIGHTRAG_MAX_HOPS: z.string().transform(Number).default('3'),
  LIGHTRAG_MIN_RELATION_STRENGTH: z.string().transform(Number).default('0.1'),
});

export type Config = z.infer<typeof ConfigSchema>;

class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: Config | null = null;
  private apiKeyHash: string | null = null;

  private constructor() {}

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  loadConfig(env: Record<string, string | undefined> = process.env): Config {
    try {
      const config = ConfigSchema.parse(env);
      
      if (!this.validateNeo4jUri(config.NEO4J_URI)) {
        throw new Error('Invalid Neo4j URI format');
      }
      
      if (config.MCP_API_KEY) {
        this.apiKeyHash = this.hashApiKey(config.MCP_API_KEY);
      }
      
      if (config.NODE_ENV === 'production') {
        this.validateProductionConfig(config);
      }
      
      this.config = config;
      return config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const missingVars = error.errors
          .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
          .map(e => e.path.join('.'));
        
        if (missingVars.length > 0) {
          throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }
        
        throw new Error(`Configuration validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  private validateNeo4jUri(uri: string): boolean {
    const validProtocols = ['neo4j://', 'neo4j+s://', 'neo4j+ssc://', 'bolt://', 'bolt+s://', 'bolt+ssc://'];
    return validProtocols.some(protocol => uri.startsWith(protocol));
  }

  private validateProductionConfig(config: Config): void {
    const warnings: string[] = [];
    
    if (!config.NEO4J_URI.includes('+s')) {
      warnings.push('Neo4j connection is not encrypted. Consider using neo4j+s:// or bolt+s:// protocol');
    }
    
    if (!config.MCP_API_KEY_REQUIRED) {
      warnings.push('API key authentication is disabled in production');
    }
    
    if (config.NEO4J_PASSWORD.length < 12) {
      warnings.push('Neo4j password should be at least 12 characters in production');
    }
    
    if (!config.RATE_LIMIT_ENABLED) {
      warnings.push('Rate limiting is disabled in production');
    }
    
    if (warnings.length > 0) {
      console.warn('⚠️  Production configuration warnings:');
      warnings.forEach(w => console.warn(`   - ${w}`));
    }
  }

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  validateApiKey(apiKey: string): boolean {
    if (!this.config?.MCP_API_KEY_REQUIRED) {
      return true;
    }
    
    if (!apiKey || !this.apiKeyHash) {
      return false;
    }
    
    const providedKeyHash = this.hashApiKey(apiKey);
    return crypto.timingSafeEqual(
      Buffer.from(this.apiKeyHash),
      Buffer.from(providedKeyHash)
    );
  }

  getConfig(): Config {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  getNeo4jConfig() {
    const config = this.getConfig();
    return {
      uri: config.NEO4J_URI,
      authToken: {
        scheme: 'basic',
        principal: config.NEO4J_USER,
        credentials: config.NEO4J_PASSWORD
      },
      database: config.NEO4J_DATABASE,
      encrypted: config.NEO4J_ENCRYPTED,
      trust: config.NEO4J_TRUST,
      maxConnectionLifetime: config.NEO4J_MAX_CONNECTION_LIFETIME,
      maxConnectionPoolSize: config.NEO4J_MAX_CONNECTION_POOL_SIZE,
      connectionAcquisitionTimeout: config.NEO4J_CONNECTION_ACQUISITION_TIMEOUT,
      connectionTimeout: config.NEO4J_CONNECTION_TIMEOUT,
      maxTransactionRetryTime: config.NEO4J_MAX_TRANSACTION_RETRY_TIME,
      disableLosslessIntegers: true,
    };
  }

  isProduction(): boolean {
    return this.config?.NODE_ENV === 'production';
  }

  isDevelopment(): boolean {
    return this.config?.NODE_ENV === 'development';
  }

  isTest(): boolean {
    return this.config?.NODE_ENV === 'test';
  }
}

export const configManager = ConfigurationManager.getInstance();