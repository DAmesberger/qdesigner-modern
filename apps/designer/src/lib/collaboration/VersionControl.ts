import type { 
  DocumentVersion, 
  VersionHistory, 
  OperationalTransform,
  Change,
  ChangeSet
} from './types';
import { getOTEngine } from './OperationalTransform';

export class VersionControl {
  private versions: Map<string, DocumentVersion> = new Map();
  private currentVersion: number = 0;
  private baseVersion: number = 0;
  private documentId: string;
  private otEngine = getOTEngine();
  
  constructor(documentId: string) {
    this.documentId = documentId;
    
    // Create initial version
    this.createVersion({
      id: `v0_${documentId}`,
      version: 0,
      hash: this.generateHash(''),
      operations: [],
      timestamp: Date.now(),
      userId: 'system',
      message: 'Initial version'
    });
  }
  
  // Create a new version
  createVersion(version: DocumentVersion): void {
    this.versions.set(version.id, version);
    
    if (version.version > this.currentVersion) {
      this.currentVersion = version.version;
    }
  }
  
  // Get a specific version
  getVersion(versionNumber: number): DocumentVersion | undefined {
    for (const version of this.versions.values()) {
      if (version.version === versionNumber) {
        return version;
      }
    }
    return undefined;
  }
  
  // Get version history
  getHistory(limit?: number): VersionHistory {
    const versionList = Array.from(this.versions.values())
      .sort((a, b) => b.version - a.version);
    
    return {
      versions: limit ? versionList.slice(0, limit) : versionList,
      currentVersion: this.currentVersion,
      baseVersion: this.baseVersion
    };
  }
  
  // Apply operations and create new version
  applyOperations(
    operations: OperationalTransform[], 
    userId: string, 
    message?: string
  ): DocumentVersion {
    const newVersion = this.currentVersion + 1;
    const versionId = `v${newVersion}_${this.documentId}`;
    
    // Get current document state
    const currentDoc = this.reconstructDocument(this.currentVersion);
    
    // Apply operations
    let resultDoc = currentDoc;
    for (const op of operations) {
      resultDoc = this.otEngine.applyOperation(resultDoc, op);
    }
    
    // Create new version
    const version: DocumentVersion = {
      id: versionId,
      version: newVersion,
      hash: this.generateHash(resultDoc),
      operations,
      timestamp: Date.now(),
      userId,
      message
    };
    
    this.createVersion(version);
    
    return version;
  }
  
  // Revert to a specific version
  revertToVersion(versionNumber: number, userId: string): DocumentVersion | null {
    const targetVersion = this.getVersion(versionNumber);
    if (!targetVersion) {
      return null;
    }
    
    // Get operations to revert
    const operationsToRevert = this.getOperationsBetween(versionNumber, this.currentVersion);
    
    // Invert operations
    const revertOperations = operationsToRevert
      .reverse()
      .map(op => this.otEngine.invert(op));
    
    // Apply revert
    return this.applyOperations(
      revertOperations,
      userId,
      `Reverted to version ${versionNumber}`
    );
  }
  
  // Get operations between two versions
  getOperationsBetween(fromVersion: number, toVersion: number): OperationalTransform[] {
    const operations: OperationalTransform[] = [];
    
    for (let v = fromVersion + 1; v <= toVersion; v++) {
      const version = this.getVersion(v);
      if (version) {
        operations.push(...version.operations);
      }
    }
    
    return operations;
  }
  
  // Reconstruct document at specific version
  reconstructDocument(versionNumber: number): string {
    let document = '';
    
    // Apply all operations up to the version
    for (let v = 1; v <= versionNumber; v++) {
      const version = this.getVersion(v);
      if (version) {
        for (const op of version.operations) {
          document = this.otEngine.applyOperation(document, op);
        }
      }
    }
    
    return document;
  }
  
  // Create a branch from current version
  createBranch(branchName: string): string {
    const branchId = `${this.documentId}_${branchName}`;
    const currentDoc = this.reconstructDocument(this.currentVersion);
    
    // Create branch version
    const branchVersion: DocumentVersion = {
      id: `branch_${branchId}`,
      version: this.currentVersion,
      hash: this.generateHash(currentDoc),
      operations: [],
      timestamp: Date.now(),
      userId: 'system',
      message: `Created branch: ${branchName}`
    };
    
    this.createVersion(branchVersion);
    
    return branchId;
  }
  
  // Merge versions
  mergeVersions(
    sourceVersion: number,
    targetVersion: number,
    userId: string
  ): DocumentVersion | null {
    const source = this.getVersion(sourceVersion);
    const target = this.getVersion(targetVersion);
    
    if (!source || !target) {
      return null;
    }
    
    // Find common ancestor
    const commonAncestor = this.findCommonAncestor(sourceVersion, targetVersion);
    
    // Get operations from common ancestor to each version
    const sourceOps = this.getOperationsBetween(commonAncestor, sourceVersion);
    const targetOps = this.getOperationsBetween(commonAncestor, targetVersion);
    
    // Transform source operations against target operations
    let transformedOps = sourceOps;
    for (const targetOp of targetOps) {
      transformedOps = this.otEngine.transformOperations(transformedOps, targetOp);
    }
    
    // Apply merged operations
    return this.applyOperations(
      transformedOps,
      userId,
      `Merged version ${sourceVersion} into ${targetVersion}`
    );
  }
  
