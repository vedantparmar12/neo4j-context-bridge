import neo4j, { Driver, Session } from 'neo4j-driver';

let driver: Driver | null = null;

/**
 * Get or create Neo4j driver instance
 */
export function getDriver(uri: string, user: string, password: string): Driver {
  if (!driver) {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 2 * 60 * 1000, // 120 seconds
      disableLosslessIntegers: true,
    });
  }
  return driver;
}

/**
 * Execute a Neo4j operation with proper session management
 */
export async function withNeo4j<T>(
  uri: string,
  user: string,
  password: string,
  operation: (session: Session) => Promise<T>
): Promise<T> {
  const driver = getDriver(uri, user, password);
  const session = driver.session();
  const startTime = Date.now();
  
  try {
    const result = await operation(session);
    const duration = Date.now() - startTime;
    console.log(`Neo4j operation completed successfully in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Neo4j operation failed after ${duration}ms:`, error);
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