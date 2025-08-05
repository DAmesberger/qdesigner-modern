// Base storage class for analytics modules

import type { StorageData } from '$lib/services/localStorage';

export abstract class BaseAnalyticsStorage {
  protected storage: StorageData;
  protected questionnaireId: string;
  
  constructor(storage: StorageData, questionnaireId: string) {
    this.storage = storage;
    this.questionnaireId = questionnaireId;
  }
  
  /**
   * Track analytics view
   */
  async trackView(analyticsId: string, data?: {
    variables?: string[];
    chartType?: string;
    timestamp?: number;
  }): Promise<void> {
    await this.storage.saveResponse({
      questionnaireId: this.questionnaireId,
      questionId: analyticsId,
      value: JSON.stringify({
        type: 'analytics-view',
        ...data,
        timestamp: data?.timestamp || Date.now()
      })
    });
  }
  
  /**
   * Track analytics interaction
   */
  async trackInteraction(analyticsId: string, interaction: {
    type: 'hover' | 'click' | 'zoom' | 'pan';
    data?: any;
    timestamp?: number;
  }): Promise<void> {
    await this.storage.saveResponse({
      questionnaireId: this.questionnaireId,
      questionId: analyticsId,
      value: JSON.stringify({
        type: 'analytics-interaction',
        interaction: interaction.type,
        data: interaction.data,
        timestamp: interaction.timestamp || Date.now()
      })
    });
  }
  
  /**
   * Get all analytics events
   */
  async getEvents(analyticsId: string): Promise<Array<{
    type: string;
    timestamp: number;
    data?: any;
  }>> {
    const responses = await this.storage.getResponses(this.questionnaireId);
    const events = responses
      .filter(r => r.questionId === analyticsId)
      .map(r => {
        try {
          return typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    
    return events;
  }
  
  /**
   * Get view statistics
   */
  async getViewStats(analyticsId: string): Promise<{
    viewCount: number;
    uniqueViews: number;
    averageViewDuration?: number;
    interactions: Record<string, number>;
  }> {
    const events = await this.getEvents(analyticsId);
    
    const views = events.filter(e => e.type === 'analytics-view');
    const interactions = events.filter(e => e.type === 'analytics-interaction');
    
    // Count interaction types
    const interactionCounts: Record<string, number> = {};
    interactions.forEach(i => {
      const type = i.interaction || 'unknown';
      interactionCounts[type] = (interactionCounts[type] || 0) + 1;
    });
    
    return {
      viewCount: views.length,
      uniqueViews: views.length, // Would need session tracking for true unique views
      interactions: interactionCounts
    };
  }
  
  /**
   * Clear all events for an analytics block
   */
  async clearEvents(analyticsId: string): Promise<void> {
    const allResponses = await this.storage.getResponses(this.questionnaireId);
    const filtered = allResponses.filter(r => r.questionId !== analyticsId);
    
    // Save filtered responses back
    for (const response of filtered) {
      await this.storage.saveResponse(response);
    }
  }
}