import { withNeo4j } from './neo4j-connection.js';
import { Entity, Relation, StandaloneEnv } from './types.js';

export class KnowledgeGraphStorage {
  constructor(private env: StandaloneEnv) {}

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    return withNeo4j(this.env, async (session) => {
      const created: Entity[] = [];
      
      for (const entity of entities) {
        try {
          const result = await session.run(
            `
            MERGE (e:Entity {name: $name})
            ON CREATE SET 
              e.entityType = $entityType,
              e.observations = $observations,
              e.createdAt = datetime()
            ON MATCH SET
              e.observations = CASE 
                WHEN e.observations IS NULL THEN $observations
                ELSE e.observations + [obs IN $observations WHERE NOT obs IN e.observations]
              END,
              e.updatedAt = datetime()
            RETURN e.name as name, e.entityType as entityType, e.observations as observations
            `,
            {
              name: entity.name,
              entityType: entity.entityType,
              observations: entity.observations
            }
          );
          
          if (result.records.length > 0) {
            created.push({
              name: result.records[0].get('name'),
              entityType: result.records[0].get('entityType'),
              observations: result.records[0].get('observations') || []
            });
          }
        } catch (error) {
          console.error(`Failed to create entity ${entity.name}:`, error);
        }
      }
      
      return created;
    });
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    return withNeo4j(this.env, async (session) => {
      const created: Relation[] = [];
      
      for (const relation of relations) {
        try {
          const result = await session.run(
            `
            MATCH (from:Entity {name: $from})
            MATCH (to:Entity {name: $to})
            MERGE (from)-[r:RELATED {type: $relationType}]->(to)
            ON CREATE SET r.createdAt = datetime()
            RETURN $from as from, $to as to, $relationType as relationType
            `,
            {
              from: relation.from,
              to: relation.to,
              relationType: relation.relationType
            }
          );
          
          if (result.records.length > 0) {
            created.push({
              from: result.records[0].get('from'),
              to: result.records[0].get('to'),
              relationType: result.records[0].get('relationType')
            });
          }
        } catch (error) {
          console.error(`Failed to create relation ${relation.from}->${relation.to}:`, error);
        }
      }
      
      return created;
    });
  }

  async addObservations(entityName: string, observations: string[]): Promise<string[]> {
    return withNeo4j(this.env, async (session) => {
      const result = await session.run(
        `
        MATCH (e:Entity {name: $name})
        SET e.observations = CASE 
          WHEN e.observations IS NULL THEN $observations
          ELSE e.observations + [obs IN $observations WHERE NOT obs IN e.observations]
        END,
        e.updatedAt = datetime()
        RETURN e.observations as observations
        `,
        { name: entityName, observations }
      );
      
      if (result.records.length > 0) {
        return result.records[0].get('observations') || [];
      }
      throw new Error(`Entity ${entityName} not found`);
    });
  }

  async deleteEntities(names: string[]): Promise<number> {
    return withNeo4j(this.env, async (session) => {
      const result = await session.run(
        `
        MATCH (e:Entity)
        WHERE e.name IN $names
        DETACH DELETE e
        RETURN count(e) as count
        `,
        { names }
      );
      
      return result.records[0].get('count').toNumber();
    });
  }

  async deleteRelations(relations: Relation[]): Promise<number> {
    return withNeo4j(this.env, async (session) => {
      let count = 0;
      
      for (const relation of relations) {
        const result = await session.run(
          `
          MATCH (from:Entity {name: $from})-[r:RELATED {type: $relationType}]->(to:Entity {name: $to})
          DELETE r
          RETURN count(r) as count
          `,
          {
            from: relation.from,
            to: relation.to,
            relationType: relation.relationType
          }
        );
        
        count += result.records[0].get('count').toNumber();
      }
      
      return count;
    });
  }

  async deleteObservations(entityName: string, observations: string[]): Promise<string[]> {
    return withNeo4j(this.env, async (session) => {
      const result = await session.run(
        `
        MATCH (e:Entity {name: $name})
        SET e.observations = [obs IN e.observations WHERE NOT obs IN $observations],
            e.updatedAt = datetime()
        RETURN e.observations as observations
        `,
        { name: entityName, observations }
      );
      
      if (result.records.length > 0) {
        return result.records[0].get('observations') || [];
      }
      throw new Error(`Entity ${entityName} not found`);
    });
  }

  async readGraph(): Promise<{ entities: Entity[], relations: Relation[] }> {
    return withNeo4j(this.env, async (session) => {
      // Get all entities
      const entitiesResult = await session.run(`
        MATCH (e:Entity)
        RETURN e.name as name, e.entityType as entityType, e.observations as observations
        ORDER BY e.name
      `);
      
      const entities = entitiesResult.records.map(record => ({
        name: record.get('name'),
        entityType: record.get('entityType'),
        observations: record.get('observations') || []
      }));
      
      // Get all relations
      const relationsResult = await session.run(`
        MATCH (from:Entity)-[r:RELATED]->(to:Entity)
        RETURN from.name as from, to.name as to, r.type as relationType
        ORDER BY from.name, to.name
      `);
      
      const relations = relationsResult.records.map(record => ({
        from: record.get('from'),
        to: record.get('to'),
        relationType: record.get('relationType')
      }));
      
      return { entities, relations };
    });
  }

  async searchNodes(query: string): Promise<Entity[]> {
    return withNeo4j(this.env, async (session) => {
      const result = await session.run(
        `
        MATCH (e:Entity)
        WHERE toLower(e.name) CONTAINS toLower($query)
           OR toLower(e.entityType) CONTAINS toLower($query)
           OR ANY(obs IN e.observations WHERE toLower(obs) CONTAINS toLower($query))
        RETURN e.name as name, e.entityType as entityType, e.observations as observations
        ORDER BY e.name
        LIMIT 50
        `,
        { query }
      );
      
      return result.records.map(record => ({
        name: record.get('name'),
        entityType: record.get('entityType'),
        observations: record.get('observations') || []
      }));
    });
  }

  async openNodes(names: string[]): Promise<{ entities: Entity[], relations: Relation[] }> {
    return withNeo4j(this.env, async (session) => {
      // Get specified entities
      const entitiesResult = await session.run(
        `
        MATCH (e:Entity)
        WHERE e.name IN $names
        RETURN e.name as name, e.entityType as entityType, e.observations as observations
        `,
        { names }
      );
      
      const entities = entitiesResult.records.map(record => ({
        name: record.get('name'),
        entityType: record.get('entityType'),
        observations: record.get('observations') || []
      }));
      
      // Get relations between these entities
      const relationsResult = await session.run(
        `
        MATCH (from:Entity)-[r:RELATED]->(to:Entity)
        WHERE from.name IN $names AND to.name IN $names
        RETURN from.name as from, to.name as to, r.type as relationType
        `,
        { names }
      );
      
      const relations = relationsResult.records.map(record => ({
        from: record.get('from'),
        to: record.get('to'),
        relationType: record.get('relationType')
      }));
      
      return { entities, relations };
    });
  }

  async storeConversationMessage(user: string, role: string, content: string, hasCode: boolean = false): Promise<string> {
    return withNeo4j(this.env, async (session) => {
      const timestamp = new Date().toISOString();
      const messageId = `msg_${user}_${Date.now()}`;
      
      const result = await session.run(
        `
        MERGE (u:Entity {name: $user})
        ON CREATE SET u.entityType = 'person', u.createdAt = datetime()
        CREATE (m:Message {
          id: $messageId,
          role: $role,
          content: $content,
          timestamp: $timestamp,
          hasCode: $hasCode
        })
        CREATE (u)-[:HAS_MESSAGE]->(m)
        RETURN m.id as messageId
        `,
        { user, messageId, role, content, timestamp, hasCode }
      );
      
      return result.records[0].get('messageId');
    });
  }

  async storeCodeSnippet(user: string, code: any, relatedEntities: string[] = []): Promise<string> {
    return withNeo4j(this.env, async (session) => {
      const codeId = `code_${user}_${Date.now()}`;
      const timestamp = new Date().toISOString();
      
      // Create code entity
      const result = await session.run(
        `
        MERGE (u:Entity {name: $user})
        ON CREATE SET u.entityType = 'person', u.createdAt = datetime()
        CREATE (c:CodeSnippet {
          id: $codeId,
          content: $content,
          language: $language,
          filename: $filename,
          description: $description,
          context: $context,
          timestamp: $timestamp
        })
        CREATE (u)-[:WROTE_CODE]->(c)
        RETURN c.id as codeId
        `,
        {
          user,
          codeId,
          content: code.content,
          language: code.language || 'unknown',
          filename: code.filename || null,
          description: code.description || null,
          context: code.context || null,
          timestamp
        }
      );
      
      // Link to related entities if any
      if (relatedEntities.length > 0) {
        for (const entityName of relatedEntities) {
          await session.run(
            `
            MATCH (c:CodeSnippet {id: $codeId})
            MATCH (e:Entity {name: $entityName})
            CREATE (c)-[:RELATES_TO]->(e)
            `,
            { codeId, entityName }
          );
        }
      }
      
      return result.records[0].get('codeId');
    });
  }

  async getConversationHistory(user: string, limit: number = 50): Promise<any[]> {
    return withNeo4j(this.env, async (session) => {
      const result = await session.run(
        `
        MATCH (u:Entity {name: $user})-[:HAS_MESSAGE]->(m:Message)
        RETURN m.id as id, m.role as role, m.content as content, 
               m.timestamp as timestamp, m.hasCode as hasCode
        ORDER BY m.timestamp DESC
        LIMIT $limit
        `,
        { user, limit }
      );
      
      return result.records.map(record => ({
        id: record.get('id'),
        role: record.get('role'),
        content: record.get('content'),
        timestamp: record.get('timestamp'),
        hasCode: record.get('hasCode')
      })).reverse(); // Reverse to get chronological order
    });
  }

  async getCodeSnippets(user: string, limit: number = 20): Promise<any[]> {
    return withNeo4j(this.env, async (session) => {
      const result = await session.run(
        `
        MATCH (u:Entity {name: $user})-[:WROTE_CODE]->(c:CodeSnippet)
        OPTIONAL MATCH (c)-[:RELATES_TO]->(e:Entity)
        RETURN c.id as id, c.content as content, c.language as language,
               c.filename as filename, c.description as description,
               c.context as context, c.timestamp as timestamp,
               collect(e.name) as relatedEntities
        ORDER BY c.timestamp DESC
        LIMIT $limit
        `,
        { user, limit }
      );
      
      return result.records.map(record => ({
        id: record.get('id'),
        content: record.get('content'),
        language: record.get('language'),
        filename: record.get('filename'),
        description: record.get('description'),
        context: record.get('context'),
        timestamp: record.get('timestamp'),
        relatedEntities: record.get('relatedEntities')
      }));
    });
  }
}