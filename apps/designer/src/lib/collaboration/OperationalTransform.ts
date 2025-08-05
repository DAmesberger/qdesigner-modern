import type { OperationalTransform, TransformResult } from './types';

export class OTEngine {
  private operations: Map<string, OperationalTransform> = new Map();
  
  // Transform operation1 against operation2
  transform(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    // Skip if same operation
    if (op1.id === op2.id) {
      return { operation: op1, transformed: false };
    }
    
    // Transform based on operation types
    const transformer = this.getTransformer(op1.type, op2.type);
    return transformer(op1, op2);
  }
  
  // Transform multiple operations
  transformOperations(
    operations: OperationalTransform[], 
    against: OperationalTransform
  ): OperationalTransform[] {
    return operations.map(op => {
      const result = this.transform(op, against);
      return result.operation;
    });
  }
  
  // Compose two operations into one
  compose(op1: OperationalTransform, op2: OperationalTransform): OperationalTransform | null {
    // Can only compose operations from the same user
    if (op1.userId !== op2.userId) {
      return null;
    }
    
    // Compose based on operation types
    if (op1.type === 'insert' && op2.type === 'insert') {
      return this.composeInserts(op1, op2);
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      return this.composeDeletes(op1, op2);
    } else if (op1.type === 'replace' && op2.type === 'replace') {
      return this.composeReplaces(op1, op2);
    }
    
    return null;
  }
  
