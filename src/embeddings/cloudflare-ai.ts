import { EmbeddingConfig } from '../types/neo4j-types';

export class EmbeddingsService {
  private ai: Ai;
  private cache: KVNamespace;
  private config: EmbeddingConfig;
  
  constructor(ai: Ai, cache: KVNamespace, config?: Partial<EmbeddingConfig>) {
    this.ai = ai;
    this.cache = cache;
    this.config = {
      model: '@cf/baai/bge-base-en-v1.5',
      cacheNamespace: cache,
      cacheTtl: 30 * 24 * 60 * 60,
      ...config
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = await this.getCacheKey(text);
    
    try {
      const cached = await this.cache.get(cacheKey, 'json') as number[] | null;
      if (cached) {
        console.log(`Embedding cache hit for key: ${cacheKey.substring(0, 16)}...`);
        return cached;
      }
    } catch (error) {
      console.warn('Cache retrieval failed:', error);
    }
    
    try {
      const startTime = Date.now();
      const response = await this.ai.run(this.config.model as any, {
        text: this.truncateText(text)
      }) as any;
      
      const embedding = response.data?.[0] || response;
      
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding response from Cloudflare AI');
      }
      
      const duration = Date.now() - startTime;
      console.log(`Generated embedding in ${duration}ms for text length: ${text.length}`);
      
      try {
        await this.cache.put(cacheKey, JSON.stringify(embedding), {
          expirationTtl: this.config.cacheTtl
        });
      } catch (error) {
        console.warn('Cache storage failed:', error);
      }
      
      return embedding;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    console.log(`Generating embeddings for ${texts.length} texts`);
    const startTime = Date.now();
    
    const embeddings = await Promise.all(
      texts.map(text => this.generateEmbedding(text))
    );
    
    const duration = Date.now() - startTime;
    console.log(`Generated ${texts.length} embeddings in ${duration}ms`);
    
    return embeddings;
  }

  async generateForContexts(contexts: Array<{ id: string; content: string }>): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();
    
    const textsToEmbed: Array<{ id: string; text: string }> = [];
    
    for (const context of contexts) {
      const cacheKey = await this.getCacheKey(context.content);
      
      try {
        const cached = await this.cache.get(cacheKey, 'json') as number[] | null;
        if (cached) {
          embeddings.set(context.id, cached);
        } else {
          textsToEmbed.push({ id: context.id, text: context.content });
        }
      } catch {
        textsToEmbed.push({ id: context.id, text: context.content });
      }
    }
    
    if (textsToEmbed.length > 0) {
      console.log(`Generating ${textsToEmbed.length} new embeddings (${contexts.length - textsToEmbed.length} from cache)`);
      
      const batchSize = 10;
      for (let i = 0; i < textsToEmbed.length; i += batchSize) {
        const batch = textsToEmbed.slice(i, i + batchSize);
        const batchEmbeddings = await this.generateBatch(batch.map(item => item.text));
        
        for (let j = 0; j < batch.length; j++) {
          embeddings.set(batch[j].id, batchEmbeddings[j]);
        }
      }
    }
    
    return embeddings;
  }

  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (norm1 * norm2);
  }

  async findSimilar(
    queryEmbedding: number[], 
    candidateEmbeddings: Map<string, number[]>, 
    threshold: number = 0.7
  ): Promise<Array<{ id: string; score: number }>> {
    const results: Array<{ id: string; score: number }> = [];
    
    for (const [id, embedding] of candidateEmbeddings) {
      const similarity = await this.calculateSimilarity(queryEmbedding, embedding);
      if (similarity >= threshold) {
        results.push({ id, score: similarity });
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  }

  private truncateText(text: string, maxLength: number = 8000): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    const halfLength = Math.floor(maxLength / 2);
    return text.substring(0, halfLength) + '\n...\n' + text.substring(text.length - halfLength);
  }

  private async getCacheKey(text: string): Promise<string> {
    const hash = await this.hashText(text);
    return `emb:${this.config.model}:${hash}`;
  }

  private async hashText(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async warmCache(texts: string[]): Promise<void> {
    console.log(`Warming cache with ${texts.length} texts`);
    const batchSize = 20;
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      await this.generateBatch(batch);
    }
    
    console.log('Cache warming completed');
  }

  async getCacheStats(): Promise<{ hits: number; misses: number; size: number }> {
    return {
      hits: 0,
      misses: 0,
      size: 0
    };
  }
}