import { Session } from 'neo4j-driver';
import { 
  ContextNode, 
  SearchResult, 
  ContextType,
  SearchContextInputSchema
} from '../types/neo4j-types';
import { EmbeddingsService } from '../embeddings/cloudflare-ai';
import { withNeo4j } from '../neo4j/connection';

export class SemanticSearch {
  constructor(
    private embeddings: EmbeddingsService,
    private env: Env
  ) {}

  async searchContexts(params: {
    query: string;
    contextTypes?: ContextType[];
    limit?: number;
    projectId?: string;
    useSemanticSearch?: boolean;
  }): Promise<SearchResult[]> {
    const { 
      query, 
      contextTypes, 
      limit = 10, 
      projectId,
      useSemanticSearch = true 
    } = params;

    if (useSemanticSearch) {
      return this.semanticSearch(query, contextTypes, limit, projectId);
    } else {
      return this.keywordSearch(query, contextTypes, limit, projectId);
    }
  }

  private async semanticSearch(
    query: string,
    contextTypes?: ContextType[],
    limit: number = 10,
    projectId?: string
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.embeddings.generateEmbedding(query);
      
      return await withNeo4j(this.env, async (session) => {
        const hasVectorIndex = await this.checkVectorIndexExists(session);
        
        if (!hasVectorIndex) {
          console.warn('Vector index not available, falling back to keyword search');
          return this.keywordSearch(query, contextTypes, limit, projectId);
        }

        let cypher: string;
        const params: any = {
          embedding: queryEmbedding,
          limit: limit * 2,
          threshold: 0.7
        };

        if (hasVectorIndex) {
          cypher = `
            CALL db.index.vector.queryNodes(
              'context_embeddings',
              $limit,
              $embedding
            ) YIELD node, score
            WHERE score >= $threshold
          `;
        } else {
          cypher = `
            MATCH (node:Context)
            WHERE node.embedding IS NOT NULL
            WITH node, 
                 gds.similarity.cosine(node.embedding, $embedding) AS score
            WHERE score >= $threshold
          `;
        }

        if (contextTypes && contextTypes.length > 0) {
          cypher += ` AND node.contextType IN $contextTypes`;
          params.contextTypes = contextTypes;
        }

        if (projectId) {
          cypher += ` AND node.projectId = $projectId`;
          params.projectId = projectId;
        }

        cypher += `
          MATCH (node)-[:BELONGS_TO]->(chat:Chat)
          RETURN node, score, chat.title as chatTitle
          ORDER BY score DESC
          LIMIT $finalLimit
        `;
        params.finalLimit = limit;

        const result = await session.run(cypher, params);
        
        return result.records.map((record: any) => {
          const node = record.get('node').properties;
          const score = record.get('score');
          const chatTitle = record.get('chatTitle');
          
          return {
            context: this.nodeToContext(node),
            score,
            chatTitle,
            highlights: this.generateHighlights(node.content, query)
          };
        });
      });
    } catch (error) {
      console.error('Semantic search failed:', error);
      return this.keywordSearch(query, contextTypes, limit, projectId);
    }
  }

  private async keywordSearch(
    query: string,
    contextTypes?: ContextType[],
    limit: number = 10,
    projectId?: string
  ): Promise<SearchResult[]> {
    return await withNeo4j(this.env, async (session) => {
      const keywords = this.extractKeywords(query);
      const searchPattern = keywords.join('|');
      
      let cypher = `
        MATCH (node:Context)
        WHERE node.content =~ '(?i).*(' + $searchPattern + ').*'
      `;
      
      const params: any = {
        searchPattern,
        limit
      };

      if (contextTypes && contextTypes.length > 0) {
        cypher += ` AND node.contextType IN $contextTypes`;
        params.contextTypes = contextTypes;
      }

      if (projectId) {
        cypher += ` AND node.projectId = $projectId`;
        params.projectId = projectId;
      }

      cypher += `
        MATCH (node)-[:BELONGS_TO]->(chat:Chat)
        WITH node, chat.title as chatTitle,
             size([keyword IN $keywords WHERE node.content =~ '(?i).*' + keyword + '.*']) AS matchCount
        ORDER BY matchCount DESC, node.importanceScore DESC, node.timestamp DESC
        LIMIT $limit
        RETURN node, chatTitle, toFloat(matchCount) / toFloat(size($keywords)) AS score
      `;
      params.keywords = keywords;

      const result = await session.run(cypher, params);
      
      return result.records.map((record: any) => {
        const node = record.get('node').properties;
        const chatTitle = record.get('chatTitle');
        const score = record.get('score');
        
        return {
          context: this.nodeToContext(node),
          score,
          chatTitle,
          highlights: this.generateHighlights(node.content, query)
        };
      });
    });
  }

  async findRelatedContexts(
    contextId: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    return await withNeo4j(this.env, async (session) => {
      const cypher = `
        MATCH (source:Context {id: $contextId})
        OPTIONAL MATCH (source)-[r:RELATED_TO|REFERENCES|EVOLVES_TO]-(related:Context)
        OPTIONAL MATCH (related)-[:BELONGS_TO]->(relatedChat:Chat)
        WITH source, related, relatedChat, r,
             CASE 
               WHEN type(r) = 'EVOLVES_TO' THEN 0.9
               WHEN type(r) = 'REFERENCES' THEN 0.8
               WHEN type(r) = 'RELATED_TO' THEN r.similarity
               ELSE 0.7
             END AS score
        WHERE related IS NOT NULL
        RETURN related AS node, relatedChat.title AS chatTitle, score
        ORDER BY score DESC
        LIMIT $limit
      `;

      const result = await session.run(cypher, { contextId, limit });
      
      if (result.records.length === 0) {
        const context = await this.getContextById(contextId);
        if (context && context.embedding) {
          const embedding = context.embedding;
          return this.findSimilarByEmbedding(embedding, limit, contextId);
        }
      }
      
      return result.records.map(record => ({
        context: this.nodeToContext(record.get('node').properties),
        score: record.get('score'),
        chatTitle: record.get('chatTitle')
      }));
    });
  }

  async getEvolutionChain(
    contextId: string,
    depth: number = 5
  ): Promise<{ contexts: ContextNode[]; path: string[] }> {
    return await withNeo4j(this.env, async (session) => {
      const cypher = `
        MATCH path = (start:Context {id: $contextId})-[:EVOLVES_TO*0..${depth}]-(end:Context)
        WITH nodes(path) AS contexts, 
             [n IN nodes(path) | n.id] AS contextIds
        UNWIND contexts AS context
        WITH context, contextIds
        ORDER BY context.timestamp
        RETURN collect(DISTINCT context) AS contexts, contextIds[0] AS path
      `;

      const result = await session.run(cypher, { contextId });
      
      if (result.records.length === 0) {
        const singleContext = await this.getContextById(contextId);
        return {
          contexts: singleContext ? [singleContext] : [],
          path: singleContext ? [singleContext.id] : []
        };
      }

      const record = result.records[0];
      const contexts = record.get('contexts').map((c: any) => this.nodeToContext(c.properties));
      const path = record.get('path');
      
      return { contexts, path };
    });
  }

  private async findSimilarByEmbedding(
    embedding: number[],
    limit: number,
    excludeId?: string
  ): Promise<SearchResult[]> {
    return await withNeo4j(this.env, async (session) => {
      const cypher = `
        MATCH (node:Context)
        WHERE node.embedding IS NOT NULL
        ${excludeId ? 'AND node.id <> $excludeId' : ''}
        WITH node, gds.similarity.cosine(node.embedding, $embedding) AS score
        WHERE score >= 0.7
        MATCH (node)-[:BELONGS_TO]->(chat:Chat)
        RETURN node, score, chat.title as chatTitle
        ORDER BY score DESC
        LIMIT $limit
      `;

      const params: any = { embedding, limit };
      if (excludeId) params.excludeId = excludeId;

      const result = await session.run(cypher, params);
      
      return result.records.map(record => ({
        context: this.nodeToContext(record.get('node').properties),
        score: record.get('score'),
        chatTitle: record.get('chatTitle')
      }));
    });
  }

  private async getContextById(contextId: string): Promise<ContextNode | null> {
    return await withNeo4j(this.env, async (session) => {
      const result = await session.run(
        'MATCH (c:Context {id: $contextId}) RETURN c',
        { contextId }
      );
      
      if (result.records.length === 0) return null;
      
      return this.nodeToContext(result.records[0].get('c').properties);
    });
  }

  private async checkVectorIndexExists(session: Session): Promise<boolean> {
    try {
      const result = await session.run(
        "SHOW INDEXES WHERE name = 'context_embeddings'"
      );
      return result.records.length > 0;
    } catch {
      return false;
    }
  }

  private nodeToContext(node: any): ContextNode {
    return {
      id: node.id,
      chatId: node.chatId,
      projectId: node.projectId,
      content: node.content,
      summary: node.summary,
      contextType: node.contextType,
      importanceScore: node.importanceScore,
      timestamp: node.timestamp,
      tokenCount: node.tokenCount,
      isSummarized: node.isSummarized,
      embedding: node.embedding,
      metadata: node.metadata
    };
  }

  private extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isStopWord(word));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as',
      'are', 'was', 'were', 'in', 'to', 'for', 'of', 'with', 'by'
    ]);
    return stopWords.has(word);
  }

  private generateHighlights(content: string, query: string): string[] {
    const keywords = this.extractKeywords(query);
    const highlights: string[] = [];
    const sentences = content.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      for (const keyword of keywords) {
        if (lowerSentence.includes(keyword)) {
          highlights.push(sentence.trim());
          break;
        }
      }
      if (highlights.length >= 3) break;
    }
    
    return highlights;
  }
}