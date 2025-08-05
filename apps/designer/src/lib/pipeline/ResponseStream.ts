import type { ResponseData, StreamConfig } from './types';
import { getDataPipeline } from './DataPipeline';

export interface StreamEvent {
  type: 'data' | 'error' | 'complete' | 'progress';
  data?: ResponseData;
  error?: Error;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  timestamp: number;
}

export type StreamListener = (event: StreamEvent) => void;

export class ResponseStream {
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private listeners: Set<StreamListener> = new Set();
  private config: StreamConfig;
  private reconnectTimer: number | null = null;
  private reconnectAttempt: number = 0;
  private isConnected: boolean = false;
  private responseQueue: ResponseData[] = [];
  private pipeline = getDataPipeline();
  
  constructor(config: Partial<StreamConfig> = {}) {
    this.config = {
      bufferSize: 1000,
      backpressureThreshold: 0.8,
      timeout: 30000,
      reconnectAttempts: 5,
      reconnectDelay: 2000,
      ...config
    };
  }
  
  // Connect to WebSocket stream
  connectWebSocket(url: string): void {
    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempt = 0;
        this.emit({
          type: 'progress',
          progress: { current: 0, total: 0, percentage: 0 },
          timestamp: Date.now()
        });
      };
      
      this.ws.onmessage = (event) => {
        try {
          const response: ResponseData = JSON.parse(event.data);
          this.handleResponse(response);
        } catch (error) {
          this.emit({
            type: 'error',
            error: new Error(`Failed to parse response: ${error}`),
            timestamp: Date.now()
          });
        }
      };
      
      this.ws.onerror = (error) => {
        this.emit({
          type: 'error',
          error: new Error('WebSocket error'),
          timestamp: Date.now()
        });
      };
      
      this.ws.onclose = () => {
        this.isConnected = false;
        this.attemptReconnect();
      };
      
    } catch (error) {
      this.emit({
        type: 'error',
        error: error as Error,
        timestamp: Date.now()
      });
    }
  }
  
  // Connect to Server-Sent Events stream
  connectSSE(url: string): void {
    try {
      this.eventSource = new EventSource(url);
      
      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempt = 0;
      };
      
      this.eventSource.onmessage = (event) => {
        try {
          const response: ResponseData = JSON.parse(event.data);
          this.handleResponse(response);
        } catch (error) {
          this.emit({
            type: 'error',
            error: new Error(`Failed to parse SSE data: ${error}`),
            timestamp: Date.now()
          });
        }
      };
      
      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.eventSource?.close();
        this.attemptReconnect();
      };
      
    } catch (error) {
      this.emit({
        type: 'error',
        error: error as Error,
        timestamp: Date.now()
      });
    }
  }
  
  // Process incoming response
  private async handleResponse(response: ResponseData): Promise<void> {
    // Check buffer capacity
    if (this.responseQueue.length >= this.config.bufferSize) {
      const threshold = this.config.bufferSize * this.config.backpressureThreshold;
      
      if (this.responseQueue.length >= threshold) {
        // Apply backpressure
        this.emit({
          type: 'error',
          error: new Error('Buffer overflow - applying backpressure'),
          timestamp: Date.now()
        });
        
        // Drop oldest responses
        this.responseQueue = this.responseQueue.slice(-Math.floor(threshold));
      }
    }
    
    // Add to queue
    this.responseQueue.push(response);
    
    // Emit data event
    this.emit({
      type: 'data',
      data: response,
      timestamp: Date.now()
    });
    
    // Send to pipeline
    try {
      await this.pipeline.addToBatch(response);
    } catch (error) {
      this.emit({
        type: 'error',
        error: error as Error,
        timestamp: Date.now()
      });
    }
  }
  
  // Subscribe to stream events
  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  // Emit event to all listeners
  private emit(event: StreamEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Stream listener error:', error);
      }
    });
  }
  
  // Attempt to reconnect
  private attemptReconnect(): void {
    if (this.reconnectAttempt >= this.config.reconnectAttempts) {
      this.emit({
        type: 'error',
        error: new Error('Max reconnection attempts reached'),
        timestamp: Date.now()
      });
      return;
    }
    
    this.reconnectAttempt++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempt - 1);
    
    this.reconnectTimer = window.setTimeout(() => {
      if (this.ws) {
        const url = this.ws.url;
        this.connectWebSocket(url);
      } else if (this.eventSource) {
        const url = this.eventSource.url;
        this.connectSSE(url);
      }
    }, delay);
  }
  
  // Send response upstream (for bidirectional streams)
  send(response: ResponseData): void {
    if (!this.isConnected || !this.ws) {
      throw new Error('Stream not connected or not a WebSocket connection');
    }
    
    this.ws.send(JSON.stringify(response));
  }
  
  // Get buffered responses
  getBuffer(): ResponseData[] {
    return [...this.responseQueue];
  }
  
  // Clear buffer
  clearBuffer(): void {
    this.responseQueue = [];
  }
  
  // Get stream statistics
  getStats(): {
    connected: boolean;
    bufferSize: number;
    bufferUsage: number;
    reconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      bufferSize: this.config.bufferSize,
      bufferUsage: this.responseQueue.length / this.config.bufferSize,
      reconnectAttempts: this.reconnectAttempt
    };
  }
  
  // Disconnect stream
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.isConnected = false;
    this.clearBuffer();
    
    this.emit({
      type: 'complete',
      timestamp: Date.now()
    });
  }
}

// Create a managed stream pool
export class StreamPool {
  private streams: Map<string, ResponseStream> = new Map();
  
  createStream(id: string, config?: Partial<StreamConfig>): ResponseStream {
    if (this.streams.has(id)) {
      throw new Error(`Stream ${id} already exists`);
    }
    
    const stream = new ResponseStream(config);
    this.streams.set(id, stream);
    
    return stream;
  }
  
  getStream(id: string): ResponseStream | undefined {
    return this.streams.get(id);
  }
  
  removeStream(id: string): boolean {
    const stream = this.streams.get(id);
    if (stream) {
      stream.disconnect();
      return this.streams.delete(id);
    }
    return false;
  }
  
  disconnectAll(): void {
    this.streams.forEach(stream => stream.disconnect());
    this.streams.clear();
  }
  
  getActiveStreams(): string[] {
    return Array.from(this.streams.keys());
  }
}

// Singleton stream pool
let streamPool: StreamPool | null = null;

export function getStreamPool(): StreamPool {
  if (!streamPool) {
    streamPool = new StreamPool();
  }
  return streamPool;
}