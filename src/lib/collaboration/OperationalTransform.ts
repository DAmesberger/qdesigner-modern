/**
 * Operational Transformation Engine
 * Handles conflict-free concurrent editing through operation transformation
 */

import type {
  Operation,
  InsertOperation,
  DeleteOperation,
  UpdateOperation,
  MoveOperation,
  ReorderOperation,
  OperationResult,
  Conflict,
  PathArray
} from './types.js';

export class OperationalTransform {
  private static instance: OperationalTransform;

  static getInstance(): OperationalTransform {
    if (!OperationalTransform.instance) {
      OperationalTransform.instance = new OperationalTransform();
    }
    return OperationalTransform.instance;
  }

  // ============================================================================
  // Main Transform Function
  // ============================================================================

  /**
   * Transform operation op1 against operation op2
   * Returns the transformed operation that can be applied after op2
   */
  transform(op1: Operation, op2: Operation): OperationResult {
    // If operations are from the same user and have the same timestamp, no transform needed
    if (op1.userId === op2.userId && op1.timestamp.getTime() === op2.timestamp.getTime()) {
      return { operation: op1, transformed: false };
    }

    // Operations on different paths don't interfere
    if (!this.pathsIntersect(op1.path, op2.path)) {
      return { operation: op1, transformed: false };
    }

    // Transform based on operation types
    const transformResult = this.transformByType(op1, op2);
    
    // Check for conflicts
    const conflicts = this.detectConflicts(op1, op2, transformResult.operation);
    
    return {
      operation: transformResult.operation,
      transformed: transformResult.transformed,
      conflicts: conflicts.length > 0 ? conflicts : undefined
    };
  }

  /**
   * Transform a list of operations against another list
   */
  transformList(ops1: Operation[], ops2: Operation[]): OperationResult[] {
    const results: OperationResult[] = [];
    
    for (const op1 of ops1) {
      let transformedOp = op1;
      let wasTransformed = false;
      let allConflicts: Conflict[] = [];
      
      for (const op2 of ops2) {
        const result = this.transform(transformedOp, op2);
        transformedOp = result.operation;
        wasTransformed = wasTransformed || result.transformed;
        
        if (result.conflicts) {
          allConflicts.push(...result.conflicts);
        }
      }
      
      results.push({
        operation: transformedOp,
        transformed: wasTransformed,
        conflicts: allConflicts.length > 0 ? allConflicts : undefined
      });
    }
    
    return results;
  }

  // ============================================================================
  // Type-Specific Transformations
  // ============================================================================

  private transformByType(op1: Operation, op2: Operation): { operation: Operation; transformed: boolean } {
    const type1 = op1.type;
    const type2 = op2.type;

    // Transform Insert operations
    if (type1 === 'insert' && type2 === 'insert') {
      return this.transformInsertInsert(op1 as InsertOperation, op2 as InsertOperation);
    }
    if (type1 === 'insert' && type2 === 'delete') {
      return this.transformInsertDelete(op1 as InsertOperation, op2 as DeleteOperation);
    }
    if (type1 === 'insert' && type2 === 'update') {
      return this.transformInsertUpdate(op1 as InsertOperation, op2 as UpdateOperation);
    }

    // Transform Delete operations
    if (type1 === 'delete' && type2 === 'insert') {
      return this.transformDeleteInsert(op1 as DeleteOperation, op2 as InsertOperation);
    }
    if (type1 === 'delete' && type2 === 'delete') {
      return this.transformDeleteDelete(op1 as DeleteOperation, op2 as DeleteOperation);
    }
    if (type1 === 'delete' && type2 === 'update') {
      return this.transformDeleteUpdate(op1 as DeleteOperation, op2 as UpdateOperation);
    }

    // Transform Update operations
    if (type1 === 'update' && type2 === 'insert') {
      return this.transformUpdateInsert(op1 as UpdateOperation, op2 as InsertOperation);
    }
    if (type1 === 'update' && type2 === 'delete') {
      return this.transformUpdateDelete(op1 as UpdateOperation, op2 as DeleteOperation);
    }
    if (type1 === 'update' && type2 === 'update') {
      return this.transformUpdateUpdate(op1 as UpdateOperation, op2 as UpdateOperation);
    }

    // Transform Move operations
    if (type1 === 'move' || type2 === 'move') {
      return this.transformWithMove(op1, op2);
    }

    // Transform Reorder operations
    if (type1 === 'reorder' || type2 === 'reorder') {
      return this.transformWithReorder(op1, op2);
    }

    // Default: no transformation needed
    return { operation: op1, transformed: false };
  }

