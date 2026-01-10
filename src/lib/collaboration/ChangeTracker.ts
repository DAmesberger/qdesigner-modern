/**
 * Change Tracker
 * Tracks and logs all changes for audit trails and activity timelines
 */

import type {
  ChangeRecord,
  ActivityItem,
  AuditLog,
  Operation,
  CollaborationUser,
  CollaborationSession
} from './types.js';
import type { Questionnaire } from '$lib/shared';

export class ChangeTracker {
  private static instance: ChangeTracker;
  private changes = new Map<string, ChangeRecord[]>(); // questionnaireId -> changes
  private activities = new Map<string, ActivityItem[]>(); // questionnaireId -> activities
  private changeIdCounter = 0;
  private activityIdCounter = 0;
  private maxChangesPerQuestionnaire = 1000;
  private maxActivitiesPerQuestionnaire = 500;

  static getInstance(): ChangeTracker {
    if (!ChangeTracker.instance) {
      ChangeTracker.instance = new ChangeTracker();
    }
    return ChangeTracker.instance;
  }

  // ============================================================================
  // Change Recording
  // ============================================================================

  /**
   * Record a change operation
   */
  recordChange(
    questionnaireId: string,
    sessionId: string,
    operation: Operation,
    user: CollaborationUser,
    version: number = 1
  ): ChangeRecord {
    const change: ChangeRecord = {
      id: `change_${++this.changeIdCounter}_${Date.now()}`,
      questionnaireId,
      sessionId,
      operation,
      user,
      timestamp: new Date(),
      version,
      description: this.generateChangeDescription(operation),
      category: this.categorizeChange(operation),
      impact: this.assessImpact(operation)
    };

    this.addChange(questionnaireId, change);
    this.recordActivity(questionnaireId, {
      type: 'operation',
      user,
      title: change.description,
      description: this.getDetailedDescription(operation),
      metadata: {
        operationType: operation.type,
        target: this.getOperationTarget(operation),
        changeId: change.id
      },
      relatedItems: this.getRelatedItems(operation)
    });

    return change;
  }

  /**
   * Record a comment activity
   */
  recordCommentActivity(
    questionnaireId: string,
    user: CollaborationUser,
    action: 'created' | 'updated' | 'deleted' | 'resolved',
    commentId: string,
    content?: string,
    targetId?: string
  ): ActivityItem {
    const titles = {
      created: 'Added comment',
      updated: 'Updated comment',
      deleted: 'Deleted comment',
      resolved: 'Resolved comment'
    };

    return this.recordActivity(questionnaireId, {
      type: 'comment',
      user,
      title: titles[action],
      description: content ? `"${this.truncateText(content, 100)}"` : undefined,
      metadata: {
        action,
        commentId,
        targetId
      },
      relatedItems: targetId ? [targetId] : undefined
    });
  }

  /**
   * Record a version activity
   */
  recordVersionActivity(
    questionnaireId: string,
    user: CollaborationUser,
    action: 'created' | 'restored' | 'tagged',
    versionId: string,
    message?: string
  ): ActivityItem {
    const titles = {
      created: 'Created version',
      restored: 'Restored version',
      tagged: 'Tagged version'
    };

    return this.recordActivity(questionnaireId, {
      type: 'version',
      user,
      title: titles[action],
      description: message,
      metadata: {
        action,
        versionId
      }
    });
  }

  /**
   * Record a merge activity
   */
  recordMergeActivity(
    questionnaireId: string,
    user: CollaborationUser,
    fromBranch: string,
    toBranch: string,
    mergeRequestId?: string
  ): ActivityItem {
    return this.recordActivity(questionnaireId, {
      type: 'merge',
      user,
      title: `Merged ${fromBranch} into ${toBranch}`,
      metadata: {
        fromBranch,
        toBranch,
        mergeRequestId
      }
    });
  }

