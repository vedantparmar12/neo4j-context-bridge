import { marked } from 'marked';
import { encoding_for_model } from 'tiktoken';
import { 
  ContextType, 
  ContextNode, 
  Relationship,
  RelationshipType,
  ContextExtractionResult 
} from '../types/neo4j-types';

export class ContextExtractor {
  private encoding = encoding_for_model('gpt-4');
  private maxContextTokens: number;
  
  constructor(maxContextTokens: number = 4000) {
    this.maxContextTokens = maxContextTokens;
  }

  async extractFromChat(
    content: string, 
    chatId: string, 
    projectId: string
  ): Promise<ContextExtractionResult> {
    const startTime = Date.now();
    const contexts: ContextNode[] = [];
    const relationships: Relationship[] = [];
    
    const codeContexts = await this.extractCodeBlocks(content, chatId, projectId);
    contexts.push(...codeContexts);
    
    const decisions = this.extractDecisions(content, chatId, projectId);
    contexts.push(...decisions);
    
    const requirements = this.extractRequirements(content, chatId, projectId);
    contexts.push(...requirements);
    
    const errors = this.extractErrors(content, chatId, projectId);
    contexts.push(...errors);
    
    const discussions = this.extractDiscussions(content, chatId, projectId);
    contexts.push(...discussions);
    
    const scoredContexts = contexts.map(ctx => this.scoreContext(ctx));
    const summarizedContexts = await Promise.all(
      scoredContexts.map(ctx => this.summarizeIfNeeded(ctx))
    );
    
    const contextMap = new Map(summarizedContexts.map(ctx => [ctx.id, ctx]));
    const detectedRelationships = this.detectRelationships(summarizedContexts, content);
    relationships.push(...detectedRelationships);
    
    const totalTokens = summarizedContexts.reduce((sum, ctx) => sum + ctx.tokenCount, 0);
    const extractionTime = Date.now() - startTime;
    
    return {
      contexts: summarizedContexts,
      relationships,
      totalTokens,
      extractionTime
    };
  }

  private async extractCodeBlocks(
    content: string, 
    chatId: string, 
    projectId: string
  ): Promise<ContextNode[]> {
    const contexts: ContextNode[] = [];
    const tokens = marked.lexer(content);
    
    for (const token of tokens) {
      if (token.type === 'code' && token.text.trim()) {
        const id = this.generateContextId();
        const tokenCount = this.countTokens(token.text);
        
        contexts.push({
          id,
          chatId,
          projectId,
          content: token.text,
          contextType: ContextType.CODE,
          importanceScore: 0.7,
          timestamp: new Date().toISOString(),
          tokenCount,
          isSummarized: false,
          metadata: {
            language: token.lang || 'plaintext',
            lineCount: token.text.split('\n').length
          }
        });
      }
    }
    
    return contexts;
  }

  private extractDecisions(
    content: string, 
    chatId: string, 
    projectId: string
  ): ContextNode[] {
    const contexts: ContextNode[] = [];
    const decisionPatterns = [
      /(?:I've decided|We've decided|decided to|chose to|selected|will use|going with|the approach is)\s+([^.!?]+[.!?])/gi,
      /(?:The plan is|We'll|Let's|I'll|We should|I recommend)\s+([^.!?]+[.!?])/gi,
      /(?:Best practice|recommendation|solution):\s*([^.!?\n]+[.!?]?)/gi
    ];
    
    const extractedDecisions = new Set<string>();
    
    for (const pattern of decisionPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const fullMatch = match[0].trim();
        const decision = match[1] ? match[1].trim() : fullMatch;
        
        if (decision.length > 20 && decision.length < 500 && !extractedDecisions.has(decision)) {
          extractedDecisions.add(decision);
          const id = this.generateContextId();
          const tokenCount = this.countTokens(fullMatch);
          
          contexts.push({
            id,
            chatId,
            projectId,
            content: fullMatch,
            contextType: ContextType.DECISION,
            importanceScore: 0.8,
            timestamp: new Date().toISOString(),
            tokenCount,
            isSummarized: false,
            metadata: {
              pattern: pattern.source.substring(0, 50)
            }
          });
        }
      }
    }
    
    return contexts;
  }