  // ============================================================================
  // Insert Transformations
  // ============================================================================

  private transformInsertInsert(op1: InsertOperation, op2: InsertOperation): { operation: Operation; transformed: boolean } {
    if (!this.pathsEqual(op1.path, op2.path)) {
      return { operation: op1, transformed: false };
    }

    // Both insertions at same location - use timestamp to determine order
    if (op1.position === op2.position) {
      if (op1.timestamp.getTime() <= op2.timestamp.getTime()) {
        // op1 comes first, no change needed
        return { operation: op1, transformed: false };
      } else {
        // op1 comes after op2, adjust position
        return {
          operation: { ...op1, position: op1.position + 1 },
          transformed: true
        };
      }
    }

    // op2 inserted before op1's position
    if (op2.position <= op1.position) {
      return {
        operation: { ...op1, position: op1.position + 1 },
        transformed: true
      };
    }

    return { operation: op1, transformed: false };
  }

  private transformInsertDelete(op1: InsertOperation, op2: DeleteOperation): { operation: Operation; transformed: boolean } {
    if (!this.pathsEqual(op1.path, op2.path)) {
      return { operation: op1, transformed: false };
    }

    const deleteEnd = op2.position + (op2.length || 1);

    // Insert position is after the deleted range
    if (op1.position >= deleteEnd) {
      return {
        operation: { ...op1, position: op1.position - (op2.length || 1) },
        transformed: true
      };
    }

    // Insert position is before the deleted range
    if (op1.position <= op2.position) {
      return { operation: op1, transformed: false };
    }

    // Insert position is within the deleted range - move to start of deleted range
    return {
      operation: { ...op1, position: op2.position },
      transformed: true
    };
  }

  private transformInsertUpdate(op1: InsertOperation, op2: UpdateOperation): { operation: Operation; transformed: boolean } {
    // Updates don't affect insert positions unless they change the structure
    return { operation: op1, transformed: false };
  }

  // ============================================================================
  // Delete Transformations
  // ============================================================================

  private transformDeleteInsert(op1: DeleteOperation, op2: InsertOperation): { operation: Operation; transformed: boolean } {
    if (!this.pathsEqual(op1.path, op2.path)) {
      return { operation: op1, transformed: false };
    }

    // Insert happened before delete position
    if (op2.position <= op1.position) {
      return {
        operation: { ...op1, position: op1.position + 1 },
        transformed: true
      };
    }

    // Insert happened within or after delete range
    const deleteEnd = op1.position + (op1.length || 1);
    if (op2.position < deleteEnd) {
      // Expand delete range to include inserted item
      return {
        operation: { ...op1, length: (op1.length || 1) + 1 },
        transformed: true
      };
    }

    return { operation: op1, transformed: false };
  }

  private transformDeleteDelete(op1: DeleteOperation, op2: DeleteOperation): { operation: Operation; transformed: boolean } {
    if (!this.pathsEqual(op1.path, op2.path)) {
      return { operation: op1, transformed: false };
    }

    const op1End = op1.position + (op1.length || 1);
    const op2End = op2.position + (op2.length || 1);

    // No overlap
    if (op1End <= op2.position) {
      // op1 is entirely before op2
      return { operation: op1, transformed: false };
    }
    if (op2End <= op1.position) {
      // op2 is entirely before op1
      return {
        operation: { ...op1, position: op1.position - (op2.length || 1) },
        transformed: true
      };
    }

    // Overlapping deletes - need to resolve conflict
    const startPos = Math.min(op1.position, op2.position);
    const endPos = Math.max(op1End, op2End);
    
    if (op1.timestamp.getTime() <= op2.timestamp.getTime()) {
      // op1 takes precedence
      return {
        operation: {
          ...op1,
          position: startPos,
          length: endPos - startPos
        },
        transformed: true
      };
    } else {
      // op2 already handled this range, op1 becomes no-op
      return {
        operation: { ...op1, position: startPos, length: 0 },
        transformed: true
      };
    }
  }

  private transformDeleteUpdate(op1: DeleteOperation, op2: UpdateOperation): { operation: Operation; transformed: boolean } {
    // If the update is on something that's being deleted, the delete takes precedence
    if (this.pathsEqual(op1.path, op2.path.slice(0, -1))) {
      // Update is on a child of what's being deleted
      return { operation: op1, transformed: false };
    }

    return { operation: op1, transformed: false };
  }

  // ============================================================================
  // Update Transformations
  // ============================================================================

