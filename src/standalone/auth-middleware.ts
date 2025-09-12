import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { configManager, Config } from './config.js';
import * as crypto from 'crypto';

interface AuthContext {
  authenticated: boolean;
  apiKey?: string;
  timestamp: number;
  requestId: string;
}

class AuthenticationMiddleware {
  private rateLimitMap: Map<string, number[]> = new Map();
  private blacklistedKeys: Set<string> = new Set();
  
  constructor(private config: Config) {}

  /**
   * Validate API key from request
   */
  validateApiKey(apiKey: string | undefined): boolean {
    if (!this.config.MCP_API_KEY_REQUIRED) {
      return true;
    }

    if (!apiKey) {
      console.error('[Auth] Missing API key');
      return false;
    }

    if (this.blacklistedKeys.has(apiKey)) {
      console.error('[Auth] Blacklisted API key attempted');
      return false;
    }

    const isValid = configManager.validateApiKey(apiKey);
    
    if (!isValid) {
      console.error('[Auth] Invalid API key');
      this.recordFailedAttempt(apiKey);
    }
    
    return isValid;
  }

  /**
   * Record failed authentication attempt
   */
  private recordFailedAttempt(apiKey: string): void {
    const attempts = this.rateLimitMap.get(apiKey) || [];
    const now = Date.now();
    
    // Keep only attempts from last hour
    const recentAttempts = attempts.filter(time => now - time < 3600000);
    recentAttempts.push(now);
    
    this.rateLimitMap.set(apiKey, recentAttempts);
    
    // Blacklist key after 5 failed attempts in an hour
    if (recentAttempts.length >= 5) {
      this.blacklistedKeys.add(apiKey);
      console.error(`[Auth] API key blacklisted after ${recentAttempts.length} failed attempts`);
    }
  }

  /**
   * Check rate limiting for authenticated requests
   */
  checkRateLimit(identifier: string): boolean {
    if (!this.config.RATE_LIMIT_ENABLED) {
      return true;
    }

    const now = Date.now();
    const requests = this.rateLimitMap.get(identifier) || [];
    
    // Filter requests within the window
    const recentRequests = requests.filter(
      time => now - time < this.config.RATE_LIMIT_WINDOW_MS
    );
    
    if (recentRequests.length >= this.config.RATE_LIMIT_MAX_REQUESTS) {
      console.error(`[RateLimit] Limit exceeded for ${identifier}`);
      return false;
    }
    
    recentRequests.push(now);
    this.rateLimitMap.set(identifier, recentRequests);
    
    return true;
  }

  /**
   * Create authentication context
   */
  createAuthContext(apiKey?: string): AuthContext {
    return {
      authenticated: this.validateApiKey(apiKey),
      apiKey: apiKey ? this.hashApiKey(apiKey) : undefined,
      timestamp: Date.now(),
      requestId: crypto.randomUUID()
    };
  }

  /**
   * Hash API key for logging
   */
  private hashApiKey(apiKey: string): string {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex')
      .substring(0, 8);
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    const maxAge = Math.max(this.config.RATE_LIMIT_WINDOW_MS, 3600000);
    
    for (const [key, times] of this.rateLimitMap.entries()) {
      const recentTimes = times.filter(time => now - time < maxAge);
      
      if (recentTimes.length === 0) {
        this.rateLimitMap.delete(key);
      } else {
        this.rateLimitMap.set(key, recentTimes);
      }
    }
  }
}

/**
 * Wrap MCP server with authentication
 */
export function wrapWithAuth(server: Server, config: Config): void {
  const auth = new AuthenticationMiddleware(config);
  
  // Clean up rate limits periodically
  setInterval(() => auth.cleanupRateLimits(), 60000);
  
  // Store original handler
  const originalSetRequestHandler = server.setRequestHandler.bind(server);
  
  // Override setRequestHandler to add authentication
  server.setRequestHandler = function(schema: any, handler: any) {
    const wrappedHandler = async (request: any) => {
      // Extract API key from request if present
      const apiKey = request.params?.apiKey || 
                     request.headers?.['x-api-key'] ||
                     process.env.MCP_CLIENT_API_KEY;
      
      // Create auth context
      const authContext = auth.createAuthContext(apiKey);
      
      // Log request
      if (config.LOG_LEVEL === 'debug') {
        console.error(`[Request ${authContext.requestId}] ${request.method} - Auth: ${authContext.authenticated}`);
      }
      
      // Check authentication
      if (!authContext.authenticated) {
        return {
          error: {
            code: -32001,
            message: 'Authentication required',
            data: { requestId: authContext.requestId }
          }
        };
      }
      
      // Check rate limiting
      const rateLimitKey = authContext.apiKey || 'anonymous';
      if (!auth.checkRateLimit(rateLimitKey)) {
        return {
          error: {
            code: -32002,
            message: 'Rate limit exceeded',
            data: { 
              requestId: authContext.requestId,
              retryAfter: config.RATE_LIMIT_WINDOW_MS
            }
          }
        };
      }
      
      // Call original handler with auth context
      try {
        const result = await handler(request, authContext);
        
        if (config.LOG_LEVEL === 'debug') {
          console.error(`[Response ${authContext.requestId}] Success`);
        }
        
        return result;
      } catch (error: any) {
        console.error(`[Error ${authContext.requestId}]`, error.message);
        throw error;
      }
    };
    
    return originalSetRequestHandler(schema, wrappedHandler);
  };
}

export { AuthContext, AuthenticationMiddleware };