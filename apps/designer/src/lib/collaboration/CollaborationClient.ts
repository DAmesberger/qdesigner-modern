// Browser-compatible EventEmitter implementation
interface EventListener {
  event: string;
  callback: (...args: any[]) => void;
}
import type { 
  CollaborationEvent, 
  CollaborationUser, 
  CollaborationState,
  OperationalTransform,
  DocumentVersion
} from './types';

export interface CollaborationConfig {
  url: string;
  questionnaireId: string;
  userId: string;
  userName: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  debug?: boolean;
}

export class CollaborationClient {
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();
  private ws: WebSocket | null = null;
  private config: Required<CollaborationConfig>;
  private state: CollaborationState;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private messageQueue: CollaborationEvent[] = [];
  private isConnecting = false;
  private reconnectAttempt = 0;
  
  constructor(config: CollaborationConfig) {
    
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 2000,
      heartbeatInterval: 30000,
      debug: false,
      ...config
    };
    
    this.state = {
      users: new Map(),
      documentVersion: 0,
      isConnected: false,
      isSynced: true,
      pendingOperations: []
    };
  }
  
  // Connect to collaboration server
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }
    
    this.isConnecting = true;
    this.log('Connecting to collaboration server...');
    
    try {
      this.ws = new WebSocket(this.config.url);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      this.log('Connection error:', error);
      this.handleError(error as Event);
    }
  }
  
  // Disconnect from server
  disconnect(): void {
    this.log('Disconnecting from collaboration server');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.state.isConnected = false;
    this.emit('disconnected');
  }
  
  // Send operation to server
  sendOperation(operation: OperationalTransform): void {
    const event: CollaborationEvent = {
      type: 'operation',
      userId: this.config.userId,
      timestamp: Date.now(),
      data: {
        operation,
        version: this.state.documentVersion
      }
    };
    
    if (this.state.isConnected) {
      this.send(event);
    } else {
      // Queue operation if not connected
      this.state.pendingOperations.push(operation);
      this.state.isSynced = false;
    }
  }
  
  // Update user cursor position
  updateCursor(position: { line: number; column: number } | null): void {
    const event: CollaborationEvent = {
      type: 'cursor',
      userId: this.config.userId,
      timestamp: Date.now(),
      data: { position }
    };
    
    this.send(event);
  }
  
  // Update user selection
  updateSelection(selection: { start: number; end: number } | null): void {
    const event: CollaborationEvent = {
      type: 'selection',
      userId: this.config.userId,
      timestamp: Date.now(),
      data: { selection }
    };
    
    this.send(event);
  }
  
  // Add comment
  addComment(comment: {
    id: string;
    text: string;
    position: { line: number; column: number };
    parentId?: string;
  }): void {
    const event: CollaborationEvent = {
      type: 'comment',
      userId: this.config.userId,
      timestamp: Date.now(),
      data: { action: 'add', comment }
    };
    
    this.send(event);
  }
  
  // Remove comment
  removeComment(commentId: string): void {
    const event: CollaborationEvent = {
      type: 'comment',
      userId: this.config.userId,
      timestamp: Date.now(),
      data: { action: 'remove', commentId }
    };
    
    this.send(event);
  }
  
  // Get current state
  getState(): CollaborationState {
    return { ...this.state };
  }
  
  // Get active users
  getActiveUsers(): CollaborationUser[] {
    return Array.from(this.state.users.values());
  }
  
  // Private methods
  private handleOpen(): void {
    this.log('Connected to collaboration server');
    this.isConnecting = false;
    this.reconnectAttempt = 0;
    this.state.isConnected = true;
    
    // Send join event
    const joinEvent: CollaborationEvent = {
      type: 'join',
      userId: this.config.userId,
      timestamp: Date.now(),
      data: {
        questionnaireId: this.config.questionnaireId,
        userName: this.config.userName
      }
    };
    
    this.send(joinEvent);
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Send queued operations
    this.flushPendingOperations();
    
    this.emit('connected');
  }
  
  private handleMessage(event: MessageEvent): void {
    try {
      const message: CollaborationEvent = JSON.parse(event.data);
      this.log('Received message:', message.type);
      
      switch (message.type) {
        case 'sync':
          this.handleSync(message);
          break;
          
        case 'operation':
          this.handleOperation(message);
          break;
          
        case 'cursor':
          this.handleCursor(message);
          break;
          
        case 'selection':
          this.handleSelection(message);
          break;
          
        case 'comment':
          this.handleComment(message);
          break;
          
        case 'join':
          this.handleUserJoin(message);
          break;
          
        case 'leave':
          this.handleUserLeave(message);
          break;
          
        case 'presence':
          this.handlePresence(message);
          break;
          
        case 'error':
          this.handleServerError(message);
          break;
          
        default:
          this.log('Unknown message type:', message.type);
      }
      
      this.emit('message', message);
    } catch (error) {
      this.log('Failed to parse message:', error);
    }
  }
  
  private handleError(error: Event): void {
    this.log('WebSocket error:', error);
    this.isConnecting = false;
    this.emit('error', error);
  }
  
  private handleClose(event: CloseEvent): void {
    this.log('Connection closed:', event.code, event.reason);
    this.isConnecting = false;
    this.state.isConnected = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Attempt reconnect if not manually closed
    if (event.code !== 1000 && this.reconnectAttempt < this.config.reconnectAttempts) {
      this.scheduleReconnect();
    }
    
    this.emit('disconnected', event);
  }
  
  private handleSync(event: CollaborationEvent): void {
    const { users, version, operations } = event.data;
    
    // Update users
    this.state.users.clear();
    users.forEach((user: CollaborationUser) => {
      this.state.users.set(user.id, user);
    });
    
    // Update document version
    this.state.documentVersion = version;
    
    // Apply any operations we missed
    if (operations && operations.length > 0) {
      operations.forEach((op: OperationalTransform) => {
        this.emit('operation', op);
      });
    }
    
    this.state.isSynced = true;
    this.emit('sync', this.state);
  }
  
  private handleOperation(event: CollaborationEvent): void {
    const { operation, version } = event.data;
    
    // Skip our own operations
    if (event.userId === this.config.userId) {
      return;
    }
    
    // Check version compatibility
    if (version !== this.state.documentVersion) {
      this.log('Version mismatch, requesting sync');
      this.requestSync();
      return;
    }
    
    // Apply operation
    this.state.documentVersion++;
    this.emit('operation', operation, event.userId);
  }
  
  private handleCursor(event: CollaborationEvent): void {
    const user = this.state.users.get(event.userId);
    if (user) {
      user.cursor = event.data.position;
      this.emit('cursor', event.userId, event.data.position);
    }
  }
  
  private handleSelection(event: CollaborationEvent): void {
    const user = this.state.users.get(event.userId);
    if (user) {
      user.selection = event.data.selection;
      this.emit('selection', event.userId, event.data.selection);
    }
  }
  
  private handleComment(event: CollaborationEvent): void {
    const { action, comment, commentId } = event.data;
    
    if (action === 'add') {
      this.emit('comment:add', comment, event.userId);
    } else if (action === 'remove') {
      this.emit('comment:remove', commentId, event.userId);
    }
  }
  
  private handleUserJoin(event: CollaborationEvent): void {
    const user: CollaborationUser = {
      id: event.userId,
      name: event.data.userName,
      color: event.data.color || this.generateUserColor(event.userId),
      cursor: null,
      selection: null,
      isActive: true,
      lastSeen: event.timestamp
    };
    
    this.state.users.set(user.id, user);
    this.emit('user:join', user);
  }
  
  private handleUserLeave(event: CollaborationEvent): void {
    const user = this.state.users.get(event.userId);
    if (user) {
      this.state.users.delete(event.userId);
      this.emit('user:leave', user);
    }
  }
  
  private handlePresence(event: CollaborationEvent): void {
    const users = event.data.users;
    
    // Update user presence
    users.forEach((userData: any) => {
      const user = this.state.users.get(userData.id);
      if (user) {
        user.isActive = userData.isActive;
        user.lastSeen = userData.lastSeen;
      }
    });
    
    this.emit('presence', this.state.users);
  }
  
  private handleServerError(event: CollaborationEvent): void {
    this.log('Server error:', event.data);
    this.emit('error', new Error(event.data.message));
  }
  
  private send(event: CollaborationEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      this.messageQueue.push(event);
    }
  }
  
  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      const heartbeat: CollaborationEvent = {
        type: 'heartbeat',
        userId: this.config.userId,
        timestamp: Date.now(),
        data: {}
      };
      
      this.send(heartbeat);
    }, this.config.heartbeatInterval);
  }
  
  private scheduleReconnect(): void {
    this.reconnectAttempt++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempt - 1);
    
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  private requestSync(): void {
    const syncRequest: CollaborationEvent = {
      type: 'sync-request',
      userId: this.config.userId,
      timestamp: Date.now(),
      data: {
        version: this.state.documentVersion
      }
    };
    
    this.send(syncRequest);
  }
  
  private flushPendingOperations(): void {
    if (this.state.pendingOperations.length === 0) return;
    
    this.log(`Flushing ${this.state.pendingOperations.length} pending operations`);
    
    this.state.pendingOperations.forEach(operation => {
      this.sendOperation(operation);
    });
    
    this.state.pendingOperations = [];
  }
  
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;
    
    this.log(`Flushing ${this.messageQueue.length} queued messages`);
    
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    queue.forEach(event => this.send(event));
  }
  
  private generateUserColor(userId: string): string {
    // Generate consistent color based on user ID
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#48DBFB', '#0ABDE3', '#00D2D3'
    ];
    
    const hash = userId.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
  }
  
  // EventEmitter implementation
  protected emit(event: string, ...args: any[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }
  
  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }
  
  off(event: string, callback: (...args: any[]) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  once(event: string, callback: (...args: any[]) => void): void {
    const onceWrapper = (...args: any[]) => {
      callback(...args);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[CollaborationClient]', ...args);
    }
  }
}