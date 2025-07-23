import { 
  ContextNode, 
  Relationship, 
  RelationshipType,
  ContextType 
} from '../types/neo4j-types';

export class RelationshipDetector {
  detectEvolution(contexts: ContextNode[]): Relationship[] {
    const relationships: Relationship[] = [];
    const contextsByType = this.groupByType(contexts);
    
    for (const [type, typeContexts] of contextsByType) {
      const sorted = typeContexts.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        
        if (this.isEvolution(current, next)) {
          relationships.push({
            fromId: current.id,
            toId: next.id,
            type: RelationshipType.EVOLVES_TO,
            properties: {
              timeDelta: new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime()
            }
          });
        }
      }
    }
    
    return relationships;
  }

  detectDependencies(contexts: ContextNode[]): Relationship[] {
    const relationships: Relationship[] = [];
    const codeContexts = contexts.filter(c => c.contextType === ContextType.CODE);
    
    for (let i = 0; i < codeContexts.length; i++) {
      for (let j = 0; j < codeContexts.length; j++) {
        if (i === j) continue;
        
        const source = codeContexts[i];
        const target = codeContexts[j];
        
        if (this.hasDependency(source, target)) {
          relationships.push({
            fromId: source.id,
            toId: target.id,
            type: RelationshipType.DEPENDS_ON,
            properties: {
              dependencyType: this.getDependencyType(source, target)
            }
          });
        }
      }
    }
    
    return relationships;
  }

  detectReferences(contexts: ContextNode[], fullContent: string): Relationship[] {
    const relationships: Relationship[] = [];
    
    for (let i = 0; i < contexts.length; i++) {
      for (let j = 0; j < contexts.length; j++) {
        if (i === j) continue;
        
        const source = contexts[i];
        const target = contexts[j];
        
        if (this.hasReference(source, target, fullContent)) {
          relationships.push({
            fromId: source.id,
            toId: target.id,
            type: RelationshipType.REFERENCES,
            properties: {
              referenceType: this.getReferenceType(source, target)
            }
          });
        }
      }
    }
    
    return relationships;
  }

  detectChatRelationships(contexts: ContextNode[], chatId: string): Relationship[] {
    return contexts.map(context => ({
      fromId: context.id,
      toId: chatId,
      type: RelationshipType.BELONGS_TO
    }));
  }

  private groupByType(contexts: ContextNode[]): Map<ContextType, ContextNode[]> {
    const grouped = new Map<ContextType, ContextNode[]>();
    
    for (const context of contexts) {
      const list = grouped.get(context.contextType) || [];
      list.push(context);
      grouped.set(context.contextType, list);
    }
    
    return grouped;
  }

  private isEvolution(current: ContextNode, next: ContextNode): boolean {
    if (current.contextType !== next.contextType) return false;
    
    if (current.contextType === ContextType.CODE) {
      const currentFunctions = this.extractFunctionNames(current.content);
      const nextFunctions = this.extractFunctionNames(next.content);
      
      const overlap = this.setOverlap(currentFunctions, nextFunctions);
      return overlap > 0.5;
    }
    
    const similarity = this.calculateTextSimilarity(current.content, next.content);
    return similarity > 0.6 && similarity < 0.95;
  }

  private hasDependency(source: ContextNode, target: ContextNode): boolean {
    if (source.metadata?.language !== target.metadata?.language) return false;
    
    const targetExports = this.extractExports(target.content, target.metadata?.language || '');
    const sourceImports = this.extractImports(source.content, source.metadata?.language || '');
    
    for (const exp of targetExports) {
      if (sourceImports.has(exp)) return true;
    }
    
    const targetClasses = this.extractClassNames(target.content);
    const sourceContent = source.content.toLowerCase();
    
    for (const className of targetClasses) {
      if (sourceContent.includes(className.toLowerCase())) return true;
    }
    
    return false;
  }

  private hasReference(source: ContextNode, target: ContextNode, fullContent: string): boolean {
    if (source.contextType === ContextType.ERROR && target.contextType === ContextType.CODE) {
      const errorKeywords = this.extractErrorKeywords(source.content);
      const codeIdentifiers = this.extractIdentifiers(target.content);
      
      for (const keyword of errorKeywords) {
        if (codeIdentifiers.has(keyword)) return true;
      }
    }
    
    if (source.contextType === ContextType.DISCUSSION) {
      const mentions = this.extractCodeMentions(source.content);
      const targetIdentifiers = this.extractIdentifiers(target.content);
      
      for (const mention of mentions) {
        if (targetIdentifiers.has(mention)) return true;
      }
    }
    
    const distance = this.getContextDistance(source, target, fullContent);
    return distance > 0 && distance < 500;
  }

  private getDependencyType(source: ContextNode, target: ContextNode): string {
    const sourceImports = this.extractImports(source.content, source.metadata?.language || '');
    const targetExports = this.extractExports(target.content, target.metadata?.language || '');
    
    if (sourceImports.size > 0 && targetExports.size > 0) {
      return 'import';
    }
    
    const targetClasses = this.extractClassNames(target.content);
    if (targetClasses.size > 0) {
      return 'inheritance';
    }
    
    return 'usage';
  }

  private getReferenceType(source: ContextNode, target: ContextNode): string {
    if (source.contextType === ContextType.ERROR) return 'error-to-code';
    if (source.contextType === ContextType.DISCUSSION) return 'discussion-to-code';
    if (source.contextType === ContextType.REQUIREMENT) return 'requirement-to-implementation';
    return 'general';
  }

  private extractFunctionNames(code: string): Set<string> {
    const patterns = [
      /function\s+(\w+)/g,
      /const\s+(\w+)\s*=\s*(?:async\s*)?\(/g,
      /(\w+)\s*:\s*(?:async\s*)?\(/g,
      /def\s+(\w+)/g,
      /func\s+(\w+)/g
    ];
    
    const functions = new Set<string>();
    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) functions.add(match[1]);
      }
    }
    
    return functions;
  }

  private extractClassNames(code: string): Set<string> {
    const patterns = [
      /class\s+(\w+)/g,
      /interface\s+(\w+)/g,
      /type\s+(\w+)/g,
      /struct\s+(\w+)/g
    ];
    
    const classes = new Set<string>();
    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) classes.add(match[1]);
      }
    }
    
    return classes;
  }

  private extractImports(code: string, language: string): Set<string> {
    const imports = new Set<string>();
    
    if (language === 'javascript' || language === 'typescript') {
      const patterns = [
        /import\s+.*?\s+from\s+['"](.+?)['"]/g,
        /require\s*\(\s*['"](.+?)['"]\s*\)/g
      ];
      
      for (const pattern of patterns) {
        const matches = code.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) imports.add(match[1]);
        }
      }
    }
    
    return imports;
  }

  private extractExports(code: string, language: string): Set<string> {
    const exports = new Set<string>();
    
    if (language === 'javascript' || language === 'typescript') {
      const patterns = [
        /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
        /module\.exports\s*=\s*(\w+)/g
      ];
      
      for (const pattern of patterns) {
        const matches = code.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) exports.add(match[1]);
        }
      }
    }
    
    return exports;
  }

  private extractIdentifiers(code: string): Set<string> {
    const identifiers = new Set<string>();
    const words = code.match(/\b[a-zA-Z_]\w*\b/g) || [];
    
    for (const word of words) {
      if (word.length > 2 && !this.isCommonKeyword(word)) {
        identifiers.add(word);
      }
    }
    
    return identifiers;
  }

  private extractErrorKeywords(error: string): Set<string> {
    const keywords = new Set<string>();
    const words = error.match(/\b[a-zA-Z_]\w*\b/g) || [];
    
    for (const word of words) {
      if (word.length > 3 && /^[A-Z]/.test(word)) {
        keywords.add(word);
      }
    }
    
    return keywords;
  }

  private extractCodeMentions(text: string): Set<string> {
    const mentions = new Set<string>();
    const patterns = [
      /`(\w+)`/g,
      /\b(\w+)\(\)/g,
      /\b(\w+)\s+(?:function|method|class)/g
    ];
    
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) mentions.add(match[1]);
      }
    }
    
    return mentions;
  }

  private setOverlap(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 || set2.size === 0) return 0;
    
    let overlap = 0;
    for (const item of set1) {
      if (set2.has(item)) overlap++;
    }
    
    return overlap / Math.min(set1.size, set2.size);
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private getContextDistance(ctx1: ContextNode, ctx2: ContextNode, fullContent: string): number {
    const pos1 = fullContent.indexOf(ctx1.content);
    const pos2 = fullContent.indexOf(ctx2.content);
    
    if (pos1 === -1 || pos2 === -1) return -1;
    
    return Math.abs(pos1 - pos2);
  }

  private isCommonKeyword(word: string): boolean {
    const keywords = new Set([
      'const', 'let', 'var', 'function', 'class', 'if', 'else', 'for', 
      'while', 'return', 'import', 'export', 'async', 'await', 'try', 
      'catch', 'throw', 'new', 'this', 'super', 'extends', 'implements'
    ]);
    
    return keywords.has(word.toLowerCase());
  }
}