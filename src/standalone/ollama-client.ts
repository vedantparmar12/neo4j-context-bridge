import { StandaloneEnv } from './types.js';

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export class OllamaClient {
  private baseUrl: string;
  private timeout: number;

  constructor(private env: StandaloneEnv) {
    this.baseUrl = env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.timeout = Number(env.OLLAMA_TIMEOUT) || 60000;
  }

  async generate(prompt: string, model?: string): Promise<string> {
    try {
      const requestModel = model || this.env.OLLAMA_MODEL || 'llama3.2:latest';
      
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: requestModel,
          prompt,
          stream: false,
          temperature: 0.7,
        } as OllamaGenerateRequest),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as OllamaResponse;
      return data.response.trim();
    } catch (error) {
      console.error('Ollama generation error:', error);
      throw new Error(`Failed to generate response from Ollama: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embeddingModel = this.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text:latest';
      
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: embeddingModel,
          prompt: text,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as OllamaEmbeddingResponse;
      return data.embedding;
    } catch (error) {
      console.error('Ollama embedding error:', error);
      throw new Error(`Failed to generate embedding from Ollama: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractEntitiesAndRelations(text: string): Promise<{
    entities: Array<{
      name: string;
      type: string;
      description: string;
      importance: number;
    }>;
    relations: Array<{
      from: string;
      to: string;
      type: string;
      strength: number;
      description: string;
    }>;
  }> {
    const prompt = `Extract entities and relationships from the following text. Return a JSON object with "entities" and "relations" arrays.

For entities, include:
- name: unique identifier
- type: category (person, organization, location, technology, concept, event)
- description: brief description
- importance: score 0-1

For relations, include:
- from: source entity name
- to: target entity name  
- type: relationship type (WORKS_ON, KNOWS, USES, RELATED_TO, etc.)
- strength: score 0-1
- description: relationship description

Text: ${text}

Return only valid JSON:`;

    try {
      const response = await this.generate(prompt);
      
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate structure
      if (!parsed.entities || !Array.isArray(parsed.entities)) {
        parsed.entities = [];
      }
      if (!parsed.relations || !Array.isArray(parsed.relations)) {
        parsed.relations = [];
      }
      
      // Ensure all entities have required fields
      parsed.entities = parsed.entities.map((entity: any) => ({
        name: entity.name || 'Unknown',
        type: entity.type || 'concept',
        description: entity.description || '',
        importance: Math.max(0, Math.min(1, Number(entity.importance) || 0.5))
      }));
      
      // Ensure all relations have required fields
      parsed.relations = parsed.relations.map((relation: any) => ({
        from: relation.from || '',
        to: relation.to || '',
        type: relation.type || 'RELATED_TO',
        strength: Math.max(0, Math.min(1, Number(relation.strength) || 0.5)),
        description: relation.description || ''
      })).filter((rel: any) => rel.from && rel.to);
      
      return parsed;
    } catch (error) {
      console.error('Entity extraction error:', error);
      return { entities: [], relations: [] };
    }
  }

  async extractDualLevelKeywords(query: string): Promise<{
    low_level_keywords: string[];
    high_level_keywords: string[];
  }> {
    const prompt = `Extract keywords from the query at two levels:

1. Low-level keywords: Specific entities, names, technical terms, exact concepts
2. High-level keywords: Broader themes, categories, abstract concepts, topics

Query: "${query}"

Return JSON with "low_level_keywords" and "high_level_keywords" arrays:`;

    try {
      const response = await this.generate(prompt);
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        low_level_keywords: Array.isArray(parsed.low_level_keywords) ? parsed.low_level_keywords : [],
        high_level_keywords: Array.isArray(parsed.high_level_keywords) ? parsed.high_level_keywords : []
      };
    } catch (error) {
      console.error('Keyword extraction error:', error);
      return {
        low_level_keywords: [query],
        high_level_keywords: []
      };
    }
  }

  async categorizeEntity(entityName: string, context: string): Promise<{
    type: string;
    importance: number;
    observations: string[];
  }> {
    const prompt = `Analyze the entity "${entityName}" in this context and categorize it:

Context: ${context}

Return JSON with:
- type: one of (person, organization, location, technology, concept, event)
- importance: score 0-1 based on relevance
- observations: array of key observations about this entity

JSON:`;

    try {
      const response = await this.generate(prompt);
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        type: parsed.type || 'concept',
        importance: Math.max(0, Math.min(1, Number(parsed.importance) || 0.5)),
        observations: Array.isArray(parsed.observations) ? parsed.observations : []
      };
    } catch (error) {
      console.error('Entity categorization error:', error);
      return {
        type: 'concept',
        importance: 0.5,
        observations: []
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      console.error('Ollama health check failed:', error);
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      
      const data = await response.json() as any;
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }
}