  private transformUpdateInsert(op1: UpdateOperation, op2: InsertOperation): { operation: Operation; transformed: boolean } {
    // Inserts don't typically affect updates unless they change the path structure
    return { operation: op1, transformed: false };
  }

  private transformUpdateDelete(op1: UpdateOperation, op2: DeleteOperation): { operation: Operation; transformed: boolean } {
    // If the item being updated is deleted, the update becomes invalid
    if (this.pathsEqual(op1.path, [...op2.path, op2.position.toString()])) {
      // This update is on something that was deleted - mark as invalid
      return {
        operation: { ...op1, property: '__DELETED__' },
        transformed: true
      };
    }

    return { operation: op1, transformed: false };
  }

  private transformUpdateUpdate(op1: UpdateOperation, op2: UpdateOperation): { operation: Operation; transformed: boolean } {
    // Same path and property - conflict resolution needed
    if (this.pathsEqual(op1.path, op2.path) && op1.property === op2.property) {
      // Use timestamp to determine which update wins
      if (op1.timestamp.getTime() <= op2.timestamp.getTime()) {
        // op1 comes first, but op2 will override it, so op1 becomes no-op
        return {
          operation: { ...op1, newValue: op1.oldValue }, // Revert to original
          transformed: true
        };
      } else {
        // op1 comes after op2, it should win
        return {
          operation: { ...op1, oldValue: op2.newValue }, // Update old value to op2's result
          transformed: true
        };
      }
    }

    return { operation: op1, transformed: false };
  }

  // ============================================================================
  // Move and Reorder Transformations
  // ============================================================================

  private transformWithMove(op1: Operation, op2: Operation): { operation: Operation; transformed: boolean } {
    // Move operations are complex and require careful consideration of path changes
    // For now, we'll implement basic logic and expand as needed
    
    if (op1.type === 'move' && op2.type === 'move') {
      return this.transformMoveMove(op1 as MoveOperation, op2 as MoveOperation);
    }

    // For other combinations with move, we need to check if paths are affected
    return { operation: op1, transformed: false };
  }

  private transformMoveMove(op1: MoveOperation, op2: MoveOperation): { operation: Operation; transformed: boolean } {
    // If moves don't intersect, no transformation needed
    if (!this.pathsIntersect(op1.fromPath, op2.fromPath) && 
        !this.pathsIntersect(op1.toPath, op2.toPath)) {
      return { operation: op1, transformed: false };
    }

    // Complex move-move transformation would require more sophisticated logic
    // For now, use timestamp to determine precedence
    if (op1.timestamp.getTime() <= op2.timestamp.getTime()) {
      return { operation: op1, transformed: false };
    } else {
      // Need to adjust op1 based on op2's move
      // This is a simplified version - full implementation would be more complex
      return { operation: op1, transformed: true };
    }
  }

  private transformWithReorder(op1: Operation, op2: Operation): { operation: Operation; transformed: boolean } {
    // Reorder operations affect positions of multiple items
    // Implementation depends on specific requirements
    return { operation: op1, transformed: false };
  }

  // ============================================================================
  // Conflict Detection
  // ============================================================================

  private detectConflicts(op1: Operation, op2: Operation, transformedOp: Operation): Conflict[] {
    const conflicts: Conflict[] = [];

    // Concurrent edits on the same property
    if (op1.type === 'update' && op2.type === 'update') {
      const update1 = op1 as UpdateOperation;
      const update2 = op2 as UpdateOperation;
      
      if (this.pathsEqual(update1.path, update2.path) && update1.property === update2.property) {
        conflicts.push({
          type: 'concurrent_edit',
          operation1: op1,
          operation2: op2,
          resolution: 'automatic',
          description: `Concurrent edit on ${update1.property} at ${update1.path.join('.')}`
        });
      }
    }

    // Delete of referenced item
    if (op1.type === 'update' && op2.type === 'delete') {
      if (transformedOp.type === 'update' && (transformedOp as UpdateOperation).property === '__DELETED__') {
        conflicts.push({
          type: 'deleted_reference',
          operation1: op1,
          operation2: op2,
          resolution: 'automatic',
          description: 'Attempted to update deleted item'
        });
      }
    }

    // Invalid path after transformation
    if (transformedOp.path.includes('__INVALID__')) {
      conflicts.push({
        type: 'invalid_path',
        operation1: op1,
        operation2: op2,
        resolution: 'manual_required',
        description: 'Operation path became invalid after transformation'
      });
    }

    return conflicts;
  }

  // ============================================================================
  // Path Utilities
  // ============================================================================

