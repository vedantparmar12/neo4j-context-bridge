import { z } from 'zod';

/**
 * Cypher query validator to prevent injection attacks
 */
export class CypherValidator {
  // Dangerous Cypher commands that should be blocked
  private static readonly DANGEROUS_COMMANDS = [
    'DROP',
    'DETACH DELETE',
    'REMOVE',
    'SET.*PASSWORD',
    'CREATE USER',
    'DROP USER',
    'ALTER USER',
    'CREATE ROLE',
    'DROP ROLE',
    'GRANT',
    'REVOKE',
    'DENY',
    'dbms\\.changePassword',
    'dbms\\.security',
    'apoc\\.system',
    'apoc\\.cypher\\.runFile',
    'apoc\\.export',
    'apoc\\.import',
  ];

  // Patterns that might indicate injection attempts
  private static readonly SUSPICIOUS_PATTERNS = [
    /;\s*(DROP|DELETE|REMOVE|CREATE USER|ALTER)/gi,
    /\/\*.*\*\//g, // Block comments
    /--.*$/gm, // Line comments
    /\$\{.*\}/g, // Template literals
    /\bEVAL\b/gi,
    /\bLOAD\s+CSV/gi, // Prevent external data loading
    /\bCALL\s+apoc\./gi, // Restrict APOC procedures
    /\bunion\s+all/gi, // Prevent union injection
  ];

  // Allowed read-only commands for safe queries
  private static readonly SAFE_READ_COMMANDS = [
    'MATCH',
    'RETURN',
    'WITH',
    'WHERE',
    'ORDER BY',
    'LIMIT',
    'SKIP',
    'OPTIONAL MATCH',
    'UNWIND',
    'CALL db.labels',
    'CALL db.relationshipTypes',
    'CALL db.propertyKeys',
    'CALL db.schema',
    'SHOW',
  ];

  /**
   * Validate a Cypher query for safety
   */
  static validateQuery(query: string, allowWrite: boolean = true): {
    valid: boolean;
    error?: string;
    sanitized?: string;
  } {
    if (!query || typeof query !== 'string') {
      return { valid: false, error: 'Query must be a non-empty string' };
    }

    // Check length limits
    if (query.length > 10000) {
      return { valid: false, error: 'Query exceeds maximum length of 10000 characters' };
    }

    // Normalize query for checking
    const normalizedQuery = query.toUpperCase().trim();

    // Check for dangerous commands
    for (const command of this.DANGEROUS_COMMANDS) {
      const regex = new RegExp(`\\b${command}\\b`, 'i');
      if (regex.test(query)) {
        return {
          valid: false,
          error: `Query contains restricted command: ${command}`
        };
      }
    }

    // Check for suspicious patterns
    for (const pattern of this.SUSPICIOUS_PATTERNS) {
      if (pattern.test(query)) {
        return {
          valid: false,
          error: 'Query contains suspicious patterns that may indicate injection attempt'
        };
      }
    }

    // If write is not allowed, ensure query is read-only
    if (!allowWrite) {
      const hasWriteOperation = /\b(CREATE|MERGE|DELETE|REMOVE|SET)\b/i.test(query);
      if (hasWriteOperation) {
        return {
          valid: false,
          error: 'Write operations are not allowed in read-only mode'
        };
      }
    }

    // Additional validation for specific operations
    if (/\bDELETE\b/i.test(query) && !/\bWHERE\b/i.test(query)) {
      return {
        valid: false,
        error: 'DELETE operations must include a WHERE clause for safety'
      };
    }

    return {
      valid: true,
      sanitized: this.sanitizeQuery(query)
    };
  }

  /**
   * Sanitize query parameters
   */
  static sanitizeParameters(params: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      // Validate parameter names
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        throw new Error(`Invalid parameter name: ${key}`);
      }

