import { Entity, Relation, KnowledgeGraph } from "../types/knowledge-graph";
import { withNeo4j } from "../neo4j/connection";
import neo4j from 'neo4j-driver';

export class KnowledgeGraphStorage {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    return await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        const created: Entity[] = [];
        
        for (const entity of entities) {
          try {
            // Check if entity already exists
            const existsResult = await session.run(
              'MATCH (e:Entity {name: $name}) RETURN e',
              { name: entity.name }
            );
            
            if (existsResult.records.length === 0) {
              // Create the entity with its observations
              await session.run(
                `
                CREATE (e:Entity {
                  name: $name,
                  entityType: $entityType,
                  observations: $observations
                })
                `,
                {
                  name: entity.name,
                  entityType: entity.entityType,
                  observations: entity.observations
                }
              );
              created.push(entity);
            }
          } catch (error) {
            console.error(`Error creating entity ${entity.name}:`, error);
          }
        }
        
        return created;
      }
    );
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    return await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        const created: Relation[] = [];
        
        for (const relation of relations) {
          try {
            // Check if both entities exist
            const checkResult = await session.run(
              `
              MATCH (from:Entity {name: $from})
              MATCH (to:Entity {name: $to})
              RETURN from, to
              `,
              { from: relation.from, to: relation.to }
            );
            
            if (checkResult.records.length > 0) {
              // Check if relation already exists
              const existsResult = await session.run(
                `
                MATCH (from:Entity {name: $from})-[r:\`${relation.relationType}\`]->(to:Entity {name: $to})
                RETURN r
                `,
                { from: relation.from, to: relation.to }
              );
              
              if (existsResult.records.length === 0) {
                // Create the relation
                await session.run(
                  `
                  MATCH (from:Entity {name: $from})
                  MATCH (to:Entity {name: $to})
                  CREATE (from)-[r:\`${relation.relationType}\`]->(to)
                  `,
                  { from: relation.from, to: relation.to }
                );
                created.push(relation);
              }
            }
          } catch (error) {
            console.error(`Error creating relation ${relation.from}->${relation.to}:`, error);
          }
        }
        
        return created;
      }
    );
  }

  async addObservations(observationSets: { entityName: string; contents: string[] }[]): Promise<Record<string, string[]>> {
    return await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        const added: Record<string, string[]> = {};
        
        for (const observationSet of observationSets) {
          try {
            const result = await session.run(
              `
              MATCH (e:Entity {name: $name})
              SET e.observations = e.observations + $newObservations
              RETURN e.observations as observations
              `,
              {
                name: observationSet.entityName,
                newObservations: observationSet.contents
              }
            );
            
            if (result.records.length > 0) {
              added[observationSet.entityName] = observationSet.contents;
            }
          } catch (error) {
            console.error(`Error adding observations to ${observationSet.entityName}:`, error);
          }
        }
        
        return added;
      }
    );
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        for (const name of entityNames) {
          try {
            // Delete entity and all its relationships
            await session.run(
              'MATCH (e:Entity {name: $name}) DETACH DELETE e',
              { name }
            );
          } catch (error) {
            console.error(`Error deleting entity ${name}:`, error);
          }
        }
      }
    );
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        for (const deletion of deletions) {
          try {
            // Get current observations
            const result = await session.run(
              'MATCH (e:Entity {name: $name}) RETURN e.observations as observations',
              { name: deletion.entityName }
            );
            
            if (result.records.length > 0) {
              const currentObservations = result.records[0].get('observations') || [];
              const updatedObservations = currentObservations.filter(
                (obs: string) => !deletion.observations.includes(obs)
              );
              
              // Update observations
              await session.run(
                'MATCH (e:Entity {name: $name}) SET e.observations = $observations',
                { name: deletion.entityName, observations: updatedObservations }
              );
            }
          } catch (error) {
            console.error(`Error deleting observations from ${deletion.entityName}:`, error);
          }
        }
      }
    );
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        for (const relation of relations) {
          try {
            await session.run(
              `
              MATCH (from:Entity {name: $from})-[r:\`${relation.relationType}\`]->(to:Entity {name: $to})
              DELETE r
              `,
              { from: relation.from, to: relation.to }
            );
          } catch (error) {
            console.error(`Error deleting relation ${relation.from}->${relation.to}:`, error);
          }
        }
      }
    );
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        // Get all entities
        const entitiesResult = await session.run(
          'MATCH (e:Entity) RETURN e'
        );
        
        const entities = new Map<string, Entity>();
        for (const record of entitiesResult.records) {
          const node = record.get('e');
          const entity: Entity = {
            name: node.properties.name,
            entityType: node.properties.entityType,
            observations: node.properties.observations || []
          };
          entities.set(entity.name, entity);
        }
        
        // Get all relations
        const relationsResult = await session.run(
          'MATCH (from:Entity)-[r]->(to:Entity) RETURN from.name as from, to.name as to, type(r) as relationType'
        );
        
        const relations: Relation[] = [];
        for (const record of relationsResult.records) {
          relations.push({
            from: record.get('from'),
            to: record.get('to'),
            relationType: record.get('relationType')
          });
        }
        
        return { entities, relations };
      }
    );
  }

  async searchNodes(query: string): Promise<{ entities: Entity[]; relations: Relation[] }> {
    return await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        // Search in entity names, types, and observations
        const searchPattern = `(?i).*${query}.*`;
        
        const entitiesResult = await session.run(
          `
          MATCH (e:Entity)
          WHERE e.name =~ $pattern
             OR e.entityType =~ $pattern
             OR ANY(obs IN e.observations WHERE obs =~ $pattern)
          RETURN e
          `,
          { pattern: searchPattern }
        );
        
        const entities: Entity[] = [];
        const entityNames = new Set<string>();
        
        for (const record of entitiesResult.records) {
          const node = record.get('e');
          const entity: Entity = {
            name: node.properties.name,
            entityType: node.properties.entityType,
            observations: node.properties.observations || []
          };
          entities.push(entity);
          entityNames.add(entity.name);
        }
        
        // Get relations between found entities
        const relations: Relation[] = [];
        if (entityNames.size > 0) {
          const namesArray = Array.from(entityNames);
          const relationsResult = await session.run(
            `
            MATCH (from:Entity)-[r]->(to:Entity)
            WHERE from.name IN $names AND to.name IN $names
            RETURN from.name as from, to.name as to, type(r) as relationType
            `,
            { names: namesArray }
          );
          
          for (const record of relationsResult.records) {
            relations.push({
              from: record.get('from'),
              to: record.get('to'),
              relationType: record.get('relationType')
            });
          }
        }
        
        return { entities, relations };
      }
    );
  }

  async openNodes(names: string[]): Promise<{ entities: Entity[]; relations: Relation[] }> {
    return await withNeo4j(
      this.env.NEO4J_URI,
      this.env.NEO4J_USER,
      this.env.NEO4J_PASSWORD,
      async (session) => {
        // Get specified entities
        const entitiesResult = await session.run(
          'MATCH (e:Entity) WHERE e.name IN $names RETURN e',
          { names }
        );
        
        const entities: Entity[] = [];
        const foundNames = new Set<string>();
        
        for (const record of entitiesResult.records) {
          const node = record.get('e');
          const entity: Entity = {
            name: node.properties.name,
            entityType: node.properties.entityType,
            observations: node.properties.observations || []
          };
          entities.push(entity);
          foundNames.add(entity.name);
        }
        
        // Get relations between specified entities
        const relations: Relation[] = [];
        if (foundNames.size > 0) {
          const namesArray = Array.from(foundNames);
          const relationsResult = await session.run(
            `
            MATCH (from:Entity)-[r]->(to:Entity)
            WHERE from.name IN $names AND to.name IN $names
            RETURN from.name as from, to.name as to, type(r) as relationType
            `,
            { names: namesArray }
          );
          
          for (const record of relationsResult.records) {
            relations.push({
              from: record.get('from'),
              to: record.get('to'),
              relationType: record.get('relationType')
            });
          }
        }
        
        return { entities, relations };
      }
    );
  }
}