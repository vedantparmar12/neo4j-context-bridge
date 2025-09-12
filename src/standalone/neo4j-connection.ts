import neo4j, { Driver, Session, Config as Neo4jConfig } from 'neo4j-driver';
import { Config, configManager } from './config.js';

let driver: Driver | null = null;
let connectionRetries = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

/**
 * Get or create Neo4j driver instance with enhanced security
 */
export function getDriver(config: Config): Driver {
  if (!driver) {
    const neo4jConfig = configManager.getNeo4jConfig();
    
    const driverConfig: Neo4jConfig = {
      maxConnectionLifetime: neo4jConfig.maxConnectionLifetime,
      maxConnectionPoolSize: neo4jConfig.maxConnectionPoolSize,
      connectionAcquisitionTimeout: neo4jConfig.connectionAcquisitionTimeout,
      connectionTimeout: neo4jConfig.connectionTimeout,
      maxTransactionRetryTime: neo4jConfig.maxTransactionRetryTime,
      disableLosslessIntegers: neo4jConfig.disableLosslessIntegers,
      encrypted: neo4jConfig.encrypted,
      trust: neo4jConfig.trust,
      logging: {
        level: config.LOG_LEVEL as any,
        logger: (level: string, message: string) => {
          if (config.NODE_ENV !== 'production' || level === 'error') {
            console.error(`[Neo4j ${level}] ${message}`);
          }
        }
      }
    };
    
    // Add TLS certificate handling for production
    if (config.NODE_ENV === 'production' && neo4jConfig.encrypted) {
      if (process.env.NEO4J_CERT_PATH) {
        const fs = require('fs');
        driverConfig.trustedCertificates = [fs.readFileSync(process.env.NEO4J_CERT_PATH)];
      }
    }
    
    driver = neo4j.driver(
      neo4jConfig.uri,
      neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
      driverConfig
    );
    
    // Add connection verification
    driver.getServerInfo().catch(error => {
      console.error('Failed to verify Neo4j connection:', error);
      (driver as any) = null;
      throw error;
    });
  }
  return driver;
}

/**
 * Execute a Neo4j operation with proper session management and retry logic
 */
export async function withNeo4j<T>(
  config: Config,
  operation: (session: Session) => Promise<T>,
  retryCount: number = 0
): Promise<T> {
  const driver = getDriver(config);
  const session = driver.session({
    database: config.NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.WRITE
  });
  
  try {
    const result = await operation(session);
    connectionRetries = 0; // Reset retry counter on success
    return result;
  } catch (error: any) {
    console.error('Neo4j operation failed:', error);
    
    // Check if error is retryable
    if (isRetryableError(error) && retryCount < MAX_RETRIES) {
      console.error(`Retrying operation (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return withNeo4j(config, operation, retryCount + 1);
    }
    
    // Check for connection errors and reset driver
    if (isConnectionError(error)) {
      console.error('Connection error detected, resetting driver...');
      await closeDriver();
      (driver as any) = null;
    }
    
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: any): boolean {
  const retryableCodes = [
    'Neo.TransientError.Transaction.Terminated',
    'Neo.TransientError.Transaction.LockClientStopped',
    'Neo.TransientError.Network.CommunicationError',
    'Neo.TransientError.General.DatabaseUnavailable'
  ];
  
  return error.code && retryableCodes.includes(error.code);
}

/**
 * Check if an error is a connection error
 */
function isConnectionError(error: any): boolean {
  const connectionCodes = [
    'Neo.ClientError.Security.Unauthorized',
    'Neo.ServiceUnavailable',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT'
  ];
  
  return error.code && connectionCodes.some(code => 
    error.code.includes(code) || error.message?.includes(code)
  );
}

/**
 * Close the driver connection
 */
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Test Neo4j connection with health check
 */
export async function testNeo4jConnection(config: Config): Promise<boolean> {
  try {
    await withNeo4j(config, async (session) => {
      // Basic connectivity test
      const result = await session.run('RETURN 1 as test');
      
      // Version check for compatibility
      const versionResult = await session.run('CALL dbms.components() YIELD name, versions, edition RETURN name, versions, edition');
      const neo4jVersion = versionResult.records[0]?.get('versions')?.[0];
      console.error(`Connected to Neo4j ${neo4jVersion || 'unknown version'}`);
      
      return result.records.length > 0;
    });
    console.error('Neo4j connection test successful');
    return true;
  } catch (error) {
    console.error('Neo4j connection test failed:', error);
    return false;
  }
}

/**
 * Perform health check on Neo4j connection
 */
export async function healthCheck(config: Config): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const driver = getDriver(config);
    await driver.verifyConnectivity();
    
    const latency = Date.now() - startTime;
    return { healthy: true, latency };
  } catch (error: any) {
    return { 
      healthy: false, 
      error: error.message || 'Unknown error',
      latency: Date.now() - startTime
    };
  }
}