      // Sanitize parameter values
      if (typeof value === 'string') {
        // Remove potential injection patterns from strings
        sanitized[key] = value
          .replace(/[;'"`]/g, '') // Remove dangerous characters
          .substring(0, 1000); // Limit string length
      } else if (typeof value === 'number') {
        // Validate numbers
        if (!Number.isFinite(value)) {
          throw new Error(`Invalid numeric parameter: ${key}`);
        }
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (value === null || value === undefined) {
        sanitized[key] = null;
      } else if (Array.isArray(value)) {
        // Recursively sanitize array elements
        sanitized[key] = value.map(item => {
          if (typeof item === 'string') {
            return item.replace(/[;'"`]/g, '').substring(0, 1000);
          }
          return item;
        });
      } else if (typeof value === 'object') {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeParameters(value);
      } else {
        throw new Error(`Unsupported parameter type for ${key}`);
      }
    }

    return sanitized;
  }

  /**
   * Basic query sanitization
   */
  private static sanitizeQuery(query: string): string {
    // Remove comments
    let sanitized = query
      .replace(/\/\*[\s\S]*?\*\//g, '') // Block comments
      .replace(/--.*$/gm, ''); // Line comments

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Validate entity names to prevent injection
   */
  static validateEntityName(name: string): boolean {
    if (!name || typeof name !== 'string') {
      return false;
    }

    // Entity names should be alphanumeric with underscores, hyphens, and dots
    // Maximum length of 255 characters
    const validPattern = /^[a-zA-Z0-9_\-\.]{1,255}$/;
    return validPattern.test(name);
  }

  /**
   * Validate and sanitize property paths
   */
  static validatePropertyPath(path: string): boolean {
    if (!path || typeof path !== 'string') {
      return false;
    }

    // Property paths should only contain valid identifiers and dots
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
    return validPattern.test(path);
  }

  /**
   * Create a safe parameterized query
   */
  static createParameterizedQuery(
    template: string,
    params: Record<string, any>
  ): { query: string; parameters: Record<string, any> } {
    // Validate the template doesn't contain injection attempts
    const validation = this.validateQuery(template);
    if (!validation.valid) {
      throw new Error(`Invalid query template: ${validation.error}`);
    }

    // Sanitize parameters
    const sanitizedParams = this.sanitizeParameters(params);

    // Ensure all placeholders in the query have corresponding parameters
    const placeholders = template.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    for (const placeholder of placeholders) {
      const paramName = placeholder.substring(1);
      if (!(paramName in sanitizedParams)) {
        throw new Error(`Missing parameter: ${paramName}`);
      }
    }

    return {
      query: validation.sanitized || template,
      parameters: sanitizedParams
    };
  }
}

/**
 * Cypher query builder for safe query construction
 */
export class CypherQueryBuilder {
  private clauses: string[] = [];
  private parameters: Record<string, any> = {};
  private paramCounter = 0;

  match(pattern: string): this {
    this.clauses.push(`MATCH ${pattern}`);
    return this;
  }

  where(condition: string): this {
    this.clauses.push(`WHERE ${condition}`);
    return this;
  }

  create(pattern: string): this {
    this.clauses.push(`CREATE ${pattern}`);
    return this;
  }

  merge(pattern: string): this {
    this.clauses.push(`MERGE ${pattern}`);
    return this;
  }

  set(assignments: string): this {
    this.clauses.push(`SET ${assignments}`);
    return this;
  }

  delete(targets: string): this {
    this.clauses.push(`DELETE ${targets}`);
    return this;
  }

  return(expressions: string): this {
    this.clauses.push(`RETURN ${expressions}`);
    return this;
  }

  orderBy(expression: string): this {
    this.clauses.push(`ORDER BY ${expression}`);
    return this;
  }

  limit(count: number): this {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('Limit must be a non-negative integer');
    }
    this.clauses.push(`LIMIT ${count}`);
    return this;
  }

  skip(count: number): this {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('Skip must be a non-negative integer');
    }
    this.clauses.push(`SKIP ${count}`);
    return this;
  }

  addParameter(value: any): string {
    const paramName = `param${this.paramCounter++}`;
    this.parameters[paramName] = value;
    return `$${paramName}`;
  }

  build(): { query: string; parameters: Record<string, any> } {
    const query = this.clauses.join('\n');
    return CypherValidator.createParameterizedQuery(query, this.parameters);
  }
}

// Export schemas for validation
export const CypherQuerySchema = z.object({
  query: z.string().min(1).max(10000),
  parameters: z.record(z.any()).optional(),
  allowWrite: z.boolean().default(true)
});

export type CypherQueryInput = z.infer<typeof CypherQuerySchema>;