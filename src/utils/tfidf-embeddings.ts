/**
 * TF-IDF based embeddings for Cloudflare Workers
 * Lightweight alternative to neural embeddings that works in edge environments
 */

/**
 * Simple tokenizer
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2);
}

/**
 * Calculate term frequency
 */
function termFrequency(terms: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const totalTerms = terms.length;
  
  for (const term of terms) {
    tf.set(term, (tf.get(term) || 0) + 1);
  }
  
  // Normalize by total terms
  for (const [term, count] of tf) {
    tf.set(term, count / totalTerms);
  }
  
  return tf;
}

/**
 * Build vocabulary from all documents
 */
export function buildVocabulary(documents: string[]): string[] {
  const allTerms = new Set<string>();
  
  for (const doc of documents) {
    const terms = tokenize(doc);
    terms.forEach(term => allTerms.add(term));
  }
  
  return Array.from(allTerms).sort();
}

/**
 * Calculate IDF for vocabulary
 */
export function calculateIDF(documents: string[], vocabulary: string[]): Map<string, number> {
  const idf = new Map<string, number>();
  const numDocs = documents.length;
  
  for (const term of vocabulary) {
    let docCount = 0;
    for (const doc of documents) {
      if (tokenize(doc).includes(term)) {
        docCount++;
      }
    }
    
    // Add 1 to avoid division by zero
    idf.set(term, Math.log(numDocs / (docCount + 1)));
  }
  
  return idf;
}

/**
 * Convert text to TF-IDF vector
 */
export function textToTFIDFVector(
  text: string,
  vocabulary: string[],
  idf: Map<string, number>
): number[] {
  const terms = tokenize(text);
  const tf = termFrequency(terms);
  const vector = new Array(vocabulary.length).fill(0);
  
  vocabulary.forEach((term, index) => {
    const tfValue = tf.get(term) || 0;
    const idfValue = idf.get(term) || 0;
    vector[index] = tfValue * idfValue;
  });
  
  // Normalize vector
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    return vector.map(val => val / norm);
  }
  
  return vector;
}

/**
 * Simplified embedding using character n-grams
 * Works well for short texts and is very fast
 */
export function generateSimpleEmbedding(text: string, dimensions: number = 384): number[] {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const vector = new Array(dimensions).fill(0);
  
  // Generate character trigrams
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.substring(i, i + 3);
    const hash = hashString(trigram);
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1;
  }
  
  // Generate word-level features
  const words = normalized.split(' ');
  for (const word of words) {
    const hash = hashString(word);
    const index = Math.abs(hash) % dimensions;
    vector[index] += 2; // Give more weight to whole words
  }
  
  // Normalize
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    return vector.map(val => val / norm);
  }
  
  return vector;
}

/**
 * Simple hash function for strings
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Calculate cosine similarity
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }

  return dotProduct; // Vectors are already normalized
}

/**
 * Estimate token count
 */
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token per 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Create a document index for fast similarity search
 */
export class DocumentIndex {
  private documents: string[] = [];
  private embeddings: number[][] = [];
  
  /**
   * Add a document to the index
   */
  addDocument(text: string, metadata?: any): number {
    const embedding = generateSimpleEmbedding(text);
    this.documents.push(text);
    this.embeddings.push(embedding);
    return this.documents.length - 1;
  }
  
  /**
   * Search for similar documents
   */
  search(query: string, topK: number = 5, threshold: number = 0.5): Array<{
    text: string;
    score: number;
    index: number;
  }> {
    const queryEmbedding = generateSimpleEmbedding(query);
    
    const results = this.embeddings
      .map((embedding, index) => ({
        text: this.documents[index],
        score: cosineSimilarity(queryEmbedding, embedding),
        index
      }))
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    
    return results;
  }
  
  /**
   * Get all documents
   */
  getAllDocuments(): string[] {
    return [...this.documents];
  }
  
  /**
   * Clear the index
   */
  clear(): void {
    this.documents = [];
    this.embeddings = [];
  }
}