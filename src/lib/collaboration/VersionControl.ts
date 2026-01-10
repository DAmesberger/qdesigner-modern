/**
 * Version Control System
 * Manages versioning, branching, and merging for questionnaire collaboration
 */

import type {
  Version,
  Branch,
  VersionDiff,
  MergeRequest,
  Operation,
  Conflict
} from './types.js';
import type { Questionnaire as QuestionnaireType } from '$lib/shared';
import { OperationalTransform } from './OperationalTransform.js';

export class VersionControl {
  private static instance: VersionControl;
  private versions = new Map<string, Version>();
  private branches = new Map<string, Branch>();
  private ot = OperationalTransform.getInstance();

  static getInstance(): VersionControl {
    if (!VersionControl.instance) {
      VersionControl.instance = new VersionControl();
    }
    return VersionControl.instance;
  }

  // ============================================================================
  // Version Management
  // ============================================================================

  /**
   * Create a new version from the current questionnaire state
   */
  createVersion(
    questionnaireId: string,
    content: QuestionnaireType,
    operations: Operation[],
    createdBy: string,
    message?: string,
    branchName: string = 'main'
  ): Version {
    const versionNumber = this.getNextVersionNumber(questionnaireId, branchName);
    const parentVersion = this.getLatestVersion(questionnaireId, branchName);

    const version: Version = {
      id: `v${versionNumber}_${Date.now()}`,
      questionnaireId,
      version: versionNumber,
      content: this.serializeContent(content),
      operations: [...operations],
      createdBy,
      createdAt: new Date(),
      message,
      parentVersion: parentVersion?.id,
      branchName
    };

    this.versions.set(version.id, version);
    this.updateBranch(questionnaireId, branchName, version.id);

    return version;
  }

  /**
   * Get a specific version by ID
   */
  getVersion(versionId: string): Version | null {
    return this.versions.get(versionId) || null;
  }

  /**
   * Get all versions for a questionnaire
   */
  getVersions(questionnaireId: string, branchName?: string): Version[] {
    const allVersions = Array.from(this.versions.values())
      .filter(v => v.questionnaireId === questionnaireId);

    if (branchName) {
      return allVersions.filter(v => v.branchName === branchName);
    }

    return allVersions.sort((a, b) => b.version - a.version);
  }

  /**
   * Get the latest version for a questionnaire on a specific branch
   */
  getLatestVersion(questionnaireId: string, branchName: string = 'main'): Version | null {
    const versions = this.getVersions(questionnaireId, branchName);
    return versions.length > 0 ? versions[0]! : null;
  }

  /**
   * Restore questionnaire to a specific version
   */
  restoreToVersion(versionId: string): QuestionnaireType | null {
    const version = this.getVersion(versionId);
    if (!version) {
      return null;
    }

    return this.deserializeContent(version.content);
  }

  /**
   * Delete a version (if it's safe to do so)
   */
  deleteVersion(versionId: string): boolean {
    const version = this.getVersion(versionId);
    if (!version) {
      return false;
    }

    // Check if this version is referenced by other versions or branches
    const isReferenced = Array.from(this.versions.values())
      .some(v => v.parentVersion === versionId);

    const isHeadOfBranch = Array.from(this.branches.values())
      .some(b => b.headVersion === versionId);

    if (isReferenced || isHeadOfBranch) {
      return false; // Cannot delete referenced version
    }

    this.versions.delete(versionId);
    return true;
  }

  // ============================================================================
  // Branch Management
  // ============================================================================

  /**
   * Create a new branch from a specific version
   */
  createBranch(
    questionnaireId: string,
    branchName: string,
    baseVersionId: string,
    createdBy: string,
    description?: string
  ): Branch | null {
    const baseVersion = this.getVersion(baseVersionId);
    if (!baseVersion) {
      return null;
    }

    // Check if branch already exists
    const existingBranch = this.getBranch(questionnaireId, branchName);
    if (existingBranch) {
      return null;
    }

    const branch: Branch = {
      id: `branch_${branchName}_${Date.now()}`,
      name: branchName,
      questionnaireId,
      baseVersion: baseVersionId,
      headVersion: baseVersionId,
      createdBy,
      createdAt: new Date(),
      isDefault: false,
      isActive: true,
      description
    };

    this.branches.set(this.getBranchKey(questionnaireId, branchName), branch);
    return branch;
  }

  /**
   * Get a specific branch
   */
  getBranch(questionnaireId: string, branchName: string): Branch | null {
    return this.branches.get(this.getBranchKey(questionnaireId, branchName)) || null;
  }

  /**
   * Get all branches for a questionnaire
   */
  getBranches(questionnaireId: string): Branch[] {
    return Array.from(this.branches.values())
      .filter(b => b.questionnaireId === questionnaireId && b.isActive);
  }

