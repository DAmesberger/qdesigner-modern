// Collaboration Types

export interface CollaborationUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  color: string;
  cursor: CursorPosition | null;
  selection: SelectionRange | null;
  isActive: boolean;
  lastSeen: number;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  start: number;
  end: number;
}

export interface CollaborationEvent {
  type: CollaborationEventType;
  userId: string;
  timestamp: number;
  data: any;
}

export type CollaborationEventType = 
  | 'join'
  | 'leave'
  | 'sync'
  | 'sync-request'
  | 'operation'
  | 'cursor'
  | 'selection'
  | 'comment'
  | 'presence'
  | 'heartbeat'
  | 'error';

export interface CollaborationState {
  users: Map<string, CollaborationUser>;
  documentVersion: number;
  isConnected: boolean;
  isSynced: boolean;
  pendingOperations: OperationalTransform[];
}

// Operational Transformation Types
export interface OperationalTransform {
  id: string;
  type: 'insert' | 'delete' | 'replace' | 'move' | 'format';
  position: number;
  length?: number;
  content?: string;
  attributes?: Record<string, any>;
  version: number;
  userId: string;
  timestamp: number;
}

export interface TransformResult {
  operation: OperationalTransform;
  transformed: boolean;
}

// Version Control Types
export interface DocumentVersion {
  id: string;
  version: number;
  hash: string;
  operations: OperationalTransform[];
  timestamp: number;
  userId: string;
  message?: string;
}

export interface VersionHistory {
  versions: DocumentVersion[];
  currentVersion: number;
  baseVersion: number;
}

// Comment Types
export interface Comment {
  id: string;
  text: string;
  userId: string;
  userName: string;
  timestamp: number;
  position: CommentPosition;
  resolved: boolean;
  replies: CommentReply[];
}

export interface CommentPosition {
  questionId?: string;
  line?: number;
  column?: number;
  elementId?: string;
}

export interface CommentReply {
  id: string;
  text: string;
  userId: string;
  userName: string;
  timestamp: number;
}

// Change Tracking Types
export interface Change {
  id: string;
  type: 'add' | 'modify' | 'delete';
  elementType: 'question' | 'section' | 'logic' | 'variable' | 'setting';
  elementId: string;
  before: any;
  after: any;
  userId: string;
  userName: string;
  timestamp: number;
  description?: string;
}

export interface ChangeSet {
  id: string;
  changes: Change[];
  userId: string;
  userName: string;
  timestamp: number;
  message: string;
  status: 'pending' | 'applied' | 'rejected';
}

// Conflict Resolution Types
export interface Conflict {
  id: string;
  type: 'merge' | 'operation' | 'version';
  operations: OperationalTransform[];
  localVersion: number;
  remoteVersion: number;
  resolved: boolean;
  resolution?: ConflictResolution;
}

export interface ConflictResolution {
  strategy: 'local' | 'remote' | 'merge' | 'manual';
  result: OperationalTransform[];
  resolvedBy: string;
  timestamp: number;
}

// Presence Types
export interface PresenceData {
  userId: string;
  sessionId: string;
  location: {
    page?: string;
    questionId?: string;
    sectionId?: string;
  };
  activity: {
    type: 'viewing' | 'editing' | 'commenting' | 'testing';
    target?: string;
  };
  status: 'active' | 'idle' | 'away';
  lastActivity: number;
}

// Collaboration Permissions
export interface CollaborationPermissions {
  canEdit: boolean;
  canComment: boolean;
  canResolveComments: boolean;
  canViewHistory: boolean;
  canRevert: boolean;
  canManageCollaborators: boolean;
}