  private extractRequirements(
    content: string, 
    chatId: string, 
    projectId: string
  ): ContextNode[] {
    const contexts: ContextNode[] = [];
    const requirementPatterns = [
      /(?:must|should|shall|need to|needs to|required to|have to)\s+([^.!?]+[.!?])/gi,
      /(?:requirement|constraint|specification):\s*([^.!?\n]+[.!?]?)/gi,
      /(?:ensure|make sure|verify|validate) (?:that\s+)?([^.!?]+[.!?])/gi
    ];
    
    const extractedReqs = new Set<string>();
    
    for (const pattern of requirementPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const fullMatch = match[0].trim();
        const requirement = match[1] ? match[1].trim() : fullMatch;
        
        if (requirement.length > 20 && requirement.length < 500 && !extractedReqs.has(requirement)) {
          extractedReqs.add(requirement);
          const id = this.generateContextId();
          const tokenCount = this.countTokens(fullMatch);
          
          contexts.push({
            id,
            chatId,
            projectId,
            content: fullMatch,
            contextType: ContextType.REQUIREMENT,
            importanceScore: 0.85,
            timestamp: new Date().toISOString(),
            tokenCount,
            isSummarized: false,
            metadata: {
              modal: match[0].match(/must|should|shall/i)?.[0] || 'should'
            }
          });
        }
      }
    }
    