  /**
   * Delete a branch (if it's safe to do so)
   */
  deleteBranch(questionnaireId: string, branchName: string): boolean {
    const branch = this.getBranch(questionnaireId, branchName);
    if (!branch || branch.isDefault) {
      return false;
    }

    // Mark as inactive instead of deleting to preserve history
    branch.isActive = false;
    this.branches.set(this.getBranchKey(questionnaireId, branchName), branch);
    return true;
  }

  /**
   * Set the default branch for a questionnaire
   */
  setDefaultBranch(questionnaireId: string, branchName: string): boolean {
    const newDefault = this.getBranch(questionnaireId, branchName);
    if (!newDefault) {
      return false;
    }

    // Remove default flag from other branches
    this.getBranches(questionnaireId).forEach(branch => {
      branch.isDefault = false;
      this.branches.set(this.getBranchKey(questionnaireId, branch.name), branch);
    });

    // Set new default
    newDefault.isDefault = true;
    this.branches.set(this.getBranchKey(questionnaireId, branchName), newDefault);
    return true;
  }

  // ============================================================================
  // Diff Generation
  // ============================================================================

  /**
   * Generate a diff between two versions
   */
  generateDiff(fromVersionId: string, toVersionId: string): VersionDiff | null {
    const fromVersion = this.getVersion(fromVersionId);
    const toVersion = this.getVersion(toVersionId);

    if (!fromVersion || !toVersion) {
      return null;
    }

    const fromContent = this.deserializeContent(fromVersion.content);
    const toContent = this.deserializeContent(toVersion.content);

    if (!fromContent || !toContent) {
      return null;
    }

    const operations = this.calculateOperations(fromContent, toContent);
    const summary = this.generateSummary(fromContent, toContent);

    return {
      fromVersion: fromVersionId,
      toVersion: toVersionId,
      operations,
      summary
    };
  }

  /**
   * Generate a diff for a branch against its base
   */
  generateBranchDiff(questionnaireId: string, branchName: string): VersionDiff | null {
    const branch = this.getBranch(questionnaireId, branchName);
    if (!branch) {
      return null;
    }

    return this.generateDiff(branch.baseVersion, branch.headVersion);
  }

  // ============================================================================
  // Merge Operations
  // ============================================================================

  /**
   * Create a merge request between two branches
   */
  createMergeRequest(
    questionnaireId: string,
    fromBranch: string,
    toBranch: string,
    title: string,
    createdBy: string,
    description?: string
  ): MergeRequest | null {
    const sourceBranch = this.getBranch(questionnaireId, fromBranch);
    const targetBranch = this.getBranch(questionnaireId, toBranch);

    if (!sourceBranch || !targetBranch) {
      return null;
    }

    const diff = this.generateDiff(targetBranch.headVersion, sourceBranch.headVersion);
    if (!diff) {
      return null;
    }

    const conflicts = this.detectMergeConflicts(sourceBranch, targetBranch);

    const mergeRequest: MergeRequest = {
      id: `merge_${Date.now()}`,
      fromBranch,
      toBranch,
      title,
      description,
      createdBy,
      createdAt: new Date(),
      status: 'open',
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      diff
    };

    return mergeRequest;
  }

  /**
   * Merge one branch into another
   */
  mergeBranch(
    questionnaireId: string,
    fromBranch: string,
    toBranch: string,
    mergedBy: string,
    resolveConflicts: (conflicts: Conflict[]) => Operation[]
  ): Version | null {
    const sourceBranch = this.getBranch(questionnaireId, fromBranch);
    const targetBranch = this.getBranch(questionnaireId, toBranch);

    if (!sourceBranch || !targetBranch) {
      return null;
    }

    const sourceVersion = this.getVersion(sourceBranch.headVersion);
    const targetVersion = this.getVersion(targetBranch.headVersion);

    if (!sourceVersion || !targetVersion) {
      return null;
    }

    // Detect conflicts
    const conflicts = this.detectMergeConflicts(sourceBranch, targetBranch);
    
    // Get operations from source branch
    const sourceOperations = this.getOperationsSinceVersion(
      questionnaireId,
      sourceBranch.baseVersion,
      sourceBranch.headVersion
    );

    let mergedOperations = sourceOperations;

    // Resolve conflicts if any
    if (conflicts.length > 0) {
      const resolutionOperations = resolveConflicts(conflicts);
      mergedOperations = [...sourceOperations, ...resolutionOperations];
    }

    // Apply operations to target content
    const targetContent = this.deserializeContent(targetVersion.content);
    if (!targetContent) {
      return null;
    }

    const mergedContent = this.applyOperations(targetContent, mergedOperations);

    // Create new version on target branch
    const mergedVersion = this.createVersion(
      questionnaireId,
      mergedContent,
      mergedOperations,
      mergedBy,
      `Merged ${fromBranch} into ${toBranch}`,
      toBranch
    );

    return mergedVersion;
  }

