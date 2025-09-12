import { withNeo4j } from './neo4j-connection.js';
import { Entity, Relation, StandaloneEnv } from './types.js';
import { OllamaClient } from './ollama-client.js';

export interface LightRAGEntity extends Entity {
  embedding?: number[];
  importance_score?: number;
  creation_context?: string;
  keywords?: string[];
}

export interface LightRAGRelation extends Relation {
  strength_score: number;
  description: string;
  keywords: string[];
}

export interface QueryContext {
  low_level_keywords: string[];
  high_level_keywords: string[];
  query_embedding: number[];
}

export interface RetrievalResult {
  entities: LightRAGEntity[];
  relations: LightRAGRelation[];
  relevance_scores: Record<string, number>;
  subgraphs: Array<{
    entities: LightRAGEntity[];
    relations: LightRAGRelation[];
    score: number;
  }>;
}

export class LightRAGStorage {
  private ollama: OllamaClient;

  constructor(private env: StandaloneEnv) {
    this.ollama = new OllamaClient(env);
  }

  async initializeSchema(): Promise<void> {
    return withNeo4j(this.env, async (session) => {
      // Create vector indexes for embeddings
      const queries = [
        // Entity embedding index
        `CREATE VECTOR INDEX entity_embeddings IF NOT EXISTS
         FOR (e:Entity) ON (e.embedding)
         OPTIONS {indexConfig: {
           \`vector.dimensions\`: ${this.env.LIGHTRAG_EMBEDDING_DIMENSION || 768},
           \`vector.similarity_function\`: 'cosine'
         }}`,
        
        // Add constraints and indexes for performance
        `CREATE CONSTRAINT entity_name_unique IF NOT EXISTS 
         FOR (e:Entity) REQUIRE e.name IS UNIQUE`,
        
        `CREATE INDEX entity_type_idx IF NOT EXISTS 
         FOR (e:Entity) ON (e.entityType)`,
        
        `CREATE INDEX entity_importance_idx IF NOT EXISTS 
         FOR (e:Entity) ON (e.importance_score)`,
        
        `CREATE INDEX relation_strength_idx IF NOT EXISTS 
         FOR ()-[r:RELATED]-() ON (r.strength_score)`,
        
        `CREATE INDEX relation_type_idx IF NOT EXISTS 
         FOR ()-[r:RELATED]-() ON (r.type)`,
      ];

      for (const query of queries) {
        try {
          await session.run(query);
        } catch (error) {
          // Index might already exist, continue
          console.warn(`Schema query warning: ${error}`);
        }
      }
    });
  }

  async createLightRAGEntities(entities: LightRAGEntity[]): Promise<LightRAGEntity[]> {
    return withNeo4j(this.env, async (session) => {
      const created: LightRAGEntity[] = [];
      
      for (const entity of entities) {
        try {
          // Generate embedding if not provided
          let embedding = entity.embedding;
          if (!embedding && entity.name) {
            embedding = await this.ollama.generateEmbedding(
              `${entity.name} ${entity.observations?.join(' ') || ''}`
            );
          }

          const result = await session.run(
            `
            MERGE (e:Entity {name: $name})
            ON CREATE SET 
              e.entityType = $entityType,
              e.observations = $observations,
              e.embedding = $embedding,
              e.importance_score = $importance_score,
              e.creation_context = $creation_context,
              e.keywords = $keywords,
              e.createdAt = datetime()
            ON MATCH SET
              e.observations = CASE 
                WHEN e.observations IS NULL THEN $observations
                ELSE e.observations + [obs IN $observations WHERE NOT obs IN e.observations]
              END,
              e.embedding = CASE 
                WHEN e.embedding IS NULL THEN $embedding
                ELSE e.embedding
              END,
              e.importance_score = CASE
                WHEN $importance_score > coalesce(e.importance_score, 0) THEN $importance_score
                ELSE e.importance_score
              END,
              e.keywords = CASE
                WHEN e.keywords IS NULL THEN $keywords
                ELSE e.keywords + [kw IN $keywords WHERE NOT kw IN e.keywords]
              END,
              e.updatedAt = datetime()
            RETURN e.name as name, e.entityType as entityType, e.observations as observations,
                   e.embedding as embedding, e.importance_score as importance_score,
                   e.creation_context as creation_context, e.keywords as keywords
            `,
            {
              name: entity.name,
              entityType: entity.entityType,
              observations: entity.observations || [],
              embedding: embedding,
              importance_score: entity.importance_score || 0.5,
              creation_context: entity.creation_context || '',
              keywords: entity.keywords || []
            }
          );
          
          if (result.records.length > 0) {
            const record = result.records[0];
            created.push({
              name: record.get('name'),
              entityType: record.get('entityType'),
              observations: record.get('observations') || [],
              embedding: record.get('embedding'),
              importance_score: record.get('importance_score'),
              creation_context: record.get('creation_context'),
              keywords: record.get('keywords') || []
            });
          }
        } catch (error) {
          console.error(`Failed to create LightRAG entity ${entity.name}:`, error);
        }
      }
      
      return created;
    });
  }