  /**
   * Record session join/leave activities
   */
  recordSessionActivity(
    questionnaireId: string,
    user: CollaborationUser,
    action: 'joined' | 'left'
  ): ActivityItem {
    const titles = {
      joined: 'Joined collaboration session',
      left: 'Left collaboration session'
    };

    return this.recordActivity(questionnaireId, {
      type: action === 'joined' ? 'join' : 'leave',
      user,
      title: titles[action],
      metadata: {
        action,
        sessionId: questionnaireId // Using questionnaire ID as session ID
      }
    });
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get all changes for a questionnaire
   */
  getChanges(
    questionnaireId: string,
    options: {
      limit?: number;
      offset?: number;
      userId?: string;
      category?: ChangeRecord['category'];
      impact?: ChangeRecord['impact'];
      since?: Date;
      until?: Date;
    } = {}
  ): ChangeRecord[] {
    const allChanges = this.changes.get(questionnaireId) || [];
    let filtered = [...allChanges];

    // Apply filters
    if (options.userId) {
      filtered = filtered.filter(c => c.user.id === options.userId);
    }

    if (options.category) {
      filtered = filtered.filter(c => c.category === options.category);
    }

    if (options.impact) {
      filtered = filtered.filter(c => c.impact === options.impact);
    }

    if (options.since) {
      filtered = filtered.filter(c => c.timestamp >= options.since!);
    }

    if (options.until) {
      filtered = filtered.filter(c => c.timestamp <= options.until!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || filtered.length;
    
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get all activities for a questionnaire
   */
  getActivities(
    questionnaireId: string,
    options: {
      limit?: number;
      offset?: number;
      userId?: string;
      type?: ActivityItem['type'];
      since?: Date;
      until?: Date;
    } = {}
  ): ActivityItem[] {
    const allActivities = this.activities.get(questionnaireId) || [];
    let filtered = [...allActivities];

    // Apply filters
    if (options.userId) {
      filtered = filtered.filter(a => a.user.id === options.userId);
    }

    if (options.type) {
      filtered = filtered.filter(a => a.type === options.type);
    }

    if (options.since) {
      filtered = filtered.filter(a => a.timestamp >= options.since!);
    }

    if (options.until) {
      filtered = filtered.filter(a => a.timestamp <= options.until!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || filtered.length;
    
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get changes by specific user
   */
  getUserChanges(questionnaireId: string, userId: string, limit: number = 50): ChangeRecord[] {
    return this.getChanges(questionnaireId, { userId, limit });
  }

  /**
   * Get recent activities
   */
  getRecentActivities(questionnaireId: string, hours: number = 24, limit: number = 20): ActivityItem[] {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.getActivities(questionnaireId, { since, limit });
  }

  /**
   * Get activity timeline grouped by date
   */
  getActivityTimeline(
    questionnaireId: string,
    days: number = 7
  ): { date: string; activities: ActivityItem[] }[] {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const activities = this.getActivities(questionnaireId, { since });

    // Group by date
    const grouped = new Map<string, ActivityItem[]>();
    
    for (const activity of activities) {
      if (!activity.timestamp) continue;
      const dateKey = activity.timestamp.toISOString().split('T')[0] as string;
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(activity);
    }

    // Convert to array and sort
    return Array.from(grouped.entries())
      .map(([date, activities]) => ({ date, activities }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  // ============================================================================
  // Statistics and Analytics
  // ============================================================================

  /**
   * Get change statistics for a questionnaire
   */
  getChangeStatistics(
    questionnaireId: string,
    period: { start: Date; end: Date }
  ): {
    totalChanges: number;
    changesByCategory: Record<ChangeRecord['category'], number>;
    changesByImpact: Record<ChangeRecord['impact'], number>;
    changesByUser: Record<string, number>;
    changesByDay: { date: string; count: number }[];
    mostActiveUsers: { userId: string; userName: string; changeCount: number }[];
  } {
    const changes = this.getChanges(questionnaireId, {
      since: period.start,
      until: period.end
    });

    const stats = {
      totalChanges: changes.length,
      changesByCategory: {
        content: 0,
        structure: 0,
        settings: 0,
        metadata: 0
      } as Record<ChangeRecord['category'], number>,
      changesByImpact: {
        minor: 0,
        major: 0,
        breaking: 0
      } as Record<ChangeRecord['impact'], number>,
      changesByUser: {} as Record<string, number>,
      changesByDay: [] as { date: string; count: number }[],
      mostActiveUsers: [] as { userId: string; userName: string; changeCount: number }[]
    };

    // Count by category and impact
    for (const change of changes) {
      stats.changesByCategory[change.category]++;
      stats.changesByImpact[change.impact]++;
      
      // Count by user
      const userId = change.user.id;
      stats.changesByUser[userId] = (stats.changesByUser[userId] || 0) + 1;
    }

    // Group by day
    const dayGroups = new Map<string, number>();
    for (const change of changes) {
      if (!change.timestamp) continue;
      const day = change.timestamp.toISOString().split('T')[0] as string;
      dayGroups.set(day, (dayGroups.get(day) || 0) + 1);
    }
    
    stats.changesByDay = Array.from(dayGroups.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Most active users
    const userCounts = Object.entries(stats.changesByUser)
      .map(([userId, count]) => {
        const user = changes.find(c => c.user.id === userId)?.user;
        return {
          userId,
          userName: user?.name || 'Unknown',
          changeCount: count
        };
      })
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 10);

    stats.mostActiveUsers = userCounts;

    return stats;
  }

  /**
   * Generate audit log for a period
   */
  generateAuditLog(
    questionnaireId: string,
    organizationId: string,
    projectId: string,
    period: { start: Date; end: Date }
  ): AuditLog {
    const changes = this.getChanges(questionnaireId, {
      since: period.start,
      until: period.end
    });

    const activities = this.getActivities(questionnaireId, {
      since: period.start,
      until: period.end
    });

    const uniqueUsers = new Set(
      [...changes.map(c => c.user.id), ...activities.map(a => a.user.id)]
    );

    return {
      id: `audit_${questionnaireId}_${Date.now()}`,
      questionnaireId,
      organizationId,
      projectId,
      changes,
      activities,
      startDate: period.start,
      endDate: period.end,
      totalChanges: changes.length,
      totalUsers: uniqueUsers.size
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private addChange(questionnaireId: string, change: ChangeRecord): void {
    if (!this.changes.has(questionnaireId)) {
      this.changes.set(questionnaireId, []);
    }

    const changes = this.changes.get(questionnaireId)!;
    changes.unshift(change); // Add to beginning for chronological order

    // Trim to maximum size
    if (changes.length > this.maxChangesPerQuestionnaire) {
      changes.splice(this.maxChangesPerQuestionnaire);
    }

    this.changes.set(questionnaireId, changes);
  }

  private recordActivity(
    questionnaireId: string,
    activityData: Omit<ActivityItem, 'id' | 'timestamp'>
  ): ActivityItem {
    const activity: ActivityItem = {
      ...activityData,
      id: `activity_${++this.activityIdCounter}_${Date.now()}`,
      timestamp: new Date()
    };

    if (!this.activities.has(questionnaireId)) {
      this.activities.set(questionnaireId, []);
    }

    const activities = this.activities.get(questionnaireId)!;
    activities.unshift(activity); // Add to beginning for chronological order

    // Trim to maximum size
    if (activities.length > this.maxActivitiesPerQuestionnaire) {
      activities.splice(this.maxActivitiesPerQuestionnaire);
    }

    this.activities.set(questionnaireId, activities);
    return activity;
  }

  private generateChangeDescription(operation: Operation): string {
    switch (operation.type) {
      case 'insert':
        const insertOp = operation as any;
        return `Added ${insertOp.target} at position ${insertOp.position}`;
        
      case 'delete':
        const deleteOp = operation as any;
        return `Deleted ${deleteOp.target} at position ${deleteOp.position}`;
        
      case 'update':
        const updateOp = operation as any;
        return `Updated ${updateOp.property}`;
        
      case 'move':
        const moveOp = operation as any;
        return `Moved item from ${moveOp.fromPath.join('.')} to ${moveOp.toPath.join('.')}`;
        
      case 'reorder':
        return 'Reordered items';
        
      default:
        return `Performed ${(operation as any).type} operation`;
    }
  }

  private getDetailedDescription(operation: Operation): string {
    switch (operation.type) {
      case 'insert':
        const insertOp = operation as any;
        return `Inserted ${insertOp.target} "${this.getContentPreview(insertOp.content)}" at position ${insertOp.position} in ${insertOp.path.join('.')}`;
        
      case 'delete':
        const deleteOp = operation as any;
        return `Deleted ${deleteOp.length || 1} ${deleteOp.target}(s) starting at position ${deleteOp.position} in ${deleteOp.path.join('.')}`;
        
      case 'update':
        const updateOp = operation as any;
        return `Changed ${updateOp.property} from "${this.getContentPreview(updateOp.oldValue)}" to "${this.getContentPreview(updateOp.newValue)}" in ${updateOp.path.join('.')}`;
        
      case 'move':
        const moveOp = operation as any;
        return `Moved item from position ${moveOp.fromPosition} in ${moveOp.fromPath.join('.')} to position ${moveOp.toPosition} in ${moveOp.toPath.join('.')}`;
        
      case 'reorder':
        const reorderOp = operation as any;
        return `Reordered ${reorderOp.indices.length} items in ${reorderOp.path.join('.')}`;
        
      default:
        return `Performed ${(operation as any).type} operation on ${(operation as any).path.join('.')}`;
    }
  }

  private categorizeChange(operation: Operation): ChangeRecord['category'] {
    const path = operation.path.join('.');
    
    if (path.includes('questions') || path.includes('content') || path.includes('display')) {
      return 'content';
    }
    
    if (path.includes('pages') || path.includes('blocks') || path.includes('flow')) {
      return 'structure';
    }
    
    if (path.includes('settings') || path.includes('variables')) {
      return 'settings';
    }
    
    return 'metadata';
  }

  private assessImpact(operation: Operation): ChangeRecord['impact'] {
    const path = operation.path.join('.');
    
    // Breaking changes
    if (operation.type === 'delete' && (path.includes('questions') || path.includes('pages'))) {
      return 'breaking';
    }
    
    // Major changes
    if (path.includes('questions') || path.includes('variables') || path.includes('flow')) {
      return 'major';
    }
    
    // Minor changes
    return 'minor';
  }

  private getOperationTarget(operation: Operation): string {
    if ('target' in operation) {
      return (operation as any).target;
    }
    
    const lastPathSegment = operation.path[operation.path.length - 1];
    return lastPathSegment || 'unknown';
  }

  private getRelatedItems(operation: Operation): string[] | undefined {
    const relatedItems: string[] = [];
    
    // Extract IDs from the operation path or content
    if ('content' in operation && operation.content?.id) {
      relatedItems.push(operation.content.id);
    }
    
    // For path-based operations, try to extract item IDs
    for (const segment of operation.path) {
      if (segment.match(/^[a-f0-9\-]+$/i)) { // Looks like an ID
        relatedItems.push(segment);
      }
    }
    
    return relatedItems.length > 0 ? relatedItems : undefined;
  }

  private getContentPreview(content: any): string {
    if (typeof content === 'string') {
      return this.truncateText(content, 50);
    }
    
    if (typeof content === 'object' && content !== null) {
      if (content.name) return content.name;
      if (content.title) return content.title;
      if (content.prompt) return this.truncateText(content.prompt, 50);
      return '[Object]';
    }
    
    return String(content);
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  // ============================================================================
  // Management Methods
  // ============================================================================

  /**
   * Clear all changes and activities for a questionnaire
   */
  clearHistory(questionnaireId: string): void {
    this.changes.delete(questionnaireId);
    this.activities.delete(questionnaireId);
  }

  /**
   * Export change history for backup
   */
  exportHistory(questionnaireId: string): {
    changes: ChangeRecord[];
    activities: ActivityItem[];
  } {
    return {
      changes: this.changes.get(questionnaireId) || [],
      activities: this.activities.get(questionnaireId) || []
    };
  }

  /**
   * Import change history from backup
   */
  importHistory(
    questionnaireId: string,
    data: { changes: ChangeRecord[]; activities: ActivityItem[] }
  ): void {
    this.changes.set(questionnaireId, data.changes);
    this.activities.set(questionnaireId, data.activities);
  }

  /**
   * Get memory usage statistics
   */
  getMemoryUsage(): {
    questionnaires: number;
    totalChanges: number;
    totalActivities: number;
    memoryEstimate: string;
  } {
    let totalChanges = 0;
    let totalActivities = 0;
    
    for (const changes of this.changes.values()) {
      totalChanges += changes.length;
    }
    
    for (const activities of this.activities.values()) {
      totalActivities += activities.length;
    }
    
    // Rough estimate of memory usage
    const averageChangeSize = 1024; // 1KB per change record
    const averageActivitySize = 512; // 512B per activity
    const estimatedBytes = (totalChanges * averageChangeSize) + (totalActivities * averageActivitySize);
    
    return {
      questionnaires: this.changes.size,
      totalChanges,
      totalActivities,
      memoryEstimate: this.formatBytes(estimatedBytes)
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}