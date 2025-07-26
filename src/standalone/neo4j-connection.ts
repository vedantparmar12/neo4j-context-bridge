import neo4j, { Driver, Session } from 'neo4j-driver';
import { StandaloneEnv } from './types.js';

let driver: Driver | null = null;

/**
 * Get or create Neo4j driver instance
 */
export function getDriver(env: StandaloneEnv): Driver {
  if (!driver) {
    driver = neo4j.driver(
      env.NEO4J_URI,
      neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD),
      {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 120 seconds
        disableLosslessIntegers: true,
      }
    );
  }
  return driver;
}

/**
 * Execute a Neo4j operation with proper session management
 */
export async function withNeo4j<T>(
  env: StandaloneEnv,
  operation: (session: Session) => Promise<T>
): Promise<T> {
  const driver = getDriver(env);
  const session = driver.session();
  
  try {
    const result = await operation(session);
    return result;
  } catch (error) {
    console.error('Neo4j operation failed:', error);
    throw error;
  } finally {
    await session.close();
  }
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
 * Test Neo4j connection
 */
export async function testNeo4jConnection(env: StandaloneEnv): Promise<boolean> {
  try {
    await withNeo4j(env, async (session) => {
      const result = await session.run('RETURN 1 as test');
      return result.records.length > 0;
    });
    console.error('Neo4j connection test successful');
    return true;
  } catch (error) {
    console.error('Neo4j connection test failed:', error);
    return false;
  }
}