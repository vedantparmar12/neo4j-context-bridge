# Security Configuration Guide

This guide covers the security features and best practices for the Neo4j MCP Server.

## Table of Contents
- [Environment Variables](#environment-variables)
- [TLS/SSL Configuration](#tlsssl-configuration)
- [API Key Authentication](#api-key-authentication)
- [Cypher Query Validation](#cypher-query-validation)
- [Rate Limiting](#rate-limiting)
- [Best Practices](#best-practices)

## Environment Variables

Never commit sensitive information to version control. Use environment variables or a `.env` file (excluded from git).

1. Copy the example configuration:
```bash
cp .env.example .env
```

2. Update the `.env` file with your secure credentials:
```bash
# Generate a secure password
openssl rand -base64 32

# Generate a secure API key
openssl rand -hex 32
```

## TLS/SSL Configuration

### Enable Encrypted Connections

1. **Use encrypted protocol** in your Neo4j URI:
```env
# Instead of neo4j://
NEO4J_URI=neo4j+s://localhost:7687

# Or for bolt
NEO4J_URI=bolt+s://localhost:7687
```

2. **Configure trust strategy**:
```env
# For production with valid certificates
NEO4J_TRUST=TRUST_SYSTEM_CA_SIGNED_CERTIFICATES

# For development/testing
NEO4J_TRUST=TRUST_ALL_CERTIFICATES

# For custom CA certificates
NEO4J_TRUST=TRUST_CUSTOM_CA_SIGNED_CERTIFICATES
NEO4J_CERT_PATH=/path/to/ca-certificate.pem
```

### Neo4j Server TLS Setup

1. Enable TLS in Neo4j configuration (`neo4j.conf`):
```properties
dbms.ssl.policy.bolt.enabled=true
dbms.ssl.policy.bolt.base_directory=certificates
dbms.ssl.policy.bolt.private_key=private.key
dbms.ssl.policy.bolt.public_certificate=public.crt
```

2. Generate certificates for Neo4j:
```bash
# Generate private key
openssl genrsa -out private.key 2048

# Generate certificate signing request
openssl req -new -key private.key -out server.csr

# Generate self-signed certificate (for testing)
openssl x509 -req -days 365 -in server.csr -signkey private.key -out public.crt
```

## API Key Authentication

### Enable API Key Protection

1. **Generate a secure API key**:
```bash
openssl rand -hex 32
```

2. **Configure in environment**:
```env
MCP_API_KEY=your-generated-api-key-here
MCP_API_KEY_REQUIRED=true
```

3. **Client configuration** in Claude Desktop:
```json
{
  "mcpServers": {
    "neo4j-memory": {
      "command": "node",
      "args": ["dist/standalone-server.js"],
      "env": {
        "MCP_CLIENT_API_KEY": "your-api-key-here",
        "NEO4J_URI": "neo4j+s://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "secure-password"
      }
    }
  }
}
```

### API Key Management

- Rotate API keys regularly (recommended: every 90 days)
- Use different keys for different environments
- Monitor failed authentication attempts
- Keys are automatically blacklisted after 5 failed attempts

## Cypher Query Validation

The server automatically validates and sanitizes all Cypher queries to prevent injection attacks.

### Blocked Operations

The following operations are automatically blocked:
- `DROP` statements
- User management (`CREATE USER`, `ALTER USER`, `DROP USER`)
- Role management (`CREATE ROLE`, `DROP ROLE`)
- Permission changes (`GRANT`, `REVOKE`, `DENY`)
- System procedures (`apoc.system.*`)
- File operations (`LOAD CSV`, `apoc.export.*`, `apoc.import.*`)

### Safe Query Practices

1. **Use parameterized queries**:
```javascript
// Good - uses parameters
const query = "MATCH (n:Person {name: $name}) RETURN n";
const params = { name: userInput };

// Bad - string concatenation
const query = `MATCH (n:Person {name: '${userInput}'}) RETURN n`;
```

2. **Validate entity names**:
```javascript
// Entity names are automatically validated
// Only alphanumeric, underscore, hyphen, and dot allowed
// Maximum 255 characters
```

## Rate Limiting

Protect against abuse with built-in rate limiting:

```env
# Enable rate limiting
RATE_LIMIT_ENABLED=true

# Maximum requests per window
RATE_LIMIT_MAX_REQUESTS=100

# Time window in milliseconds (1 minute)
RATE_LIMIT_WINDOW_MS=60000
```

Rate limits are applied per API key (or IP for anonymous requests).

## Best Practices

### 1. Production Deployment

```env
# Production configuration
NODE_ENV=production
NEO4J_URI=neo4j+s://production-server:7687
NEO4J_ENCRYPTED=true
NEO4J_TRUST=TRUST_SYSTEM_CA_SIGNED_CERTIFICATES
MCP_API_KEY_REQUIRED=true
RATE_LIMIT_ENABLED=true
LOG_LEVEL=error
```

### 2. Password Requirements

- Minimum 12 characters for production
- Include uppercase, lowercase, numbers, and symbols
- Avoid dictionary words and personal information
- Use a password manager

### 3. Network Security

- Use firewall rules to restrict Neo4j access
- Enable Neo4j authentication
- Use VPN or private networks for database connections
- Implement IP whitelisting if possible

### 4. Monitoring

- Monitor failed authentication attempts
- Track rate limit violations
- Log suspicious query patterns
- Set up alerts for security events

### 5. Regular Updates

- Keep Neo4j server updated
- Update Node.js and dependencies regularly
- Review security advisories
- Perform security audits

## Security Checklist

Before deploying to production:

- [ ] Environment variables configured (not hardcoded)
- [ ] TLS/SSL enabled for Neo4j connections
- [ ] Strong passwords set (12+ characters)
- [ ] API key authentication enabled
- [ ] Rate limiting configured
- [ ] Logging level appropriate for environment
- [ ] Network security rules in place
- [ ] Regular backup strategy implemented
- [ ] Monitoring and alerting configured
- [ ] Security updates applied

## Reporting Security Issues

If you discover a security vulnerability, please email security@example.com with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

Do not create public issues for security vulnerabilities.