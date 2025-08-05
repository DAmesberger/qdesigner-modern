/**
 * Streaming Service
 * Real-time response streaming with WebSocket integration
 */

import type { 
  StreamingConfig, 
  StreamMessage, 
  StreamSubscription, 
  StreamFilter,
  BackpressureStatus,
  PipelineEvent,
  PipelineContext
} from './types';
import type { Response, QuestionnaireSession } from '$lib/shared/types/response';

export class StreamingService {
  private config: StreamingConfig;
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, StreamSubscription>();
  private messageBuffer: StreamMessage[] = [];
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private flushTimer: number | null = null;
  private sequence = 0;
  
  // Backpressure management
  private queueSize = 0;
  private backpressureThreshold: number;
  private isBackpressured = false;
  
  constructor(config: StreamingConfig) {
    this.config = {
      bufferSize: 100,
      flushInterval: 1000,
      reconnectAttempts: 5,
      reconnectDelay: 2000,
      compression: false,
      ...config
    };
    
    this.backpressureThreshold = config.bufferSize || 100;
    
    if (this.config.enabled) {
      this.connect();
      this.startFlushTimer();
    }
  }

  /**
   * Connect to WebSocket server
   */
  private async connect(): Promise<void> {
    try {
      // In a real implementation, this would connect to your WebSocket server
      // For now, we'll simulate the connection
      this.ws = new WebSocket(this.getWebSocketUrl());
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.onConnectionEstablished();
      };
      
      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.handleConnectionError(error);
      };
      
      this.ws.onclose = () => {
        this.isConnected = false;
        this.handleConnectionClose();
      };
      
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Get WebSocket URL based on environment
   */
  private getWebSocketUrl(): string {
    // In development, use local WebSocket server
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      return `${protocol}//${host}/ws/pipeline`;
    }
    
