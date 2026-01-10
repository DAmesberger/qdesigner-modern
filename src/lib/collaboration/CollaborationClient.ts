/**
 * CollaborationClient - Browser-compatible WebSocket client for real-time collaboration
 */

import type {
  CollaborationMessage,
  CollaborationSession,
  CollaborationUser,
  Operation,
  Comment,
  PresenceInfo,
  CursorPosition,
  Selection,
  ConnectionStatus,
  CollaborationConfig,
  CollaborationEvents
} from './types.js';

// Browser-compatible EventTarget for event handling
class CollaborationEventEmitter extends EventTarget {
  emit<K extends keyof CollaborationEvents>(
    event: K,
    data: CollaborationEvents[K]
  ): void {
    this.dispatchEvent(new CustomEvent(event, { detail: data }));
  }

  on<K extends keyof CollaborationEvents>(
    event: K,
    callback: (data: CollaborationEvents[K]) => void
  ): void {
    this.addEventListener(event, ((e: CustomEvent) => callback(e.detail)) as EventListener);
  }

  off<K extends keyof CollaborationEvents>(
    event: K,
    callback: (data: CollaborationEvents[K]) => void
  ): void {
    this.removeEventListener(event, callback as unknown as EventListener);
  }
}

export class CollaborationClient extends CollaborationEventEmitter {
  private ws: WebSocket | null = null;
  private config: CollaborationConfig;
  private connectionStatus: ConnectionStatus;
  private messageQueue: CollaborationMessage[] = [];
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private operationBuffer: Operation[] = [];
  private lastHeartbeat: Date | null = null;
  private messageIdCounter = 0;
  private pendingAcks = new Map<string, { resolve: Function; reject: Function; timeout: number }>();
  
  public currentSession: CollaborationSession | null = null;
  public currentUser: CollaborationUser | null = null;

  constructor(config: Partial<CollaborationConfig> = {}) {
    super();
    
    this.config = {
      websocketUrl: config.websocketUrl || 'ws://localhost:8080/collaboration',
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 1000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      operationBufferSize: config.operationBufferSize || 100,
      maxVersionHistory: config.maxVersionHistory || 50,
      enableComments: config.enableComments ?? true,
      enablePresence: config.enablePresence ?? true,
      enableVersionControl: config.enableVersionControl ?? true,
      autoSaveInterval: config.autoSaveInterval || 5000,
      conflictResolution: config.conflictResolution || 'hybrid',
      ...config
    };

    this.connectionStatus = {
      status: 'disconnected',
      reconnectAttempts: 0
    };
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.updateConnectionStatus({ status: 'connecting' });

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.websocketUrl);
        
        this.ws.onopen = () => {
          this.updateConnectionStatus({
            status: 'connected',
            lastConnected: new Date(),
            reconnectAttempts: 0,
            error: undefined
          });
          
          this.startHeartbeat();
          this.processMessageQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = (event) => {
          this.handleDisconnection(event.code, event.reason);
        };

        this.ws.onerror = (error) => {
          this.updateConnectionStatus({
            status: 'error',
            error: 'WebSocket connection error'
          });
          reject(new Error('WebSocket connection failed'));
        };

        // Connection timeout
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        this.updateConnectionStatus({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown connection error'
        });
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.clearReconnectTimer();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }

