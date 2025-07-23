import { EmbeddingsService } from '../embeddings/cloudflare-ai';
import { SemanticSearch } from '../search/semantic-search';
import { ContextNode, SearchResult } from '../types/neo4j-types';

export interface InjectionOptions {
  query: string;
  maxTokens: number;
  projectId?: string;
  format: 'full' | 'summary' | 'reference';
  priorityFactors?: {
    recency: number;
    relevance: number;
    importance: number;
    type: Record<string, number>;
  };
}

export interface InjectionResult {
  contexts: Array<{
    context: ContextNode;
    score: number;
    chatTitle: string;
    format: 'full' | 'summary' | 'reference';
    tokens: number;
  }>;
  totalTokens: number;
  injectionStrategy: string;
}

export class ContextInjector {
  private defaultPriorityFactors = {
    recency: 0.2,
    relevance: 0.5,
    importance: 0.3,
    type: {
      error: 1.2,
      requirement: 1.1,
      decision: 1.0,
      code: 0.9,
      discussion: 0.7
    }
  };

  constructor(
    private env: Env,
    private embeddings: EmbeddingsService,
    private search: SemanticSearch
  ) {}

  async prepareContextForInjection(options: InjectionOptions): Promise<InjectionResult> {
    const priorityFactors = options.priorityFactors || this.defaultPriorityFactors;
    
    const searchResults = await this.search.searchContexts({
      query: options.query,
      limit: 30,
      projectId: options.projectId,
      useSemanticSearch: true
    });

    if (searchResults.length === 0) {
      return {
        contexts: [],
        totalTokens: 0,
        injectionStrategy: 'no_results'
      };
    }

    const prioritizedResults = this.prioritizeContexts(searchResults, priorityFactors);
    
    const injectionResult = this.selectContextsWithinBudget(
      prioritizedResults,
      options.maxTokens,
      options.format
    );

    return injectionResult;
  }

