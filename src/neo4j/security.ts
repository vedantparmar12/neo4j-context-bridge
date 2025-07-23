export interface CypherValidationResult {
  isValid: boolean;
  error?: string;
}

const DANGEROUS_CYPHER_PATTERNS = [
  /\bDROP\s+(DATABASE|CONSTRAINT|INDEX)\b/i,
  /\bDETACH\s+DELETE\b.*\bWHERE\s+1\s*=\s*1/i,
  /\bDETACH\s+DELETE\b.*\bWHERE\s+true/i,
  /\bREMOVE\b.*\.\*/i,
  /\bSET\b.*=\s*null\s+WHERE\s+1\s*=\s*1/i,
  /\bCALL\s+dbms\./i,
  /\bCALL\s+apoc\./i,
  /\bLOAD\s+CSV/i,
  /\bSYSTEM\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCREATE\s+USER\b/i,
  /\bDROP\s+USER\b/i,
  /\bALTER\s+USER\b/i,
  /:param\b/i,
  /\$\{.*\}/,
];

const ALLOWED_READ_OPERATIONS = [
  'MATCH',
  'OPTIONAL MATCH',
  'WITH',
  'WHERE',
  'RETURN',
  'ORDER BY',
  'SKIP',
  'LIMIT',
  'UNION',
  'CALL',
  'UNWIND',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END'
];

const WRITE_OPERATIONS = [
  'CREATE',
  'MERGE',
  'SET',
  'DELETE',
  'DETACH DELETE',
  'REMOVE',
  'FOREACH'
];

export function validateCypherQuery(query: string): CypherValidationResult {
  const normalizedQuery = query.trim();
  
  if (!normalizedQuery) {
    return { isValid: false, error: 'Query cannot be empty' };
  }

  for (const pattern of DANGEROUS_CYPHER_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return { 
        isValid: false, 
        error: `Dangerous operation detected: ${pattern.toString()}` 
      };
    }
  }

  if (normalizedQuery.includes('//') || normalizedQuery.includes('/*')) {
    return { isValid: false, error: 'Comments are not allowed in queries' };
  }

  const queryLength = normalizedQuery.length;
  if (queryLength > 5000) {
    return { 
      isValid: false, 
      error: `Query too long: ${queryLength} characters (max 5000)` 
    };
  }

  return { isValid: true };
}

export function isWriteOperation(query: string): boolean {
  const upperQuery = query.trim().toUpperCase();
  return WRITE_OPERATIONS.some(op => {
    const regex = new RegExp(`\\b${op}\\b`);
    return regex.test(upperQuery);
  });
}

export function isReadOnlyQuery(query: string): boolean {
  const upperQuery = query.trim().toUpperCase();
  
  const hasWriteOp = isWriteOperation(query);
  if (hasWriteOp) {
    return false;
  }

  const words = upperQuery.split(/\s+/);
  const firstWord = words[0];
  
  return ALLOWED_READ_OPERATIONS.some(op => op === firstWord);
}

export function sanitizeParameters(params: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('$') || key.includes('.')) {
      console.warn(`Skipping potentially dangerous parameter: ${key}`);
      continue;
    }

    if (typeof value === 'string') {
      if (value.includes('$') || value.includes('{') || value.includes('}')) {
        console.warn(`Skipping parameter with potential injection: ${key}`);
        continue;
      }
      sanitized[key] = value.slice(0, 1000);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 100).map(v => 
        typeof v === 'string' ? v.slice(0, 1000) : v
      );
    } else if (value === null || value === undefined) {
      sanitized[key] = null;
    } else {
      console.warn(`Skipping parameter with unsupported type: ${key} (${typeof value})`);
    }
  }
  
  return sanitized;
}

export function createParameterizedQuery(
  template: string, 
  params: Record<string, any>
): { query: string; parameters: Record<string, any> } {
  const sanitizedParams = sanitizeParameters(params);
  
  let parameterizedQuery = template;
  const usedParams: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(sanitizedParams)) {
    const placeholder = `$${key}`;
    if (parameterizedQuery.includes(placeholder)) {
      usedParams[key] = value;
    }
  }
  
  return {
    query: parameterizedQuery,
    parameters: usedParams
  };
}

export function checkUserPermissions(
  username: string,
  operation: 'read' | 'write' | 'admin'
): boolean {
  const ADMIN_USERS = new Set<string>([
    'coleam00'
  ]);
  
  const WRITE_USERS = new Set<string>([
    ...ADMIN_USERS
  ]);
  
  switch (operation) {
    case 'admin':
      return ADMIN_USERS.has(username);
    case 'write':
      return WRITE_USERS.has(username);
    case 'read':
      return true;
    default:
      return false;
  }
}

export function obfuscateConnectionString(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return uri.replace(/:[^:@]+@/, ':***@');
  }
}