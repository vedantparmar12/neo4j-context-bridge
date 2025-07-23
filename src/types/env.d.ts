declare global {
  interface Env {
    NEO4J_URI: string;
    NEO4J_USER: string;
    NEO4J_PASSWORD: string;
    MAX_CONTEXT_TOKENS?: string;
    MAX_INJECTION_TOKENS?: string;
    CONTEXT_KV: KVNamespace;
    AI: Ai;
    OAUTH_KV: KVNamespace;
    MCP_OBJECT: DurableObjectNamespace;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    COOKIE_ENCRYPTION_KEY: string;
    DATABASE_URL?: string;
    SENTRY_DSN?: string;
    NODE_ENV?: string;
  }
}

export {};