  private pathsEqual(path1: PathArray, path2: PathArray): boolean {
    if (path1.length !== path2.length) return false;
    return path1.every((segment, index) => segment === path2[index]);
  }

  private pathsIntersect(path1: PathArray, path2: PathArray): boolean {
    const minLength = Math.min(path1.length, path2.length);
    for (let i = 0; i < minLength; i++) {
      if (path1[i] !== path2[i]) {
        return false;
      }
    }
    return true;
  }

  private isChildPath(childPath: PathArray, parentPath: PathArray): boolean {
    if (childPath.length <= parentPath.length) return false;
    return parentPath.every((segment, index) => segment === childPath[index]);
  }

  private adjustPathForInsert(path: PathArray, insertPath: PathArray, insertPosition: number): PathArray {
    if (!this.pathsIntersect(path, insertPath)) {
      return path;
    }

    // If the insert affects this path, adjust the relevant segment
    const adjustedPath = [...path];
    if (insertPath.length < path.length) {
      const affectedIndex = insertPath.length;
      const currentIndex = parseInt(path[affectedIndex]!);
      if (!isNaN(currentIndex) && currentIndex >= insertPosition) {
        adjustedPath[affectedIndex] = (currentIndex + 1).toString();
      }
    }

    return adjustedPath;
  }

  private adjustPathForDelete(path: PathArray, deletePath: PathArray, deletePosition: number, deleteLength: number = 1): PathArray {
    if (!this.pathsIntersect(path, deletePath)) {
      return path;
    }

    const adjustedPath = [...path];
    if (deletePath.length < path.length) {
      const affectedIndex = deletePath.length;
      const currentIndex = parseInt(path[affectedIndex]!);
      if (!isNaN(currentIndex)) {
        if (currentIndex >= deletePosition && currentIndex < deletePosition + deleteLength) {
          // This path points to a deleted item
          adjustedPath[affectedIndex] = '__DELETED__';
        } else if (currentIndex >= deletePosition + deleteLength) {
          adjustedPath[affectedIndex] = (currentIndex - deleteLength).toString();
        }
      }
    }

    return adjustedPath;
  }

  // ============================================================================
  // Public Utilities
  // ============================================================================

  /**
   * Check if two operations can be applied in parallel without conflicts
   */
  canApplyInParallel(op1: Operation, op2: Operation): boolean {
    const result = this.transform(op1, op2);
    return !result.conflicts || result.conflicts.every(c => c.resolution === 'automatic');
  }

  /**
   * Get a human-readable description of the transformation
   */
  getTransformationDescription(op1: Operation, op2: Operation, result: OperationResult): string {
    if (!result.transformed) {
      return 'No transformation needed';
    }

    const type1 = op1.type;
    const type2 = op2.type;
    
    if (result.conflicts && result.conflicts.length > 0) {
      return `Transformation with conflicts: ${result.conflicts.map(c => c.description).join(', ')}`;
    }

    return `Transformed ${type1} operation due to concurrent ${type2} operation`;
  }

  /**
   * Create an inverse operation that undoes the given operation
   */
  createInverse(operation: Operation): Operation {
    const inverse = { ...operation, id: `inverse_${operation.id}` };

    switch (operation.type) {
      case 'insert':
        const insertOp = operation as InsertOperation;
        return {
          ...inverse,
          type: 'delete',
          position: insertOp.position,
          length: 1,
          deletedContent: insertOp.content
        } as DeleteOperation;

      case 'delete':
        const deleteOp = operation as DeleteOperation;
        return {
          ...inverse,
          type: 'insert',
          position: deleteOp.position,
          content: deleteOp.deletedContent
        } as InsertOperation;

      case 'update':
        const updateOp = operation as UpdateOperation;
        return {
          ...inverse,
          oldValue: updateOp.newValue,
          newValue: updateOp.oldValue
        } as UpdateOperation;

      case 'move':
        const moveOp = operation as MoveOperation;
        return {
          ...inverse,
          fromPath: moveOp.toPath,
          toPath: moveOp.fromPath,
          fromPosition: moveOp.toPosition,
          toPosition: moveOp.fromPosition
        } as MoveOperation;

      case 'reorder':
        const reorderOp = operation as ReorderOperation;
        // Create reverse mapping
        const reverseIndices = new Array(reorderOp.newIndices.length);
        reorderOp.newIndices.forEach((newIndex, originalIndex) => {
          reverseIndices[newIndex] = originalIndex;
        });
        return {
          ...inverse,
          indices: reorderOp.newIndices,
          newIndices: reverseIndices
        } as ReorderOperation;

      default:
        return inverse;
    }
  }
}