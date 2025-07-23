/**
 * Local embedding generation using Transformers.js
 * No external API required - runs models locally
 */

import { pipeline, env } from '@xenova/transformers';

// Configure transformers to use local models
env.allowLocalModels = false;
env.useBrowserCache = false;

// Cache the pipeline instance
let embeddingPipeline: any = null;

/**
 * Initialize the embedding pipeline
 * Uses a lightweight model that works well for semantic search
 */
async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    // Use all-MiniLM-L6-v2 - a good balance of speed and quality
    // 384-dimensional embeddings
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true } // Use quantized model for better performance
    );
  }
  return embeddingPipeline;
}

/**
 * Generate embeddings for text using local model
 * Returns a 384-dimensional vector
 */
export async function generateLocalEmbedding(text: string): Promise<number[]> {
  try {
    const pipe = await getEmbeddingPipeline();
    
    // Truncate text to model's max length (512 tokens)
    const truncatedText = text.substring(0, 512);
    
    // Generate embeddings
    const output = await pipe(truncatedText, {
      pooling: 'mean',
      normalize: true
    });
    
    // Convert to regular array
    return Array.from(output.data);
  } catch (error) {
    console.error('Failed to generate local embedding:', error);
    // Return zero vector as fallback
    return new Array(384).fill(0);
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Simple token counter - approximate for when exact counting isn't critical
 * Roughly 1 token per 4 characters
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk text for better embedding quality
 * Splits long text into overlapping chunks
 */
export function chunkText(text: string, maxLength: number = 512, overlap: number = 50): string[] {
  const chunks: string[] = [];
  
  if (text.length <= maxLength) {
    return [text];
  }
  
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxLength, text.length);
    chunks.push(text.substring(start, end));
    start += maxLength - overlap;
  }
  
  return chunks;
}

/**
 * Generate embeddings for multiple texts in batch
 * More efficient than individual calls
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  for (const text of texts) {
    const embedding = await generateLocalEmbedding(text);
    embeddings.push(embedding);
  }
  
  return embeddings;
}

/**
 * Find most similar texts given a query
 */
export async function findSimilarTexts(
  query: string,
  texts: string[],
  embeddings: number[][],
  topK: number = 5,
  threshold: number = 0.7
): Promise<Array<{ text: string; score: number; index: number }>> {
  const queryEmbedding = await generateLocalEmbedding(query);
  
  const similarities = embeddings.map((embedding, index) => ({
    text: texts[index],
    score: cosineSimilarity(queryEmbedding, embedding),
    index
  }));
  
  return similarities
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}