  // ============================================================================
  // Operation Utilities
  // ============================================================================

  /**
   * Get all operations between two versions
   */
  getOperationsSinceVersion(
    questionnaireId: string,
    fromVersionId: string,
    toVersionId: string
  ): Operation[] {
    const operations: Operation[] = [];
    const versions = this.getVersions(questionnaireId);
    
    let collecting = false;
    for (const version of versions.reverse()) {
      if (version.id === fromVersionId) {
        collecting = true;
        continue;
      }
      
      if (collecting) {
        operations.push(...version.operations);
        
        if (version.id === toVersionId) {
          break;
        }
      }
    }

    return operations;
  }

  /**
   * Apply a list of operations to questionnaire content
   */
  private applyOperations(content: QuestionnaireType, operations: Operation[]): QuestionnaireType {
    let result = JSON.parse(JSON.stringify(content)); // Deep clone

    for (const operation of operations) {
      try {
        result = this.applyOperation(result, operation);
      } catch (error) {
        console.error('Failed to apply operation:', operation, error);
      }
    }

    return result;
  }

  /**
   * Apply a single operation to questionnaire content
   */
  private applyOperation(content: QuestionnaireType, operation: Operation): QuestionnaireType {
    const result = JSON.parse(JSON.stringify(content)); // Deep clone

    switch (operation.type) {
      case 'insert':
        return this.applyInsertOperation(result, operation as any);
      case 'delete':
        return this.applyDeleteOperation(result, operation as any);
      case 'update':
        return this.applyUpdateOperation(result, operation as any);
      case 'move':
        return this.applyMoveOperation(result, operation as any);
      case 'reorder':
        return this.applyReorderOperation(result, operation as any);
      default:
        return result;
    }
  }

  // ============================================================================
  // Operation Application
  // ============================================================================

  private applyInsertOperation(content: QuestionnaireType, operation: any): QuestionnaireType {
    const target = this.getNestedValue(content, operation.path);
    if (Array.isArray(target)) {
      target.splice(operation.position, 0, operation.content);
    }
    return content;
  }

  private applyDeleteOperation(content: QuestionnaireType, operation: any): QuestionnaireType {
    const target = this.getNestedValue(content, operation.path);
    if (Array.isArray(target)) {
      target.splice(operation.position, operation.length || 1);
    }
    return content;
  }

  private applyUpdateOperation(content: QuestionnaireType, operation: any): QuestionnaireType {
    const target = this.getNestedValue(content, operation.path);
    if (target && typeof target === 'object') {
      (target as any)[operation.property] = operation.newValue;
    }
    return content;
  }

  private applyMoveOperation(content: QuestionnaireType, operation: any): QuestionnaireType {
    const source = this.getNestedValue(content, operation.fromPath);
    const target = this.getNestedValue(content, operation.toPath);
    
    if (Array.isArray(source) && Array.isArray(target)) {
      const item = source.splice(operation.fromPosition, 1)[0];
      if (item) {
        target.splice(operation.toPosition, 0, item);
      }
    }
    
    return content;
  }

  private applyReorderOperation(content: QuestionnaireType, operation: any): QuestionnaireType {
    const target = this.getNestedValue(content, operation.path);
    if (Array.isArray(target)) {
      const newArray = new Array(target.length);
      operation.indices.forEach((oldIndex: number, newIndex: number) => {
        newArray[operation.newIndices[newIndex]] = target[oldIndex];
      });
      target.splice(0, target.length, ...newArray);
    }
    return content;
  }

  // ============================================================================
  // Conflict Detection
  // ============================================================================

  private detectMergeConflicts(sourceBranch: Branch, targetBranch: Branch): Conflict[] {
    const sourceOperations = this.getOperationsSinceVersion(
      sourceBranch.questionnaireId,
      sourceBranch.baseVersion,
      sourceBranch.headVersion
    );

    const targetOperations = this.getOperationsSinceVersion(
      targetBranch.questionnaireId,
      targetBranch.baseVersion,
      targetBranch.headVersion
    );

    const conflicts: Conflict[] = [];

    for (const sourceOp of sourceOperations) {
      for (const targetOp of targetOperations) {
        if (!this.ot.canApplyInParallel(sourceOp, targetOp)) {
          const result = this.ot.transform(sourceOp, targetOp);
          if (result.conflicts) {
            conflicts.push(...result.conflicts);
          }
        }
      }
    }

    return conflicts;
  }

  // ============================================================================
  // Content Analysis
  // ============================================================================