    return contexts;
  }

  private extractErrors(
    content: string, 
    chatId: string, 
    projectId: string
  ): ContextNode[] {
    const contexts: ContextNode[] = [];
    const errorPatterns = [
      /(?:error|exception|failed|failure):\s*([^.!?\n]+[.!?]?)/gi,
      /(?:stack trace|traceback):\s*([\s\S]+?)(?=\n\n|\n[A-Z]|$)/gi,
      /(?:bug|issue|problem):\s*([^.!?\n]+[.!?]?)/gi
    ];
    
    const extractedErrors = new Set<string>();
    
    for (const pattern of errorPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const fullMatch = match[0].trim();
        
        if (fullMatch.length > 30 && fullMatch.length < 1000 && !extractedErrors.has(fullMatch)) {
          extractedErrors.add(fullMatch);
          const id = this.generateContextId();
          const tokenCount = this.countTokens(fullMatch);
          
          contexts.push({
            id,
            chatId,
            projectId,
            content: fullMatch,
            contextType: ContextType.ERROR,
            importanceScore: 0.9,
            timestamp: new Date().toISOString(),
            tokenCount,
            isSummarized: false,
            metadata: {
              errorType: match[0].match(/error|exception|failed|bug/i)?.[0] || 'error'
            }
          });
        }
      }
    }
    
    return contexts;
  }

  private extractDiscussions(
    content: string, 
    chatId: string, 
    projectId: string
  ): ContextNode[] {
    const contexts: ContextNode[] = [];
    const paragraphs = content.split(/\n\n+/);
    
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (trimmed.length < 100 || trimmed.length > 1000) continue;
      
      const hasCode = /```/.test(trimmed);
      const hasDecision = /decided|chose|selected|will use/i.test(trimmed);
      const hasRequirement = /must|should|shall|need to/i.test(trimmed);
      const hasError = /error|exception|failed/i.test(trimmed);
      
      if (!hasCode && !hasDecision && !hasRequirement && !hasError) {
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount > 20) {
          const id = this.generateContextId();
          const tokenCount = this.countTokens(trimmed);
          
          contexts.push({
            id,
            chatId,
            projectId,
            content: trimmed,
            contextType: ContextType.DISCUSSION,
            importanceScore: 0.5,
            timestamp: new Date().toISOString(),
            tokenCount,
            isSummarized: false,
            metadata: {
              wordCount
            }
          });
        }
      }
    }
    
    return contexts;
  }

  private scoreContext(context: ContextNode): ContextNode {
    let score = context.importanceScore;
    
    if (context.contextType === ContextType.ERROR) {
      score += 0.1;
    } else if (context.contextType === ContextType.REQUIREMENT) {
      score += 0.05;
    }
    
    if (context.tokenCount > 100) score += 0.05;
    if (context.tokenCount > 500) score += 0.05;
    
    const keywordBoosts = {
      'critical': 0.1,
      'important': 0.08,
      'security': 0.1,
      'performance': 0.07,
      'architecture': 0.08,
      'breaking change': 0.1,
      'TODO': 0.06,
      'FIXME': 0.08
    };
    
    for (const [keyword, boost] of Object.entries(keywordBoosts)) {
      if (context.content.toLowerCase().includes(keyword.toLowerCase())) {
        score += boost;
      }
    }
    
    context.importanceScore = Math.min(score, 1.0);
    return context;
  }

  private async summarizeIfNeeded(context: ContextNode): Promise<ContextNode> {
    if (context.tokenCount <= this.maxContextTokens) {
      return context;
    }
    
    const lines = context.content.split('\n');
    const summary = lines.slice(0, 10).join('\n') + 
      `\n\n... (${lines.length - 10} more lines, ${context.tokenCount} total tokens)`;
    
    context.summary = summary;
    context.isSummarized = true;
    
    return context;
  }

  private detectRelationships(contexts: ContextNode[], fullContent: string): Relationship[] {
    const relationships: Relationship[] = [];
    
    for (let i = 0; i < contexts.length; i++) {
      for (let j = i + 1; j < contexts.length; j++) {
        const ctx1 = contexts[i];
        const ctx2 = contexts[j];
        
        if (ctx1.contextType === ContextType.REQUIREMENT && 
            ctx2.contextType === ContextType.CODE) {
          const codeKeywords = this.extractKeywords(ctx2.content);
          const reqKeywords = this.extractKeywords(ctx1.content);
          
          if (this.hasCommonKeywords(codeKeywords, reqKeywords)) {
            relationships.push({
              fromId: ctx2.id,
              toId: ctx1.id,
              type: RelationshipType.IMPLEMENTS
            });
          }
        }
        
        if (ctx1.contextType === ContextType.ERROR && 
            ctx2.contextType === ContextType.CODE) {
          if (this.areNearby(ctx1, ctx2, fullContent)) {
            relationships.push({
              fromId: ctx1.id,
              toId: ctx2.id,
              type: RelationshipType.REFERENCES
            });
          }
        }
        
        if (ctx1.contextType === ctx2.contextType) {
          const similarity = this.calculateSimilarity(ctx1.content, ctx2.content);
          if (similarity > 0.7) {
            relationships.push({
              fromId: ctx1.id,
              toId: ctx2.id,
              type: RelationshipType.RELATED_TO,
              properties: { similarity }
            });
          }
        }
      }
    }
    
    return relationships;
  }

  private extractKeywords(text: string): Set<string> {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    return new Set(words);
  }

  private hasCommonKeywords(set1: Set<string>, set2: Set<string>): boolean {
    let common = 0;
    for (const word of set1) {
      if (set2.has(word)) common++;
    }
    return common >= 3;
  }

  private areNearby(ctx1: ContextNode, ctx2: ContextNode, fullContent: string): boolean {
    const pos1 = fullContent.indexOf(ctx1.content);
    const pos2 = fullContent.indexOf(ctx2.content);
    
    if (pos1 === -1 || pos2 === -1) return false;
    
    const distance = Math.abs(pos1 - pos2);
    return distance < 1000;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = this.extractKeywords(text1);
    const words2 = this.extractKeywords(text2);
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private countTokens(text: string): number {
    try {
      return this.encoding.encode(text).length;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }

  private generateContextId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}