  private prioritizeContexts(
    results: SearchResult[],
    factors: InjectionOptions['priorityFactors']
  ): SearchResult[] {
    const now = new Date().getTime();
    
    return results.map(result => {
      const context = result.context;
      
      const daysSinceCreation = (now - new Date(context.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.exp(-daysSinceCreation / 30);
      
      const typeMultiplier = factors!.type[context.contextType] || 1.0;
      
      const combinedScore = 
        (result.score * factors!.relevance) +
        (recencyScore * factors!.recency) +
        (context.importanceScore * factors!.importance * typeMultiplier);
      
      return {
        ...result,
        score: combinedScore
      };
    }).sort((a, b) => b.score - a.score);
  }

  private selectContextsWithinBudget(
    results: SearchResult[],
    maxTokens: number,
    format: 'full' | 'summary' | 'reference'
  ): InjectionResult {
    const selected: InjectionResult['contexts'] = [];
    let totalTokens = 0;
    let strategy = 'standard';

    const criticalThreshold = 0.8;
    const criticalContexts = results.filter(r => r.score >= criticalThreshold);
    const regularContexts = results.filter(r => r.score < criticalThreshold);

    for (const result of criticalContexts) {
      const added = this.tryAddContext(result, selected, totalTokens, maxTokens, format);
      if (added) {
        totalTokens = added.totalTokens;
      }
    }

    for (const result of regularContexts) {
      const added = this.tryAddContext(result, selected, totalTokens, maxTokens, format);
      if (added) {
        totalTokens = added.totalTokens;
      } else if (totalTokens >= maxTokens * 0.9) {
        strategy = 'token_limit_reached';
        break;
      }
    }

    if (selected.length === 0 && results.length > 0) {
      const firstResult = results[0];
      const summaryTokens = this.estimateTokens(firstResult.context.summary || '');
      
      if (summaryTokens <= maxTokens) {
        selected.push({
          context: firstResult.context,
          score: firstResult.score,
          chatTitle: firstResult.chatTitle,
          format: 'summary',
          tokens: summaryTokens
        });
        totalTokens = summaryTokens;
        strategy = 'forced_summary';
      }
    }

    return {
      contexts: selected,
      totalTokens,
      injectionStrategy: strategy
    };
  }

  private tryAddContext(
    result: SearchResult,
    selected: InjectionResult['contexts'],
    currentTokens: number,
    maxTokens: number,
    preferredFormat: 'full' | 'summary' | 'reference'
  ): { totalTokens: number } | null {
    const context = result.context;
    
    if (preferredFormat === 'reference') {
      const refTokens = 50;
      if (currentTokens + refTokens <= maxTokens) {
        selected.push({
          ...result,
          format: 'reference',
          tokens: refTokens
        });
        return { totalTokens: currentTokens + refTokens };
      }
    }
    
    const fullTokens = context.tokenCount;
    if (preferredFormat === 'full' && currentTokens + fullTokens <= maxTokens) {
      selected.push({
        ...result,
        format: 'full',
        tokens: fullTokens
      });
      return { totalTokens: currentTokens + fullTokens };
    }
    
    if (context.summary) {
      const summaryTokens = this.estimateTokens(context.summary);
      if (currentTokens + summaryTokens <= maxTokens) {
        selected.push({
          ...result,
          format: 'summary',
          tokens: summaryTokens
        });
        return { totalTokens: currentTokens + summaryTokens };
      }
    }
    
    const refTokens = 50;
    if (currentTokens + refTokens <= maxTokens) {
      selected.push({
        ...result,
        format: 'reference',
        tokens: refTokens
      });
      return { totalTokens: currentTokens + refTokens };
    }
    
    return null;
  }

  formatInjection(result: InjectionResult, query: string): string {
    let output = `## Relevant Context for: "${query}"\n\n`;
    
    if (result.contexts.length === 0) {
      output += '*No relevant context found from previous conversations.*\n';
      return output;
    }
    
    output += `*Found ${result.contexts.length} relevant contexts (${result.totalTokens} tokens):*\n\n`;
    
    const byFormat = {
      full: result.contexts.filter(c => c.format === 'full'),
      summary: result.contexts.filter(c => c.format === 'summary'),
      reference: result.contexts.filter(c => c.format === 'reference')
    };
    
    for (const ctx of byFormat.full) {
      output += this.formatFullContext(ctx);
    }
    
    if (byFormat.summary.length > 0) {
      output += '### Summarized Contexts\n\n';
      for (const ctx of byFormat.summary) {
        output += this.formatSummaryContext(ctx);
      }
    }
    
    if (byFormat.reference.length > 0) {
      output += '### Referenced Contexts\n\n';
      for (const ctx of byFormat.reference) {
        output += this.formatReferenceContext(ctx);
      }
    }
    
    return output;
  }

  private formatFullContext(ctx: InjectionResult['contexts'][0]): string {
    let output = `### Context from "${ctx.chatTitle}"\n`;
    output += `- **Relevance:** ${(ctx.score * 100).toFixed(0)}%\n`;
    output += `- **Type:** ${ctx.context.contextType}\n`;
    output += `- **Date:** ${new Date(ctx.context.timestamp).toLocaleDateString()}\n\n`;
    
    if (ctx.context.contextType === 'code' && ctx.context.metadata?.language) {
      output += `\`\`\`${ctx.context.metadata.language}\n${ctx.context.content}\n\`\`\``;
    } else {
      output += ctx.context.content;
    }
    
    output += '\n\n---\n\n';
    return output;
  }

  private formatSummaryContext(ctx: InjectionResult['contexts'][0]): string {
    let output = `- **[${ctx.context.contextType}]** from "${ctx.chatTitle}" `;
    output += `(${new Date(ctx.context.timestamp).toLocaleDateString()})\n`;
    output += `  ${ctx.context.summary || ctx.context.content.substring(0, 200) + '...'}\n\n`;
    return output;
  }

  private formatReferenceContext(ctx: InjectionResult['contexts'][0]): string {
    return `- **[${ctx.context.contextType}]** "${ctx.chatTitle}" - ${ctx.context.content.substring(0, 80)}...\n`;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async generateContextSummary(context: ContextNode): Promise<string> {
    if (context.summary) return context.summary;
    
    const content = context.content;
    const lines = content.split('\n');
    
    if (context.contextType === 'code') {
      const firstLines = lines.slice(0, 10).join('\n');
      const lastLines = lines.slice(-5).join('\n');
      return `${firstLines}\n\n... (${lines.length - 15} lines omitted) ...\n\n${lastLines}`;
    }
    
    const words = content.split(/\s+/);
    if (words.length <= 100) return content;
    
    const summary = words.slice(0, 80).join(' ') + '...';
    return summary;
  }
}