  async createLightRAGRelations(relations: LightRAGRelation[]): Promise<LightRAGRelation[]> {
    return withNeo4j(this.env, async (session) => {
      const created: LightRAGRelation[] = [];
      
      for (const relation of relations) {
        try {
          const result = await session.run(
            `
            MATCH (from:Entity {name: $from})
            MATCH (to:Entity {name: $to})
            MERGE (from)-[r:RELATED {type: $relationType}]->(to)
            ON CREATE SET 
              r.strength_score = $strength_score,
              r.description = $description,
              r.keywords = $keywords,
              r.createdAt = datetime()
            ON MATCH SET
              r.strength_score = CASE
                WHEN $strength_score > r.strength_score THEN $strength_score
                ELSE r.strength_score
              END,
              r.keywords = r.keywords + [kw IN $keywords WHERE NOT kw IN r.keywords],
              r.updatedAt = datetime()
            RETURN $from as from, $to as to, $relationType as relationType,
                   r.strength_score as strength_score, r.description as description,
                   r.keywords as keywords
            `,
            {
              from: relation.from,
              to: relation.to,
              relationType: relation.relationType,
              strength_score: relation.strength_score,
              description: relation.description,
              keywords: relation.keywords
            }
          );
          
          if (result.records.length > 0) {
            const record = result.records[0];
            created.push({
              from: record.get('from'),
              to: record.get('to'),
              relationType: record.get('relationType'),
              strength_score: record.get('strength_score'),
              description: record.get('description'),
              keywords: record.get('keywords') || []
            });
          }
        } catch (error) {
          console.error(`Failed to create LightRAG relation ${relation.from}->${relation.to}:`, error);
        }
      }
      
      return created;
    });
  }

  async extractDualLevelKeywords(query: string): Promise<QueryContext> {
    try {
      const keywords = await this.ollama.extractDualLevelKeywords(query);
      const queryEmbedding = await this.ollama.generateEmbedding(query);
      
      return {
        low_level_keywords: keywords.low_level_keywords,
        high_level_keywords: keywords.high_level_keywords,
        query_embedding: queryEmbedding
      };
    } catch (error) {
      console.error('Failed to extract dual-level keywords:', error);
      return {
        low_level_keywords: [query],
        high_level_keywords: [],
        query_embedding: []
      };
    }
  }