    this.updateConnectionStatus({
      status: 'disconnected',
      lastDisconnected: new Date()
    });
  }

  private handleDisconnection(code: number, reason: string): void {
    this.stopHeartbeat();
    this.updateConnectionStatus({
      status: 'disconnected',
      lastDisconnected: new Date(),
      error: reason || `Connection closed with code ${code}`
    });

    // Auto-reconnect for unexpected disconnections
    if (code !== 1000 && this.connectionStatus.reconnectAttempts < this.config.reconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.updateConnectionStatus({ status: 'reconnecting' });

    const delay = this.config.reconnectDelay * Math.pow(2, this.connectionStatus.reconnectAttempts);
    
    this.reconnectTimer = window.setTimeout(async () => {
      this.connectionStatus.reconnectAttempts++;
      
      try {
        await this.connect();
        
        // Rejoin session if we were in one
        if (this.currentSession && this.currentUser) {
          await this.joinSession(this.currentSession.questionnaireId, this.currentUser);
        }
      } catch (error) {
        if (this.connectionStatus.reconnectAttempts >= this.config.reconnectAttempts) {
          this.updateConnectionStatus({
            status: 'error',
            error: 'Failed to reconnect after maximum attempts'
          });
        }
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ============================================================================
  // Heartbeat Management
  // ============================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const heartbeatTime = new Date();
      this.sendMessage({
        id: this.generateMessageId(),
        type: 'heartbeat',
        userId: this.currentUser?.id || '',
        sessionId: this.currentSession?.id || '',
        timestamp: heartbeatTime
      });
      this.lastHeartbeat = heartbeatTime;
    }
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private handleMessage(data: string): void {
    try {
      const message: CollaborationMessage = JSON.parse(data);
      
      // Handle acknowledgments
      if (message.type === 'ack') {
        this.handleAcknowledgment(message as any);
        return;
      }

      // Handle heartbeat responses
      if (message.type === 'heartbeat_response') {
        this.handleHeartbeatResponse(message);
        return;
      }

      // Process different message types
      switch (message.type) {
        case 'operation':
          this.emit('operation:received', { 
            operation: (message as any).operation, 
            transformed: false 
          });
          break;
          
        case 'cursor_update':
          this.emit('cursor:updated', {
            userId: message.userId,
            position: (message as any).position
          });
          break;
          
        case 'selection_update':
          this.emit('selection:updated', {
            userId: message.userId,
            selection: (message as any).selection
          });
          break;
          
        case 'comment':
          const commentMessage = message as any;
          switch (commentMessage.action) {
            case 'create':
              this.emit('comment:created', { comment: commentMessage.comment });
              break;
            case 'update':
              this.emit('comment:updated', { comment: commentMessage.comment });
              break;
            case 'delete':
              this.emit('comment:deleted', { commentId: commentMessage.comment.id });
              break;
            case 'resolve':
              this.emit('comment:resolved', { comment: commentMessage.comment });
              break;
          }
          break;
          
        case 'presence_update':
          this.emit('presence:updated', {
            userId: message.userId,
            presence: (message as any).presence
          });
          break;
          
        case 'error':
          this.emit('error', {
            error: (message as any).error,
            code: (message as any).code
          });
          break;
      }
    } catch (error) {
      console.error('Failed to parse collaboration message:', error);
      this.emit('error', { error: 'Invalid message format' });
    }
  }

  private handleAcknowledgment(ack: any): void {
    const pending = this.pendingAcks.get(ack.messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(ack.messageId);
      
      if (ack.success) {
        pending.resolve();
      } else {
        pending.reject(new Error(ack.error || 'Operation failed'));
      }
    }
  }

  private handleHeartbeatResponse(message: any): void {
    if (this.lastHeartbeat) {
      const latency = Date.now() - this.lastHeartbeat.getTime();
      this.updateConnectionStatus({ latency });
    }
  }

  private sendMessage(message: CollaborationMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(message));
          
          // Set up acknowledgment tracking
          const timeout = window.setTimeout(() => {
            this.pendingAcks.delete(message.id);
            reject(new Error('Message acknowledgment timeout'));
          }, 5000);
          
          this.pendingAcks.set(message.id, { resolve, reject, timeout });
        } catch (error) {
          reject(error);
        }
      } else {
        // Queue message for later delivery
        this.messageQueue.push(message);
        reject(new Error('Not connected'));
      }
    });
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message).catch(console.error);
      }
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }

  private updateConnectionStatus(updates: Partial<ConnectionStatus>): void {
    this.connectionStatus = { ...this.connectionStatus, ...updates };
    this.emit('connection:status', { status: this.connectionStatus });
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  async joinSession(questionnaireId: string, user: CollaborationUser): Promise<CollaborationSession> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to collaboration server');
    }

    this.currentUser = user;

    const message = {
      id: this.generateMessageId(),
      type: 'join_session' as const,
      userId: user.id,
      sessionId: questionnaireId, // Use questionnaire ID as session ID for simplicity
      timestamp: new Date(),
      user
    };

    await this.sendMessage(message);

    // Create mock session for now
    this.currentSession = {
      id: questionnaireId,
      questionnaireId,
      organizationId: '', // Would be filled by server
      projectId: '', // Would be filled by server
      participants: [user],
      startedAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    };

    this.emit('session:joined', { session: this.currentSession, user });
    return this.currentSession;
  }

  async leaveSession(): Promise<void> {
    if (!this.currentSession || !this.currentUser) {
      return;
    }

    const message = {
      id: this.generateMessageId(),
      type: 'leave_session' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date()
    };

    await this.sendMessage(message);

    this.emit('session:left', { 
      sessionId: this.currentSession.id, 
      userId: this.currentUser.id 
    });

    this.currentSession = null;
  }

  // ============================================================================
  // Operation Handling
  // ============================================================================

  async sendOperation(operation: Operation): Promise<void> {
    if (!this.currentSession || !this.currentUser) {
      throw new Error('No active collaboration session');
    }

    // Buffer operation locally
    this.operationBuffer.push(operation);
    if (this.operationBuffer.length > this.config.operationBufferSize) {
      this.operationBuffer.shift();
    }

    const message = {
      id: this.generateMessageId(),
      type: 'operation' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      operation,
      parentVersion: 0 // Would be managed by version control system
    };

    await this.sendMessage(message);
    this.emit('operation:applied', { operation, success: true });
  }

  // ============================================================================
  // Presence System
  // ============================================================================

  async updateCursor(position: CursorPosition): Promise<void> {
    if (!this.config.enablePresence || !this.currentSession || !this.currentUser) {
      return;
    }

    const message = {
      id: this.generateMessageId(),
      type: 'cursor_update' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      position
    };

    // Send without waiting for acknowledgment for performance
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async updateSelection(selection: Selection): Promise<void> {
    if (!this.config.enablePresence || !this.currentSession || !this.currentUser) {
      return;
    }

    const message = {
      id: this.generateMessageId(),
      type: 'selection_update' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      selection
    };

    // Send without waiting for acknowledgment for performance
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async updatePresence(presence: PresenceInfo): Promise<void> {
    if (!this.config.enablePresence || !this.currentSession || !this.currentUser) {
      return;
    }

    const message = {
      id: this.generateMessageId(),
      type: 'presence_update' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      presence
    };

    // Send without waiting for acknowledgment for performance
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // ============================================================================
  // Comment System
  // ============================================================================

  async createComment(comment: Omit<Comment, 'id' | 'author' | 'createdAt'>): Promise<void> {
    if (!this.config.enableComments || !this.currentSession || !this.currentUser) {
      throw new Error('Comments not enabled or no active session');
    }

    const fullComment: Comment = {
      ...comment,
      id: this.generateMessageId(),
      author: this.currentUser,
      createdAt: new Date(),
      questionnaireId: this.currentSession.questionnaireId,
      sessionId: this.currentSession.id
    };

    const message = {
      id: this.generateMessageId(),
      type: 'comment' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      action: 'create' as const,
      comment: fullComment
    };

    await this.sendMessage(message);
  }

  async updateComment(commentId: string, content: string): Promise<void> {
    if (!this.config.enableComments || !this.currentSession || !this.currentUser) {
      throw new Error('Comments not enabled or no active session');
    }

    const message = {
      id: this.generateMessageId(),
      type: 'comment' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      action: 'update' as const,
      comment: { id: commentId, content, updatedAt: new Date() }
    };

    await this.sendMessage(message);
  }

  async deleteComment(commentId: string): Promise<void> {
    if (!this.config.enableComments || !this.currentSession || !this.currentUser) {
      throw new Error('Comments not enabled or no active session');
    }

    const message = {
      id: this.generateMessageId(),
      type: 'comment' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      action: 'delete' as const,
      comment: { id: commentId }
    };

    await this.sendMessage(message);
  }

  async resolveComment(commentId: string): Promise<void> {
    if (!this.config.enableComments || !this.currentSession || !this.currentUser) {
      throw new Error('Comments not enabled or no active session');
    }

    const message = {
      id: this.generateMessageId(),
      type: 'comment' as const,
      userId: this.currentUser.id,
      sessionId: this.currentSession.id,
      timestamp: new Date(),
      action: 'resolve' as const,
      comment: { 
        id: commentId, 
        isResolved: true,
        resolvedBy: this.currentUser.id,
        resolvedAt: new Date()
      }
    };

    await this.sendMessage(message);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getCurrentSession(): CollaborationSession | null {
    return this.currentSession;
  }

  getCurrentUser(): CollaborationUser | null {
    return this.currentUser;
  }

  getOperationBuffer(): Operation[] {
    return [...this.operationBuffer];
  }

  clearOperationBuffer(): void {
    this.operationBuffer = [];
  }

  updateConfig(config: Partial<CollaborationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}