  private calculateOperations(from: QuestionnaireType, to: QuestionnaireType): Operation[] {
    const operations: Operation[] = [];
    
    // This is a simplified version - a full implementation would do deep comparison
    // and generate appropriate operations based on differences
    
    // Compare questions
    const fromQuestions = from.questions || [];
    const toQuestions = to.questions || [];
    
    // Generate operations based on differences
    // ... (implementation would be quite complex for a complete diff)
    
    return operations;
  }

  private generateSummary(from: QuestionnaireType, to: QuestionnaireType) {
    const fromQuestions = from.questions || [];
    const toQuestions = to.questions || [];
    const fromPages = from.pages || [];
    const toPages = to.pages || [];
    const fromVariables = from.variables || [];
    const toVariables = to.variables || [];

    return {
      questionsAdded: Math.max(0, toQuestions.length - fromQuestions.length),
      questionsModified: 0, // Would need deep comparison
      questionsDeleted: Math.max(0, fromQuestions.length - toQuestions.length),
      pagesAdded: Math.max(0, toPages.length - fromPages.length),
      pagesModified: 0, // Would need deep comparison
      pagesDeleted: Math.max(0, fromPages.length - toPages.length),
      variablesAdded: Math.max(0, toVariables.length - fromVariables.length),
      variablesModified: 0, // Would need deep comparison
      variablesDeleted: Math.max(0, fromVariables.length - toVariables.length)
    };
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  private getNextVersionNumber(questionnaireId: string, branchName: string): number {
    const versions = this.getVersions(questionnaireId, branchName);
    return versions.length > 0 ? versions[0]!.version + 1 : 1;
  }

  private updateBranch(questionnaireId: string, branchName: string, headVersionId: string): void {
    let branch = this.getBranch(questionnaireId, branchName);
    
    if (!branch) {
      // Create main branch if it doesn't exist
      branch = {
        id: `branch_${branchName}_${Date.now()}`,
        name: branchName,
        questionnaireId,
        baseVersion: headVersionId,
        headVersion: headVersionId,
        createdBy: 'system',
        createdAt: new Date(),
        isDefault: branchName === 'main',
        isActive: true
      };
    } else {
      branch.headVersion = headVersionId;
    }

    this.branches.set(this.getBranchKey(questionnaireId, branchName), branch);
  }

  private getBranchKey(questionnaireId: string, branchName: string): string {
    return `${questionnaireId}_${branchName}`;
  }

  private serializeContent(content: QuestionnaireType): any {
    return JSON.parse(JSON.stringify(content));
  }

  private deserializeContent(content: any): QuestionnaireType | null {
    try {
      return content as QuestionnaireType;
    } catch (error) {
      console.error('Failed to deserialize content:', error);
      return null;
    }
  }

  private getNestedValue(obj: any, path: string[]): any {
    let current = obj;
    for (const segment of path) {
      if (current && typeof current === 'object' && segment in current) {
        current = current[segment];
      } else {
        return null;
      }
    }
    return current;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Initialize version control for a questionnaire
   */
  initializeQuestionnaire(questionnaire: QuestionnaireType, createdBy: string): Version {
    // Create initial version
    const initialVersion = this.createVersion(
      questionnaire.id,
      questionnaire,
      [],
      createdBy,
      'Initial version',
      'main'
    );

    // Set main branch as default
    this.setDefaultBranch(questionnaire.id, 'main');

    return initialVersion;
  }

  /**
   * Get version history for display
   */
  getVersionHistory(questionnaireId: string, branchName?: string): {
    versions: Version[];
    branches: Branch[];
    currentBranch: string;
  } {
    const versions = this.getVersions(questionnaireId, branchName);
    const branches = this.getBranches(questionnaireId);
    const defaultBranch = branches.find(b => b.isDefault);

    return {
      versions,
      branches,
      currentBranch: branchName || defaultBranch?.name || 'main'
    };
  }

  /**
   * Clean up old versions (keep only recent ones)
   */
  cleanupVersions(questionnaireId: string, keepCount: number = 50): number {
    const versions = this.getVersions(questionnaireId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (versions.length <= keepCount) {
      return 0;
    }

    const toDelete = versions.slice(keepCount);
    let deletedCount = 0;

    for (const version of toDelete) {
      if (this.deleteVersion(version.id)) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Export version control data for backup
   */
  exportData(questionnaireId: string): {
    versions: Version[];
    branches: Branch[];
  } {
    return {
      versions: this.getVersions(questionnaireId),
      branches: this.getBranches(questionnaireId)
    };
  }

  /**
   * Import version control data from backup
   */
  importData(data: { versions: Version[]; branches: Branch[] }): void {
    for (const version of data.versions) {
      this.versions.set(version.id, version);
    }

    for (const branch of data.branches) {
      this.branches.set(this.getBranchKey(branch.questionnaireId, branch.name), branch);
    }
  }
}