    // Fallback for server-side
    return 'ws://localhost:8080/ws/pipeline';
  }

  /**
   * Handle successful connection
   */
  private onConnectionEstablished(): void {
    // Send any buffered messages
    this.flushBuffer();
    
    // Emit connection event
    this.emitEvent('stream.connected', {
      timestamp: Date.now(),
      reconnectAttempts: this.reconnectAttempts
    });
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: any): void {
    this.isConnected = false;
    this.scheduleReconnect();
    
    this.emitEvent('error.occurred', {
      type: 'connection',
      error: error.message || 'WebSocket connection error',
      timestamp: Date.now()
    });
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(): void {
    this.isConnected = false;
    
    if (this.reconnectAttempts < (this.config.reconnectAttempts || 5)) {
      this.scheduleReconnect();
    }
    
    this.emitEvent('stream.disconnected', {
      timestamp: Date.now(),
      willReconnect: this.reconnectAttempts < (this.config.reconnectAttempts || 5)
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const delay = (this.config.reconnectDelay || 2000) * Math.pow(2, this.reconnectAttempts);
    
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Stream a response in real-time
   */
  public streamResponse(
    response: Response, 
    session: QuestionnaireSession,
    context?: PipelineContext
  ): void {
    const message: StreamMessage = {
      id: this.generateMessageId(),
      type: 'response',
      sessionId: session.id,
      data: {
        response,
        session: {
          id: session.id,
          questionnaireId: session.questionnaireId,
          participantId: session.participantId,
          status: session.status
        },
        context
      },
      timestamp: Date.now(),
      sequence: this.sequence++
    };

    this.enqueueMessage(message);
  }

  /**
   * Stream progress updates
   */
  public streamProgress(
    sessionId: string,
    progress: {
      current: number;
      total: number;
      percentage: number;
      stage?: string;
    },
    context?: PipelineContext
  ): void {
    const message: StreamMessage = {
      id: this.generateMessageId(),
      type: 'progress',
      sessionId,
      data: { progress, context },
      timestamp: Date.now(),
      sequence: this.sequence++
    };

    this.enqueueMessage(message);
  }

  /**
   * Stream error notifications
   */
  public streamError(
    sessionId: string,
    error: {
      code: string;
      message: string;
      details?: any;
    },
    context?: PipelineContext
  ): void {
    const message: StreamMessage = {
      id: this.generateMessageId(),
      type: 'error',
      sessionId,
      data: { error, context },
      timestamp: Date.now(),
      sequence: this.sequence++
    };

    this.enqueueMessage(message);
  }

  /**
   * Subscribe to stream messages
   */
  public subscribe(
    sessionId: string,
    callback: (message: StreamMessage) => void,
    filters?: StreamFilter[]
  ): string {
    const subscription: StreamSubscription = {
      id: this.generateSubscriptionId(),
      sessionId,
      callback,
      filters
    };

    this.subscriptions.set(subscription.id, subscription);
    return subscription.id;
  }

  /**
   * Unsubscribe from stream messages
   */
  public unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get backpressure status
   */
  public getBackpressureStatus(): BackpressureStatus {
    return {
      queueSize: this.queueSize,
      threshold: this.backpressureThreshold,
      isBackpressured: this.isBackpressured,
      estimatedDelay: this.calculateEstimatedDelay()
    };
  }

  /**
   * Enqueue message for streaming
   */
  private enqueueMessage(message: StreamMessage): void {
    // Check for backpressure
    if (this.queueSize >= this.backpressureThreshold) {
      if (!this.isBackpressured) {
        this.isBackpressured = true;
        this.emitEvent('queue.full', {
          queueSize: this.queueSize,
          threshold: this.backpressureThreshold,
          timestamp: Date.now()
        });
      }
      
      // Drop oldest messages to make room
      if (this.messageBuffer.length >= (this.config.bufferSize || 100)) {
        this.messageBuffer.shift();
      }
    }

    this.messageBuffer.push(message);
    this.queueSize = this.messageBuffer.length;

    // Notify subscribers immediately for real-time updates
    this.notifySubscribers(message);

    // Flush if buffer is full or connection is available
    if (this.shouldFlush()) {
      this.flushBuffer();
    }
  }

  /**
   * Check if buffer should be flushed
   */
  private shouldFlush(): boolean {
    return (
      this.isConnected &&
      (this.messageBuffer.length >= (this.config.bufferSize || 100) ||
       this.messageBuffer.length > 0)
    );
  }

  /**
   * Flush message buffer to WebSocket
   */
  private flushBuffer(): void {
    if (!this.isConnected || this.messageBuffer.length === 0) {
      return;
    }

    try {
      const messages = this.messageBuffer.splice(0);
      this.queueSize = 0;
      
      // Reset backpressure status
      if (this.isBackpressured) {
        this.isBackpressured = false;
        this.emitEvent('queue.empty', {
          timestamp: Date.now()
        });
      }

      // Send messages
      const payload = this.config.compression 
        ? this.compressMessages(messages)
        : messages;

      this.ws?.send(JSON.stringify({
        type: 'batch',
        messages: payload,
        timestamp: Date.now()
      }));

    } catch (error) {
      console.error('Failed to flush buffer:', error);
      // Re-queue messages on failure
      this.messageBuffer.unshift(...messages);
      this.queueSize = this.messageBuffer.length;
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = window.setInterval(() => {
      this.flushBuffer();
    }, this.config.flushInterval || 1000);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: any): void {
    if (data.type === 'ack') {
      // Handle acknowledgment
      return;
    }

    if (data.type === 'error') {
      console.error('Server error:', data.error);
      return;
    }

    // Forward to subscribers
    if (data.type === 'message' && data.message) {
      this.notifySubscribers(data.message);
    }
  }

  /**
   * Notify subscribers of new message
   */
  private notifySubscribers(message: StreamMessage): void {
    for (const subscription of this.subscriptions.values()) {
      if (this.matchesSubscription(message, subscription)) {
        try {
          subscription.callback(message);
        } catch (error) {
          console.error('Subscription callback error:', error);
        }
      }
    }
  }

  /**
   * Check if message matches subscription criteria
   */
  private matchesSubscription(
    message: StreamMessage, 
    subscription: StreamSubscription
  ): boolean {
    // Check session ID match
    if (subscription.sessionId !== '*' && 
        subscription.sessionId !== message.sessionId) {
      return false;
    }

    // Apply filters
    if (subscription.filters) {
      return subscription.filters.every(filter => 
        this.applyFilter(message, filter)
      );
    }

    return true;
  }

  /**
   * Apply individual filter to message
   */
  private applyFilter(message: StreamMessage, filter: StreamFilter): boolean {
    switch (filter.type) {
      case 'question':
        return this.matchesFilterValue(
          message.data?.response?.questionId, 
          filter.value, 
          filter.operator
        );
        
      case 'responseType':
        return this.matchesFilterValue(
          message.data?.response?.type, 
          filter.value, 
          filter.operator
        );
        
      case 'custom':
        if (typeof filter.value === 'function') {
          return filter.value(message);
        }
        return true;
        
      default:
        return true;
    }
  }

  /**
   * Match filter value with operator
   */
  private matchesFilterValue(
    value: any, 
    filterValue: string | RegExp, 
    operator: string = 'equals'
  ): boolean {
    switch (operator) {
      case 'equals':
        return value === filterValue;
      case 'contains':
        return String(value).includes(String(filterValue));
      case 'matches':
        if (filterValue instanceof RegExp) {
          return filterValue.test(String(value));
        }
        return false;
      default:
        return value === filterValue;
    }
  }

  /**
   * Compress messages for transmission
   */
  private compressMessages(messages: StreamMessage[]): any {
    // Simple compression - in production, use a proper compression library
    return messages.map(msg => ({
      ...msg,
      data: this.config.compression ? this.compressData(msg.data) : msg.data
    }));
  }

  /**
   * Compress data object
   */
  private compressData(data: any): any {
    // Placeholder for compression logic
    // In production, implement proper compression
    return data;
  }

  /**
   * Calculate estimated delay due to backpressure
   */
  private calculateEstimatedDelay(): number {
    if (!this.isBackpressured) return 0;
    
    const excessMessages = this.queueSize - this.backpressureThreshold;
    const flushInterval = this.config.flushInterval || 1000;
    const bufferSize = this.config.bufferSize || 100;
    
    return Math.ceil(excessMessages / bufferSize) * flushInterval;
  }

  /**
   * Emit pipeline event
   */
  private emitEvent(type: string, data: any): void {
    const event: PipelineEvent = {
      id: this.generateMessageId(),
      type: type as any,
      source: 'StreamingService',
      timestamp: Date.now(),
      data
    };

    // In a full implementation, this would use an event bus
    console.log('Pipeline Event:', event);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Disconnect and cleanup
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.subscriptions.clear();
    this.messageBuffer = [];
    this.isConnected = false;
  }

  /**
   * Get service status
   */
  public getStatus() {
    return {
      connected: this.isConnected,
      bufferedMessages: this.messageBuffer.length,
      subscriptions: this.subscriptions.size,
      backpressured: this.isBackpressured,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}