  async retrieveWithLightRAG(query: string): Promise<RetrievalResult> {
    return withNeo4j(this.env, async (session) => {
      const queryContext = await this.extractDualLevelKeywords(query);
      const similarityThreshold = Number(this.env.LIGHTRAG_SIMILARITY_THRESHOLD) || 0.7;
      const maxHops = Number(this.env.LIGHTRAG_MAX_HOPS) || 3;
      
      // Low-level retrieval: specific entities
      const lowLevelEntities = await this.retrieveLowLevelEntities(session, queryContext);
      
      // High-level retrieval: thematic entities
      const highLevelEntities = await this.retrieveHighLevelEntities(session, queryContext);
      
      // Vector similarity retrieval
      const vectorEntities = await this.retrieveVectorSimilarEntities(session, queryContext, similarityThreshold);
      
      // Combine and deduplicate entities
      const allEntitiesMap = new Map<string, LightRAGEntity>();
      [...lowLevelEntities, ...highLevelEntities, ...vectorEntities].forEach(entity => {
        allEntitiesMap.set(entity.name, entity);
      });
      const entities = Array.from(allEntitiesMap.values());
      
      // Get relations between retrieved entities
      const relations = await this.getRelationsBetweenEntities(session, entities.map(e => e.name));
      
      // Calculate relevance scores
      const relevanceScores = this.calculateRelevanceScores(entities, queryContext);
      
      // Generate subgraphs with multi-hop analysis
      const subgraphs = await this.generateSubgraphs(session, entities, maxHops);
      
      return {
        entities,
        relations,
        relevance_scores: relevanceScores,
        subgraphs
      };
    });
  }

  private async retrieveLowLevelEntities(session: any, context: QueryContext): Promise<LightRAGEntity[]> {
    if (context.low_level_keywords.length === 0) return [];
    
    const result = await session.run(
      `
      MATCH (e:Entity)
      WHERE ANY(kw IN $keywords WHERE 
        toLower(e.name) CONTAINS toLower(kw) OR
        ANY(obs IN e.observations WHERE toLower(obs) CONTAINS toLower(kw)) OR
        ANY(keyword IN e.keywords WHERE toLower(keyword) CONTAINS toLower(kw))
      )
      RETURN e.name as name, e.entityType as entityType, e.observations as observations,
             e.embedding as embedding, e.importance_score as importance_score,
             e.creation_context as creation_context, e.keywords as keywords
      ORDER BY e.importance_score DESC
      LIMIT 20
      `,
      { keywords: context.low_level_keywords }
    );
    
    return result.records.map((record: any) => ({
      name: record.get('name'),
      entityType: record.get('entityType'),
      observations: record.get('observations') || [],
      embedding: record.get('embedding'),
      importance_score: record.get('importance_score'),
      creation_context: record.get('creation_context'),
      keywords: record.get('keywords') || []
    }));
  }

  private async retrieveHighLevelEntities(session: any, context: QueryContext): Promise<LightRAGEntity[]> {
    if (context.high_level_keywords.length === 0) return [];
    
    const result = await session.run(
      `
      MATCH (e:Entity)
      WHERE ANY(kw IN $keywords WHERE 
        toLower(e.entityType) CONTAINS toLower(kw) OR
        ANY(obs IN e.observations WHERE toLower(obs) CONTAINS toLower(kw)) OR
        ANY(keyword IN e.keywords WHERE toLower(keyword) CONTAINS toLower(kw))
      )
      RETURN e.name as name, e.entityType as entityType, e.observations as observations,
             e.embedding as embedding, e.importance_score as importance_score,
             e.creation_context as creation_context, e.keywords as keywords
      ORDER BY e.importance_score DESC
      LIMIT 15
      `,
      { keywords: context.high_level_keywords }
    );
    
    return result.records.map((record: any) => ({
      name: record.get('name'),
      entityType: record.get('entityType'),
      observations: record.get('observations') || [],
      embedding: record.get('embedding'),
      importance_score: record.get('importance_score'),
      creation_context: record.get('creation_context'),
      keywords: record.get('keywords') || []
    }));
  }

