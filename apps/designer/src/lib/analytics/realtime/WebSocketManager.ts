import type { StatUpdate, RealtimeConfig } from '../types';

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'update' | 'error' | 'ping' | 'pong';
  channel?: string;
  data?: any;
  timestamp?: number;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private listeners: Map<string, Set<(update: StatUpdate) => void>> = new Map();
  private subscriptions: Map<string, RealtimeConfig> = new Map();
  private pingInterval: number | null = null;
  private connectionPromise: Promise<void> | null = null;
  
  constructor(url: string) {
    this.url = url;
  }
  
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          console.log('[WebSocket] Connected to analytics server');
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.startPingInterval();
          this.resubscribeAll();
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
          }
        };
        
        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          reject(error);
        };
        
        this.ws.onclose = () => {
          console.log('[WebSocket] Connection closed');
          this.cleanup();
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
    
    return this.connectionPromise;
  }
  
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.cleanup();
    }
  }
  
  private cleanup(): void {
    this.connectionPromise = null;
    this.stopPingInterval();
    this.ws = null;
  }
  
  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'update':
        this.handleUpdate(message);
        break;
        
      case 'error':
        console.error('[WebSocket] Server error:', message.data);
        break;
        
      case 'pong':
        // Server is alive
        break;
        
      default:
        console.warn('[WebSocket] Unknown message type:', message.type);
    }
  }
  
  private handleUpdate(message: WebSocketMessage): void {
    if (!message.channel || !message.data) return;
    
    const listeners = this.listeners.get(message.channel);
    if (listeners) {
      const update: StatUpdate = {
        ...message.data,
        timestamp: message.timestamp || Date.now()
      };
      
      listeners.forEach(listener => {
        try {
          listener(update);
        } catch (error) {
          console.error('[WebSocket] Listener error:', error);
        }
      });
    }
  }
  
  subscribe(
    channel: string, 
    config: RealtimeConfig,
    listener: (update: StatUpdate) => void
  ): () => void {
    // Add listener
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(listener);
    
    // Store subscription config
    this.subscriptions.set(channel, config);
    
    // Send subscription message
    if (this.isConnected()) {
      this.send({
        type: 'subscribe',
        channel,
        data: config
      });
    }
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(channel);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(channel);
          this.subscriptions.delete(channel);
          
          if (this.isConnected()) {
            this.send({
              type: 'unsubscribe',
              channel
            });
          }
        }
      }
    };
  }
  
  private send(message: WebSocketMessage): void {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify({
        ...message,
        timestamp: Date.now()
      }));
    }
  }
  
  private isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
  
  private startPingInterval(): void {
    this.pingInterval = window.setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' });
      }
    }, 30000); // Ping every 30 seconds
  }
  
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay);
  }
  
  private resubscribeAll(): void {
    this.subscriptions.forEach((config, channel) => {
      this.send({
        type: 'subscribe',
        channel,
        data: config
      });
    });
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function getWebSocketManager(url?: string): WebSocketManager {
  if (!wsManager && url) {
    wsManager = new WebSocketManager(url);
  }
  
  if (!wsManager) {
    throw new Error('WebSocket manager not initialized');
  }
  
  return wsManager;
}

export function initializeWebSocket(url: string): Promise<void> {
  const manager = getWebSocketManager(url);
  return manager.connect();
}