  // Apply operation to document state
  applyOperation(document: string, operation: OperationalTransform): string {
    switch (operation.type) {
      case 'insert':
        return this.applyInsert(document, operation);
        
      case 'delete':
        return this.applyDelete(document, operation);
        
      case 'replace':
        return this.applyReplace(document, operation);
        
      case 'move':
        return this.applyMove(document, operation);
        
      case 'format':
        // Format operations don't change text content
        return document;
        
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
  
  // Invert an operation
  invert(operation: OperationalTransform): OperationalTransform {
    const inverted = { ...operation };
    inverted.id = `inv_${operation.id}`;
    
    switch (operation.type) {
      case 'insert':
        inverted.type = 'delete';
        inverted.length = operation.content?.length || 0;
        delete inverted.content;
        break;
        
      case 'delete':
        inverted.type = 'insert';
        inverted.content = operation.content || '';
        delete inverted.length;
        break;
        
      case 'replace':
        // Swap content for replace operations
        const temp = inverted.content;
        inverted.content = operation.attributes?.originalContent || '';
        inverted.attributes = { originalContent: temp };
        break;
        
      case 'move':
        // Swap positions for move operations
        const fromPos = operation.position;
        const toPos = operation.attributes?.toPosition || 0;
        inverted.position = toPos;
        inverted.attributes = { toPosition: fromPos };
        break;
    }
    
    return inverted;
  }
  
  // Check if two operations conflict
  conflictsWith(op1: OperationalTransform, op2: OperationalTransform): boolean {
    // Same position modifications always conflict
    if (op1.position === op2.position) {
      return true;
    }
    
    // Check for overlapping ranges
    const op1End = op1.position + (op1.length || op1.content?.length || 0);
    const op2End = op2.position + (op2.length || op2.content?.length || 0);
    
    return (
      (op1.position >= op2.position && op1.position < op2End) ||
      (op2.position >= op1.position && op2.position < op1End)
    );
  }
  
  // Private transformation methods
  private getTransformer(type1: string, type2: string): (op1: OperationalTransform, op2: OperationalTransform) => TransformResult {
    const key = `${type1}_${type2}`;
    
    switch (key) {
      case 'insert_insert':
        return this.transformInsertInsert.bind(this);
      case 'insert_delete':
        return this.transformInsertDelete.bind(this);
      case 'delete_insert':
        return this.transformDeleteInsert.bind(this);
      case 'delete_delete':
        return this.transformDeleteDelete.bind(this);
      case 'replace_insert':
        return this.transformReplaceInsert.bind(this);
      case 'replace_delete':
        return this.transformReplaceDelete.bind(this);
      case 'insert_replace':
        return this.transformInsertReplace.bind(this);
      case 'delete_replace':
        return this.transformDeleteReplace.bind(this);
      case 'replace_replace':
        return this.transformReplaceReplace.bind(this);
      default:
        return (op1) => ({ operation: op1, transformed: false });
    }
  }
  
  // Insert vs Insert transformation
  private transformInsertInsert(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    const transformed = { ...op1 };
    
    if (op2.position < op1.position || 
        (op2.position === op1.position && op2.userId < op1.userId)) {
      transformed.position += op2.content?.length || 0;
      return { operation: transformed, transformed: true };
    }
    
    return { operation: op1, transformed: false };
  }
  
  // Insert vs Delete transformation
  private transformInsertDelete(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    const transformed = { ...op1 };
    
    if (op2.position < op1.position) {
      transformed.position = Math.max(op2.position, op1.position - (op2.length || 0));
      return { operation: transformed, transformed: true };
    }
    
    return { operation: op1, transformed: false };
  }
  
  // Delete vs Insert transformation
  private transformDeleteInsert(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    const transformed = { ...op1 };
    
    if (op2.position <= op1.position) {
      transformed.position += op2.content?.length || 0;
      return { operation: transformed, transformed: true };
    } else if (op2.position < op1.position + (op1.length || 0)) {
      // Insert is within delete range
      transformed.length = (op1.length || 0) + (op2.content?.length || 0);
      return { operation: transformed, transformed: true };
    }
    
    return { operation: op1, transformed: false };
  }
  
  // Delete vs Delete transformation
  private transformDeleteDelete(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    const transformed = { ...op1 };
    const op1End = op1.position + (op1.length || 0);
    const op2End = op2.position + (op2.length || 0);
    
    if (op2End <= op1.position) {
      // op2 is entirely before op1
      transformed.position -= op2.length || 0;
      return { operation: transformed, transformed: true };
    } else if (op2.position >= op1End) {
      // op2 is entirely after op1
      return { operation: op1, transformed: false };
    } else {
      // Overlapping deletes
      if (op2.position <= op1.position && op2End >= op1End) {
        // op2 contains op1
        transformed.length = 0;
      } else if (op2.position <= op1.position) {
        // op2 overlaps start of op1
        const overlap = op2End - op1.position;
        transformed.position = op2.position;
        transformed.length = (op1.length || 0) - overlap;
      } else if (op2End >= op1End) {
        // op2 overlaps end of op1
        transformed.length = op2.position - op1.position;
      } else {
        // op2 is within op1
        transformed.length = (op1.length || 0) - (op2.length || 0);
      }
      
      return { operation: transformed, transformed: true };
    }
  }
  
  // Replace transformations
  private transformReplaceInsert(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    const transformed = { ...op1 };
    
    if (op2.position <= op1.position) {
      transformed.position += op2.content?.length || 0;
      return { operation: transformed, transformed: true };
    } else if (op2.position < op1.position + (op1.length || 0)) {
      // Insert is within replace range - split the replace
      // This is complex and would need special handling
      return { operation: op1, transformed: false };
    }
    
    return { operation: op1, transformed: false };
  }
  
  private transformReplaceDelete(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    const transformed = { ...op1 };
    
    if (op2.position + (op2.length || 0) <= op1.position) {
      transformed.position -= op2.length || 0;
      return { operation: transformed, transformed: true };
    }
    
    return { operation: op1, transformed: false };
  }
  
  private transformInsertReplace(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    return this.transformInsertDelete(op1, op2);
  }
  
  private transformDeleteReplace(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    return this.transformDeleteDelete(op1, op2);
  }
  
  private transformReplaceReplace(op1: OperationalTransform, op2: OperationalTransform): TransformResult {
    // Complex case - for now, just prioritize by user ID
    if (op2.userId < op1.userId) {
      return { operation: op1, transformed: false };
    }
    return { operation: op1, transformed: false };
  }
  
  // Operation application methods
  private applyInsert(document: string, operation: OperationalTransform): string {
    const before = document.slice(0, operation.position);
    const after = document.slice(operation.position);
    return before + (operation.content || '') + after;
  }
  
  private applyDelete(document: string, operation: OperationalTransform): string {
    const before = document.slice(0, operation.position);
    const after = document.slice(operation.position + (operation.length || 0));
    return before + after;
  }
  
  private applyReplace(document: string, operation: OperationalTransform): string {
    const before = document.slice(0, operation.position);
    const after = document.slice(operation.position + (operation.length || 0));
    return before + (operation.content || '') + after;
  }
  
  private applyMove(document: string, operation: OperationalTransform): string {
    const content = document.slice(operation.position, operation.position + (operation.length || 0));
    const toPosition = operation.attributes?.toPosition || 0;
    
    // Remove from original position
    let result = this.applyDelete(document, operation);
    
    // Insert at new position
    const insertOp: OperationalTransform = {
      ...operation,
      type: 'insert',
      position: toPosition,
      content
    };
    
    return this.applyInsert(result, insertOp);
  }
  
  // Composition methods
  private composeInserts(op1: OperationalTransform, op2: OperationalTransform): OperationalTransform | null {
    // Adjacent inserts can be composed
    if (op1.position + (op1.content?.length || 0) === op2.position) {
      return {
        ...op1,
        content: (op1.content || '') + (op2.content || ''),
        timestamp: op2.timestamp
      };
    }
    
    return null;
  }
  
  private composeDeletes(op1: OperationalTransform, op2: OperationalTransform): OperationalTransform | null {
    // Adjacent deletes can be composed
    if (op1.position === op2.position) {
      return {
        ...op1,
        length: (op1.length || 0) + (op2.length || 0),
        timestamp: op2.timestamp
      };
    } else if (op1.position === op2.position + (op2.length || 0)) {
      return {
        ...op2,
        length: (op1.length || 0) + (op2.length || 0),
        timestamp: op2.timestamp
      };
    }
    
    return null;
  }
  
  private composeReplaces(op1: OperationalTransform, op2: OperationalTransform): OperationalTransform | null {
    // Same position replaces can be composed
    if (op1.position === op2.position) {
      return {
        ...op1,
        content: op2.content,
        length: op2.length,
        timestamp: op2.timestamp,
        attributes: {
          ...op1.attributes,
          originalContent: op1.attributes?.originalContent || op1.content
        }
      };
    }
    
    return null;
  }
}

// Singleton instance
let otEngine: OTEngine | null = null;

export function getOTEngine(): OTEngine {
  if (!otEngine) {
    otEngine = new OTEngine();
  }
  return otEngine;
}