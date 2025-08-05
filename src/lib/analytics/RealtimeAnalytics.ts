/**
 * Real-time Analytics Client
 * WebSocket and Server-Sent Events client for live data streaming
 */

import type {
  RealtimeConfig,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeBuffer,
  ConnectionStatus,
  AnalyticsError
} from './types';

export class RealtimeAnalytics {
  private static instance: RealtimeAnalytics;
  private config: RealtimeConfig;
  private connection: WebSocket | EventSource | null = null;
  private connectionStatus: ConnectionStatus;
  private buffer: RealtimeBuffer;
  private eventListeners: Map<RealtimeEventType | 'connection' | 'error', Function[]> = new Map();
  private reconnectTimeout: number | null = null;
  private heartbeatInterval: number | null = null;
  private lastHeartbeat: number = 0;
  private isReconnecting: boolean = false;

  private constructor(config: RealtimeConfig) {
    this.config = config;
    this.connectionStatus = {
      connected: false,
      connectionType: 'offline',
      reconnectAttempts: 0,
      errors: []
    };
    this.buffer = {
      events: [],
      lastFlush: Date.now(),
      maxSize: config.bufferSize || 1000,
      autoFlush: true
    };

    // Set up auto-flush if enabled
    if (this.buffer.autoFlush) {
      setInterval(() => this.flushBuffer(), config.flushInterval || 5000);
    }

    // Set up beforeunload handler to flush buffer
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushBuffer());
    }
  }

  static getInstance(config?: RealtimeConfig): RealtimeAnalytics {
    if (!RealtimeAnalytics.instance && config) {
      RealtimeAnalytics.instance = new RealtimeAnalytics(config);
    }
    return RealtimeAnalytics.instance;
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to the real-time analytics endpoint
   */
  async connect(): Promise<void> {
    if (this.connection && this.connectionStatus.connected) {
      return;
    }

    try {
      // Try WebSocket first, fall back to SSE if needed
      if (this.supportsWebSocket() && !this.config.fallbackToSSE) {
        await this.connectWebSocket();
      } else {
        await this.connectSSE();
      }

      this.connectionStatus.connected = true;
      this.connectionStatus.reconnectAttempts = 0;
      this.connectionStatus.lastConnected = Date.now();
      this.startHeartbeat();
      this.emit('connection', { connected: true, type: this.connectionStatus.connectionType });
      
    } catch (error) {
      this.handleConnectionError(error as Error);
      
      // Try fallback connection method
      if (!this.config.fallbackToSSE && this.supportsSSE()) {
        this.config.fallbackToSSE = true;
        await this.connect();
      }
    }
  }

  /**
   * Disconnect from the real-time analytics endpoint
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.clearReconnectTimeout();

    if (this.connection) {
      if (this.connection instanceof WebSocket) {
        this.connection.close(1000, 'User initiated disconnect');
      } else if (this.connection instanceof EventSource) {
        this.connection.close();
      }
      this.connection = null;
    }

    this.connectionStatus.connected = false;
    this.connectionStatus.connectionType = 'offline';
    this.emit('connection', { connected: false, type: 'offline' });
  }

  /**
   * Reconnect with exponential backoff
   */
  private async reconnect(): Promise<void> {
    if (this.isReconnecting || this.connectionStatus.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }

    this.isReconnecting = true;
    this.connectionStatus.reconnectAttempts++;

    const backoffDelay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.connectionStatus.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.reconnectTimeout = window.setTimeout(async () => {
      try {
        await this.connect();
        this.isReconnecting = false;
      } catch (error) {
        this.isReconnecting = false;
        this.handleConnectionError(error as Error);
        
        if (this.connectionStatus.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.reconnect();
        }
      }
    }, backoffDelay);
  }

  // ============================================================================
  // WebSocket Implementation
  // ============================================================================

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.buildWebSocketUrl();
        const ws = new WebSocket(wsUrl);

        // Set up compression if supported
        if (this.config.compression && 'permessage-deflate' in ws) {
          ws.binaryType = 'arraybuffer';
        }

        ws.onopen = () => {
          this.connection = ws;
          this.connectionStatus.connectionType = 'websocket';
          
          // Send authentication if required
          if (this.config.authentication) {
            this.sendAuthentication(ws);
          }
          
          resolve();
        };

        ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        ws.onclose = (event) => {
          this.connection = null;
          this.connectionStatus.connected = false;
          
          if (event.code !== 1000) { // Not normal closure
            this.handleConnectionError(new Error(`WebSocket closed with code ${event.code}: ${event.reason}`));
            this.reconnect();
          }
        };

        ws.onerror = (error) => {
          reject(new Error('WebSocket connection failed'));
        };

        // Connection timeout
        setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private buildWebSocketUrl(): string {
    const url = new URL(this.config.endpoint);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Add authentication to query string if using API key
    if (this.config.authentication?.type === 'api-key') {
      url.searchParams.set('api_key', this.config.authentication.token);
    }
    
    return url.toString();
  }

  private sendAuthentication(ws: WebSocket): void {
    if (!this.config.authentication) return;

    const authMessage = {
      type: 'auth',
      [this.config.authentication.type]: this.config.authentication.token,
      timestamp: Date.now()
    };

    ws.send(JSON.stringify(authMessage));
  }

  // ============================================================================
  // Server-Sent Events Implementation
  // ============================================================================

  private async connectSSE(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const sseUrl = this.buildSSEUrl();
        const eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
          this.connection = eventSource;
          this.connectionStatus.connectionType = 'sse';
          resolve();
        };

        eventSource.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        eventSource.onerror = (error) => {
          this.connection = null;
          this.connectionStatus.connected = false;
          
          if (eventSource.readyState === EventSource.CLOSED) {
            this.handleConnectionError(new Error('SSE connection closed'));
            this.reconnect();
          } else {
            reject(new Error('SSE connection failed'));
          }
        };

        // Connection timeout
        setTimeout(() => {
          if (eventSource.readyState === EventSource.CONNECTING) {
            eventSource.close();
            reject(new Error('SSE connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private buildSSEUrl(): string {
    const url = new URL(this.config.endpoint.replace(/^ws/, 'http'));
    url.pathname += '/events';
    
    // Add authentication to query string
    if (this.config.authentication) {
      if (this.config.authentication.type === 'api-key') {
        url.searchParams.set('api_key', this.config.authentication.token);
      } else if (this.config.authentication.type === 'bearer') {
        url.searchParams.set('token', this.config.authentication.token);
      }
    }
    
    return url.toString();
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private handleMessage(data: string | ArrayBuffer): void {
    try {
      let message: any;
      
      if (data instanceof ArrayBuffer) {
        // Handle compressed binary data
        const decoder = new TextDecoder();
        message = JSON.parse(decoder.decode(data));
      } else {
        message = JSON.parse(data);
      }

      // Handle heartbeat/ping messages
      if (message.type === 'ping') {
        this.handlePing(message);
        return;
      }

      // Handle authentication response
      if (message.type === 'auth_response') {
        this.handleAuthResponse(message);
        return;
      }

      // Handle analytics events
      if (this.isValidAnalyticsEvent(message)) {
        this.handleAnalyticsEvent(message);
      }

    } catch (error) {
      this.handleError({
        code: 'MESSAGE_PARSE_ERROR',
        message: `Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'medium'
      });
    }
  }

  private handlePing(message: any): void {
    this.lastHeartbeat = Date.now();
    
    // Send pong response for WebSocket
    if (this.connection instanceof WebSocket) {
      this.connection.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
    }
    
    // Update latency calculation
    if (message.timestamp) {
      this.connectionStatus.latency = Date.now() - message.timestamp;
    }
  }

  private handleAuthResponse(message: any): void {
    if (!message.success) {
      this.handleError({
        code: 'AUTH_FAILED',
        message: message.error || 'Authentication failed',
        timestamp: Date.now(),
        severity: 'high'
      });
      this.disconnect();
    }
  }

  private isValidAnalyticsEvent(message: any): boolean {
    return message && 
           typeof message.type === 'string' &&
           typeof message.timestamp === 'number' &&
           message.data !== undefined &&
           typeof message.sessionId === 'string' &&
           typeof message.questionnaireId === 'string';
  }

  private handleAnalyticsEvent(event: RealtimeEvent): void {
    // Add to buffer
    this.addToBuffer(event);
    
    // Emit to listeners
    this.emit(event.type, event);
    
    // Auto-flush if buffer is full
    if (this.buffer.events.length >= this.buffer.maxSize) {
      this.flushBuffer();
    }
  }

  // ============================================================================
  // Event Buffering
  // ============================================================================

  /**
   * Add event to the buffer
   */
  addToBuffer(event: RealtimeEvent): void {
    this.buffer.events.push(event);
    
    // Remove oldest events if buffer is full
    if (this.buffer.events.length > this.buffer.maxSize) {
      this.buffer.events = this.buffer.events.slice(-this.buffer.maxSize);
    }
  }

  /**
   * Flush the buffer to persistent storage or external service
   */
  async flushBuffer(): Promise<void> {
    if (this.buffer.events.length === 0) {
      return;
    }

    const eventsToFlush = [...this.buffer.events];
    this.buffer.events = [];
    this.buffer.lastFlush = Date.now();

    try {
      // Send to analytics service or save to IndexedDB
      await this.persistEvents(eventsToFlush);
    } catch (error) {
      // Put events back in buffer if flush failed
      this.buffer.events = [...eventsToFlush, ...this.buffer.events];
      
      this.handleError({
        code: 'BUFFER_FLUSH_ERROR',
        message: `Failed to flush buffer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'medium'
      });
    }
  }

  private async persistEvents(events: RealtimeEvent[]): Promise<void> {
    // Implementation would depend on your backend/storage system
    // This could send to a REST API, save to IndexedDB, etc.
    
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      await this.saveToIndexedDB(events);
    } else {
      await this.sendToAPI(events);
    }
  }

  private async saveToIndexedDB(events: RealtimeEvent[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('QDesignerAnalytics', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['events'], 'readwrite');
        const store = transaction.objectStore('events');
        
        events.forEach(event => {
          store.add({
            ...event,
            id: `${event.timestamp}-${Math.random().toString(36).substr(2, 9)}`
          });
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('events')) {
          const store = db.createObjectStore('events', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('type', 'type');
          store.createIndex('sessionId', 'sessionId');
        }
      };
    });
  }

  private async sendToAPI(events: RealtimeEvent[]): Promise<void> {
    const response = await fetch('/api/analytics/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.authentication?.type === 'bearer' && {
          'Authorization': `Bearer ${this.config.authentication.token}`
        })
      },
      body: JSON.stringify({ events })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  // ============================================================================
  // Event Publishing
  // ============================================================================

  /**
   * Send an analytics event
   */
  sendEvent(type: RealtimeEventType, data: any, sessionId: string, questionnaireId: string): void {
    const event: RealtimeEvent = {
      type,
      timestamp: Date.now(),
      data,
      sessionId,
      questionnaireId
    };

    // Add to buffer immediately
    this.addToBuffer(event);

    // Send via connection if available
    if (this.connection && this.connectionStatus.connected) {
      try {
        if (this.connection instanceof WebSocket) {
          this.connection.send(JSON.stringify(event));
        }
        // SSE is read-only, so we only buffer for SSE connections
      } catch (error) {
        this.handleError({
          code: 'SEND_EVENT_ERROR',
          message: `Failed to send event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
          severity: 'low'
        });
      }
    }
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  /**
   * Add event listener
   */
  on(eventType: RealtimeEventType | 'connection' | 'error', callback: Function): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(eventType: RealtimeEventType | 'connection' | 'error', callback: Function): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(eventType: RealtimeEventType | 'connection' | 'error', data: any): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }
  }

  // ============================================================================
  // Heartbeat Management
  // ============================================================================

  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
      
      if (timeSinceLastHeartbeat > 30000) { // 30 seconds without heartbeat
        this.handleConnectionError(new Error('Heartbeat timeout'));
        this.reconnect();
      }
    }, 10000); // Check every 10 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private supportsWebSocket(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  private supportsSSE(): boolean {
    return typeof EventSource !== 'undefined';
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private handleConnectionError(error: Error): void {
    this.connectionStatus.errors.push(error.message);
    
    // Keep only last 10 errors
    if (this.connectionStatus.errors.length > 10) {
      this.connectionStatus.errors = this.connectionStatus.errors.slice(-10);
    }

    this.handleError({
      code: 'CONNECTION_ERROR',
      message: error.message,
      timestamp: Date.now(),
      severity: 'high',
      stack: error.stack
    });
  }

  private handleError(error: AnalyticsError): void {
    console.error('RealtimeAnalytics Error:', error);
    this.emit('error', error);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Get buffer status
   */
  getBufferStatus() {
    return {
      eventCount: this.buffer.events.length,
      maxSize: this.buffer.maxSize,
      lastFlush: this.buffer.lastFlush,
      timeSinceLastFlush: Date.now() - this.buffer.lastFlush
    };
  }

  /**
   * Force buffer flush
   */
  forceFlush(): Promise<void> {
    return this.flushBuffer();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RealtimeConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reconnect if endpoint changed
    if (newConfig.endpoint && this.connectionStatus.connected) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      connectionStatus: this.connectionStatus,
      bufferStatus: this.getBufferStatus(),
      uptime: this.connectionStatus.lastConnected ? Date.now() - this.connectionStatus.lastConnected : 0,
      eventListenerCount: Array.from(this.eventListeners.values()).reduce((sum, listeners) => sum + listeners.length, 0)
    };
  }
}