  private async retrieveVectorSimilarEntities(session: any, context: QueryContext, threshold: number): Promise<LightRAGEntity[]> {
    if (context.query_embedding.length === 0) return [];
    
    try {
      const result = await session.run(
        `
        CALL db.index.vector.queryNodes('entity_embeddings', $limit, $embedding) 
        YIELD node, score
        WHERE score >= $threshold
        RETURN node.name as name, node.entityType as entityType, node.observations as observations,
               node.embedding as embedding, node.importance_score as importance_score,
               node.creation_context as creation_context, node.keywords as keywords, score
        ORDER BY score DESC
        `,
        { 
          embedding: context.query_embedding, 
          threshold,
          limit: 10
        }
      );
      
      return result.records.map((record: any) => ({
        name: record.get('name'),
        entityType: record.get('entityType'),
        observations: record.get('observations') || [],
        embedding: record.get('embedding'),
        importance_score: record.get('importance_score'),
        creation_context: record.get('creation_context'),
        keywords: record.get('keywords') || []
      }));
    } catch (error) {
      console.warn('Vector similarity search failed, falling back to keyword search:', error);
      return [];
    }
  }

  private async getRelationsBetweenEntities(session: any, entityNames: string[]): Promise<LightRAGRelation[]> {
    if (entityNames.length === 0) return [];
    
    const result = await session.run(
      `
      MATCH (from:Entity)-[r:RELATED]->(to:Entity)
      WHERE from.name IN $names AND to.name IN $names
      RETURN from.name as from, to.name as to, r.type as relationType,
             r.strength_score as strength_score, r.description as description,
             r.keywords as keywords
      ORDER BY r.strength_score DESC
      `,
      { names: entityNames }
    );
    
    return result.records.map((record: any) => ({
      from: record.get('from'),
      to: record.get('to'),
      relationType: record.get('relationType'),
      strength_score: record.get('strength_score') || 0.5,
      description: record.get('description') || '',
      keywords: record.get('keywords') || []
    }));
  }

  private calculateRelevanceScores(entities: LightRAGEntity[], context: QueryContext): Record<string, number> {
    const scores: Record<string, number> = {};
    
    entities.forEach(entity => {
      let score = entity.importance_score || 0.5;
      
      // Boost score for keyword matches
      const allKeywords = [...context.low_level_keywords, ...context.high_level_keywords];
      const matches = allKeywords.filter(kw => 
        entity.name.toLowerCase().includes(kw.toLowerCase()) ||
        entity.observations.some(obs => obs.toLowerCase().includes(kw.toLowerCase())) ||
        (entity.keywords || []).some(keyword => keyword.toLowerCase().includes(kw.toLowerCase()))
      );
      
      score += matches.length * 0.1;
      scores[entity.name] = Math.min(1, score);
    });
    
    return scores;
  }

  private async generateSubgraphs(session: any, entities: LightRAGEntity[], maxHops: number): Promise<RetrievalResult['subgraphs']> {
    const subgraphs: RetrievalResult['subgraphs'] = [];
    
    // Generate subgraphs for high-importance entities
    const importantEntities = entities
      .filter(e => (e.importance_score || 0) > 0.6)
      .slice(0, 5);
    
    for (const entity of importantEntities) {
      try {
        const result = await session.run(
          `
          MATCH path = (start:Entity {name: $entityName})-[*1..${maxHops}]-(connected:Entity)
          WITH start, connected, relationships(path) as rels, length(path) as pathLength
          WHERE pathLength <= $maxHops
          RETURN collect(DISTINCT connected) as entities, 
                 collect(DISTINCT {
                   from: startNode(rels[0]).name, 
                   to: endNode(rels[0]).name, 
                   type: rels[0].type,
                   strength_score: rels[0].strength_score,
                   description: rels[0].description,
                   keywords: rels[0].keywords
                 }) as relations
          `,
          { entityName: entity.name, maxHops }
        );
        
        if (result.records.length > 0) {
          const record = result.records[0];
          const subgraphEntities = record.get('entities').map((node: any) => ({
            name: node.properties.name,
            entityType: node.properties.entityType,
            observations: node.properties.observations || [],
            embedding: node.properties.embedding,
            importance_score: node.properties.importance_score,
            creation_context: node.properties.creation_context,
            keywords: node.properties.keywords || []
          }));
          
          const subgraphRelations = record.get('relations').filter((rel: any) => rel.from && rel.to);
          
          const score = subgraphEntities.reduce((sum: number, e: any) => sum + (e.importance_score || 0.5), 0) / subgraphEntities.length;
          
          subgraphs.push({
            entities: subgraphEntities,
            relations: subgraphRelations,
            score
          });
        }
      } catch (error) {
        console.error(`Failed to generate subgraph for ${entity.name}:`, error);
      }
    }
    
    return subgraphs.sort((a, b) => b.score - a.score);
  }