  // Find common ancestor of two versions
  private findCommonAncestor(v1: number, v2: number): number {
    // Simple implementation - in real system would track ancestry
    return Math.min(v1, v2) - 1;
  }
  
  // Generate hash for document content
  private generateHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
  
  // Compare two versions
  compareVersions(v1: number, v2: number): {
    added: number;
    removed: number;
    modified: number;
    operations: OperationalTransform[];
  } {
    const operations = this.getOperationsBetween(
      Math.min(v1, v2),
      Math.max(v1, v2)
    );
    
    let added = 0;
    let removed = 0;
    let modified = 0;
    
    for (const op of operations) {
      switch (op.type) {
        case 'insert':
          added += op.content?.length || 0;
          break;
        case 'delete':
          removed += op.length || 0;
          break;
        case 'replace':
          modified += op.length || 0;
          break;
      }
    }
    
    return { added, removed, modified, operations };
  }
  
  // Export version history
  exportHistory(): string {
    const history = this.getHistory();
    return JSON.stringify(history, null, 2);
  }
  
  // Import version history
  importHistory(historyJson: string): void {
    try {
      const history: VersionHistory = JSON.parse(historyJson);
      
      // Clear existing versions
      this.versions.clear();
      
      // Import versions
      for (const version of history.versions) {
        this.createVersion(version);
      }
      
      this.currentVersion = history.currentVersion;
      this.baseVersion = history.baseVersion;
    } catch (error) {
      throw new Error(`Failed to import history: ${error}`);
    }
  }
}

// Change tracking system
export class ChangeTracker {
  private changes: Map<string, Change> = new Map();
  private changeSets: Map<string, ChangeSet> = new Map();
  
  // Track a change
  trackChange(change: Change): void {
    this.changes.set(change.id, change);
  }
  
  // Create a change set
  createChangeSet(
    changes: Change[],
    userId: string,
    userName: string,
    message: string
  ): ChangeSet {
    const changeSet: ChangeSet = {
      id: `cs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      changes,
      userId,
      userName,
      timestamp: Date.now(),
      message,
      status: 'pending'
    };
    
    this.changeSets.set(changeSet.id, changeSet);
    
    // Track individual changes
    changes.forEach(change => this.trackChange(change));
    
    return changeSet;
  }
  
  // Get changes for an element
  getChangesForElement(elementId: string): Change[] {
    return Array.from(this.changes.values())
      .filter(change => change.elementId === elementId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  // Get change sets by status
  getChangeSetsByStatus(status: 'pending' | 'applied' | 'rejected'): ChangeSet[] {
    return Array.from(this.changeSets.values())
      .filter(cs => cs.status === status);
  }
  
  // Apply a change set
  applyChangeSet(changeSetId: string): boolean {
    const changeSet = this.changeSets.get(changeSetId);
    if (!changeSet || changeSet.status !== 'pending') {
      return false;
    }
    
    // In real implementation, would actually apply changes
    changeSet.status = 'applied';
    
    return true;
  }
  
  // Reject a change set
  rejectChangeSet(changeSetId: string): boolean {
    const changeSet = this.changeSets.get(changeSetId);
    if (!changeSet || changeSet.status !== 'pending') {
      return false;
    }
    
    changeSet.status = 'rejected';
    
    return true;
  }
  
  // Get change history
  getChangeHistory(limit?: number): Change[] {
    const allChanges = Array.from(this.changes.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    
    return limit ? allChanges.slice(0, limit) : allChanges;
  }
  
  // Generate change description
  generateChangeDescription(change: Change): string {
    const action = change.type;
    const element = change.elementType;
    
    switch (action) {
      case 'add':
        return `Added ${element} "${change.after.title || change.elementId}"`;
      case 'modify':
        return `Modified ${element} "${change.before.title || change.elementId}"`;
      case 'delete':
        return `Deleted ${element} "${change.before.title || change.elementId}"`;
      default:
        return `${action} ${element} ${change.elementId}`;
    }
  }
}

// Create singleton instances
let versionControl: Map<string, VersionControl> = new Map();
let changeTracker: ChangeTracker | null = null;

export function getVersionControl(documentId: string): VersionControl {
  if (!versionControl.has(documentId)) {
    versionControl.set(documentId, new VersionControl(documentId));
  }
  return versionControl.get(documentId)!;
}

export function getChangeTracker(): ChangeTracker {
  if (!changeTracker) {
    changeTracker = new ChangeTracker();
  }
  return changeTracker;
}