import type { 
  Response, 
  StatUpdate, 
  RealtimeConfig,
  DescriptiveStats,
  CorrelationMatrix,
  Variable
} from '../types';
import { StatisticsEngine } from '../calculations/StatisticsEngine';
import { getWebSocketManager } from './WebSocketManager';

export interface RealtimeChannel {
  questionnaireId: string;
  questionId?: string;
  metric: 'descriptive' | 'correlation' | 'responses' | 'completion';
}

export class RealtimeAnalytics {
  private engine: StatisticsEngine;
  private responseBuffer: Map<string, Response[]> = new Map();
  private updateCallbacks: Map<string, Set<(update: StatUpdate) => void>> = new Map();
  private aggregationTimers: Map<string, number> = new Map();
  
  constructor() {
    this.engine = new StatisticsEngine();
  }
  
  // Subscribe to real-time updates for a specific metric
  subscribe(
    channel: RealtimeChannel,
    config: RealtimeConfig,
    callback: (update: StatUpdate) => void
  ): () => void {
    const channelKey = this.getChannelKey(channel);
    
    // Add callback
    if (!this.updateCallbacks.has(channelKey)) {
      this.updateCallbacks.set(channelKey, new Set());
    }
    this.updateCallbacks.get(channelKey)!.add(callback);
    
    // Subscribe to WebSocket updates
    const wsManager = getWebSocketManager();
    const unsubscribeWs = wsManager.subscribe(
      channelKey,
      config,
      (wsUpdate: StatUpdate) => {
        this.handleWebSocketUpdate(channel, config, wsUpdate);
      }
    );
    
    // Start aggregation timer if needed
    if (config.aggregation !== 'none' && config.updateInterval > 0) {
      this.startAggregation(channelKey, channel, config);
    }
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.updateCallbacks.get(channelKey);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.updateCallbacks.delete(channelKey);
          this.stopAggregation(channelKey);
          unsubscribeWs();
        }
      }
    };
  }
  
  // Add a new response and trigger updates
  addResponse(response: Response): void {
    const questionKey = `${response.questionnaireId}:${response.questionId}`;
    
    // Add to buffer
    if (!this.responseBuffer.has(questionKey)) {
      this.responseBuffer.set(questionKey, []);
    }
    this.responseBuffer.get(questionKey)!.push(response);
    
    // Trigger immediate updates for non-aggregated subscriptions
    this.triggerImmediateUpdates(response);
  }
  
  // Get current statistics for a question
  getQuestionStats(questionnaireId: string, questionId: string): DescriptiveStats | null {
    const questionKey = `${questionnaireId}:${questionId}`;
    const responses = this.responseBuffer.get(questionKey);
    
    if (!responses || responses.length === 0) {
      return null;
    }
    
    return this.engine.calculateDescriptives(responses);
  }
  
  // Get correlation matrix for multiple variables
  getCorrelations(
    questionnaireId: string,
    variables: Variable[],
    method: 'pearson' | 'spearman' | 'kendall' = 'pearson'
  ): CorrelationMatrix | null {
    // Filter variables to only include those from this questionnaire
    const validVariables = variables.filter(v => {
      const responses = this.responseBuffer.get(`${questionnaireId}:${v.id}`);
      return responses && responses.length > 0;
    });
    
    if (validVariables.length < 2) {
      return null;
    }
    
    // Update variable values from response buffer
    const updatedVariables = validVariables.map(v => ({
      ...v,
      values: this.responseBuffer.get(`${questionnaireId}:${v.id}`)!
        .map(r => parseFloat(r.value))
        .filter(val => !isNaN(val))
    }));
    
    return this.engine.calculateCorrelations(updatedVariables, method);
  }
  
  // Clear response buffer for a questionnaire
  clearBuffer(questionnaireId: string): void {
    const keysToDelete: string[] = [];
    
    this.responseBuffer.forEach((_, key) => {
      if (key.startsWith(`${questionnaireId}:`)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.responseBuffer.delete(key));
  }
  
  private handleWebSocketUpdate(
    channel: RealtimeChannel,
    config: RealtimeConfig,
    update: StatUpdate
  ): void {
    // Add response to buffer if it's a response update
    if (update.type === 'descriptive' && update.data) {
      const response = update.data as Response;
      this.addResponse(response);
    }
    
    // For non-aggregated updates, forward immediately
    if (config.aggregation === 'none') {
      this.notifySubscribers(channel, update);
    }
  }
  
  private triggerImmediateUpdates(response: Response): void {
    // Check all subscriptions for immediate updates
    this.updateCallbacks.forEach((callbacks, channelKey) => {
      const channel = this.parseChannelKey(channelKey);
      
      if (channel.questionnaireId === response.questionnaireId &&
          (!channel.questionId || channel.questionId === response.questionId)) {
        
        // Calculate new statistics
        const stats = this.getQuestionStats(response.questionnaireId, response.questionId);
        
        if (stats) {
          const update: StatUpdate = {
            type: 'descriptive',
            questionId: response.questionId,
            data: stats,
            timestamp: Date.now()
          };
          
          callbacks.forEach(callback => {
            try {
              callback(update);
            } catch (error) {
              console.error('Realtime update callback error:', error);
            }
          });
        }
      }
    });
  }
  
  private startAggregation(
    channelKey: string,
    channel: RealtimeChannel,
    config: RealtimeConfig
  ): void {
    if (this.aggregationTimers.has(channelKey)) {
      return;
    }
    
    const timer = window.setInterval(() => {
      this.performAggregation(channel, config);
    }, config.updateInterval);
    
    this.aggregationTimers.set(channelKey, timer);
  }
  
  private stopAggregation(channelKey: string): void {
    const timer = this.aggregationTimers.get(channelKey);
    if (timer) {
      clearInterval(timer);
      this.aggregationTimers.delete(channelKey);
    }
  }
  
  private performAggregation(channel: RealtimeChannel, config: RealtimeConfig): void {
    const responses = this.getChannelResponses(channel);
    if (responses.length === 0) return;
    
    let data: any;
    
    switch (config.aggregation) {
      case 'mean': {
        const values = responses
          .map(r => parseFloat(r.value))
          .filter(v => !isNaN(v));
        data = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      }
      
      case 'sum': {
        const values = responses
          .map(r => parseFloat(r.value))
          .filter(v => !isNaN(v));
        data = values.reduce((a, b) => a + b, 0);
        break;
      }
      
      case 'count': {
        data = responses.length;
        break;
      }
      
      default:
        return;
    }
    
    const update: StatUpdate = {
      type: channel.metric,
      questionId: channel.questionId,
      data,
      timestamp: Date.now()
    };
    
    this.notifySubscribers(channel, update);
  }
  
  private getChannelResponses(channel: RealtimeChannel): Response[] {
    const responses: Response[] = [];
    
    this.responseBuffer.forEach((questionResponses, key) => {
      const [qnaireId, qId] = key.split(':');
      
      if (qnaireId === channel.questionnaireId &&
          (!channel.questionId || qId === channel.questionId)) {
        responses.push(...questionResponses);
      }
    });
    
    return responses;
  }
  
  private notifySubscribers(channel: RealtimeChannel, update: StatUpdate): void {
    const channelKey = this.getChannelKey(channel);
    const callbacks = this.updateCallbacks.get(channelKey);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(update);
        } catch (error) {
          console.error('Subscriber notification error:', error);
        }
      });
    }
  }
  
  private getChannelKey(channel: RealtimeChannel): string {
    return `${channel.questionnaireId}:${channel.questionId || '*'}:${channel.metric}`;
  }
  
  private parseChannelKey(key: string): RealtimeChannel {
    const [questionnaireId, questionId, metric] = key.split(':');
    return {
      questionnaireId,
      questionId: questionId === '*' ? undefined : questionId,
      metric: metric as RealtimeChannel['metric']
    };
  }
}

// Singleton instance
let realtimeAnalytics: RealtimeAnalytics | null = null;

export function getRealtimeAnalytics(): RealtimeAnalytics {
  if (!realtimeAnalytics) {
    realtimeAnalytics = new RealtimeAnalytics();
  }
  return realtimeAnalytics;
}