  async openNodes(names: string[]): Promise<{ entities: LightRAGEntity[], relations: LightRAGRelation[] }> {
    return withNeo4j(this.env, async (session) => {
      // Get specified entities
      const entitiesResult = await session.run(
        `
        MATCH (e:Entity)
        WHERE e.name IN $names
        RETURN e.name as name, e.entityType as entityType, e.observations as observations,
               e.embedding as embedding, e.importance_score as importance_score,
               e.creation_context as creation_context, e.keywords as keywords
        `,
        { names }
      );
      
      const entities = entitiesResult.records.map((record: any) => ({
        name: record.get('name'),
        entityType: record.get('entityType'),
        observations: record.get('observations') || [],
        embedding: record.get('embedding'),
        importance_score: record.get('importance_score'),
        creation_context: record.get('creation_context'),
        keywords: record.get('keywords') || []
      }));
      
      // Get relations between these entities
      const relationsResult = await session.run(
        `
        MATCH (from:Entity)-[r:RELATED]->(to:Entity)
        WHERE from.name IN $names AND to.name IN $names
        RETURN from.name as from, to.name as to, r.type as relationType,
               r.strength_score as strength_score, r.description as description,
               r.keywords as keywords
        `,
        { names }
      );
      
      const relations = relationsResult.records.map((record: any) => ({
        from: record.get('from'),
        to: record.get('to'),
        relationType: record.get('relationType'),
        strength_score: record.get('strength_score') || 0.5,
        description: record.get('description') || '',
        keywords: record.get('keywords') || []
      }));
      
      return { entities, relations };
    });
  }

  async processConversationForAutoExtraction(user: string, messages: Array<{ role: string; content: string }>): Promise<{
    entities: LightRAGEntity[];
    relations: LightRAGRelation[];
  }> {
    if (!this.env.LIGHTRAG_AUTO_EXTRACTION) {
      return { entities: [], relations: [] };
    }

    try {
      const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      const extracted = await this.ollama.extractEntitiesAndRelations(conversationText);
      
      const maxEntities = Number(this.env.LIGHTRAG_MAX_ENTITIES_PER_EXTRACTION) || 50;
      const maxRelations = Number(this.env.LIGHTRAG_MAX_RELATIONS_PER_EXTRACTION) || 100;
      const minRelationStrength = Number(this.env.LIGHTRAG_MIN_RELATION_STRENGTH) || 0.1;
      
      // Convert to LightRAG format
      const entities: LightRAGEntity[] = extracted.entities
        .slice(0, maxEntities)
        .map(entity => ({
          name: entity.name,
          entityType: entity.type,
          observations: [entity.description],
          importance_score: entity.importance,
          creation_context: `Auto-extracted from conversation by ${user}`,
          keywords: [entity.name.toLowerCase(), entity.type.toLowerCase()]
        }));
      
      const relations: LightRAGRelation[] = extracted.relations
        .filter(rel => rel.strength >= minRelationStrength)
        .slice(0, maxRelations)
        .map(relation => ({
          from: relation.from,
          to: relation.to,
          relationType: relation.type,
          strength_score: relation.strength,
          description: relation.description,
          keywords: [relation.type.toLowerCase()]
        }));
      
      // Store the extracted entities and relations
      if (entities.length > 0) {
        await this.createLightRAGEntities(entities);
      }
      
      if (relations.length > 0) {
        await this.createLightRAGRelations(relations);
      }
      
      return { entities, relations };
    } catch (error) {
      console.error('Auto-extraction failed:', error);
      return { entities: [], relations: [] };
    }
  }
}