/**
 * Collaboration System Types
 * Defines interfaces for real-time collaboration features
 */

// ============================================================================
// Core Collaboration Types
// ============================================================================

export interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  color: string; // Unique color for this user's cursors/selections
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
}

export interface CollaborationSession {
  id: string;
  questionnaireId: string;
  organizationId: string;
  projectId: string;
  participants: CollaborationUser[];
  startedAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type CollaborationMessage = 
  | JoinSessionMessage
  | LeaveSessionMessage
  | OperationMessage
  | CursorUpdateMessage
  | SelectionUpdateMessage
  | CommentMessage
  | PresenceUpdateMessage
  | AckMessage
  | ErrorMessage
  | HeartbeatMessage
  | HeartbeatResponseMessage;

export interface BaseMessage {
  id: string;
  type: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  version?: number;
}

export interface JoinSessionMessage extends BaseMessage {
  type: 'join_session';
  user: CollaborationUser;
}

export interface LeaveSessionMessage extends BaseMessage {
  type: 'leave_session';
}

export interface OperationMessage extends BaseMessage {
  type: 'operation';
  operation: Operation;
  parentVersion: number;
}

export interface CursorUpdateMessage extends BaseMessage {
  type: 'cursor_update';
  position: CursorPosition;
}

export interface SelectionUpdateMessage extends BaseMessage {
  type: 'selection_update';
  selection: Selection;
}

export interface CommentMessage extends BaseMessage {
  type: 'comment';
  action: 'create' | 'update' | 'delete' | 'resolve';
  comment: DeepPartial<Comment>; 
}

export interface PresenceUpdateMessage extends BaseMessage {
  type: 'presence_update';
  presence: PresenceInfo;
}

export interface AckMessage extends BaseMessage {
  type: 'ack';
  messageId: string;
  success: boolean;
  error?: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  error: string;
  code?: string;
}

export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
}

export interface HeartbeatResponseMessage extends BaseMessage {
  type: 'heartbeat_response';
}

// ============================================================================
// Operational Transformation Types
// ============================================================================

export type Operation = 
  | InsertOperation
  | DeleteOperation
  | UpdateOperation
  | MoveOperation
  | ReorderOperation;

export interface BaseOperation {
  id: string;
  type: string;
  userId: string;
  timestamp: Date;
  path: string[]; // Path to the object being modified (e.g., ['questions', '0', 'display', 'prompt'])
}

export interface InsertOperation extends BaseOperation {
  type: 'insert';
  position: number;
  content: any;
  target: 'question' | 'page' | 'variable' | 'option' | 'block';
}

export interface DeleteOperation extends BaseOperation {
  type: 'delete';
  position: number;
  length?: number;
  target: 'question' | 'page' | 'variable' | 'option' | 'block';
  deletedContent?: any; // For undo support
}

export interface UpdateOperation extends BaseOperation {
  type: 'update';
  property: string;
  oldValue: any;
  newValue: any;
}

export interface MoveOperation extends BaseOperation {
  type: 'move';
  fromPath: string[];
  toPath: string[];
  fromPosition: number;
  toPosition: number;
}

export interface ReorderOperation extends BaseOperation {
  type: 'reorder';
  indices: number[];
  newIndices: number[];
}

export interface OperationResult {
  operation: Operation;
  transformed: boolean;
  conflicts?: Conflict[];
}

export interface Conflict {
  type: 'concurrent_edit' | 'deleted_reference' | 'invalid_path';
  operation1: Operation;
  operation2: Operation;
  resolution: 'automatic' | 'manual_required';
  description: string;
}

// ============================================================================
// Version Control Types
// ============================================================================

export interface Version {
  id: string;
  questionnaireId: string;
  version: number;
  content: any; // The questionnaire content at this version
  operations: Operation[];
  createdBy: string;
  createdAt: Date;
  message?: string;
  tags?: string[];
  parentVersion?: string;
  branchName?: string;
}

export interface Branch {
  id: string;
  name: string;
  questionnaireId: string;
  baseVersion: string;
  headVersion: string;
  createdBy: string;
  createdAt: Date;
  isDefault: boolean;
  isActive: boolean;
  description?: string;
}

export interface VersionDiff {
  fromVersion: string;
  toVersion: string;
  operations: Operation[];
  summary: {
    questionsAdded: number;
    questionsModified: number;
    questionsDeleted: number;
    pagesAdded: number;
    pagesModified: number;
    pagesDeleted: number;
    variablesAdded: number;
    variablesModified: number;
    variablesDeleted: number;
  };
  conflicts?: Conflict[];
}

export interface MergeRequest {
  id: string;
  fromBranch: string;
  toBranch: string;
  title: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
  status: 'open' | 'merged' | 'closed' | 'draft';
  conflicts?: Conflict[];
  reviewers?: string[];
  diff: VersionDiff;
}

// ============================================================================
// Comment System Types
// ============================================================================

export interface Comment {
  id: string;
  questionnaireId: string;
  sessionId: string;
  threadId?: string; // For replies
  author: CollaborationUser;
  content: string;
  mentions: string[]; // User IDs mentioned in the comment
  position: CommentPosition;
  createdAt: Date;
  updatedAt?: Date;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  reactions?: Reaction[];
  attachments?: Attachment[];
}

export interface CommentThread {
  id: string;
  questionnaireId: string;
  position: CommentPosition;
  comments: Comment[];
  isResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  participants: string[]; // User IDs of thread participants
}

export interface CommentPosition {
  type: 'question' | 'page' | 'variable' | 'general';
  targetId: string; // ID of the question, page, or variable
  property?: string; // Specific property being commented on
  coordinates?: { x: number; y: number }; // For visual positioning
  textRange?: { start: number; end: number }; // For text selection comments
}

export interface Reaction {
  emoji: string;
  users: string[]; // User IDs who reacted
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

// ============================================================================
// Presence System Types
// ============================================================================

export interface PresenceInfo {
  userId: string;
  cursor?: CursorPosition;
  selection?: Selection;
  activeElement?: ActiveElement;
  viewport?: Viewport;
  status: 'active' | 'idle' | 'away';
  lastActivity: Date;
}

export interface CursorPosition {
  type: 'question' | 'page' | 'variable' | 'general';
  targetId: string;
  property?: string;
  coordinates: { x: number; y: number };
  textPosition?: number; // For text cursor position
}

export interface Selection {
  type: 'question' | 'page' | 'variable' | 'multiple';
  targetIds: string[];
  bounds?: { x: number; y: number; width: number; height: number };
  textRange?: { start: number; end: number };
}

export interface ActiveElement {
  type: 'question' | 'page' | 'variable' | 'property_panel';
  targetId: string;
  property?: string;
}

export interface Viewport {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: number;
}

// ============================================================================
// Change Tracking Types
// ============================================================================

export interface ChangeRecord {
  id: string;
  questionnaireId: string;
  sessionId: string;
  operation: Operation;
  user: CollaborationUser;
  timestamp: Date;
  version: number;
  description: string;
  category: 'content' | 'structure' | 'settings' | 'metadata';
  impact: 'minor' | 'major' | 'breaking';
}

export interface ActivityItem {
  id: string;
  type: 'operation' | 'comment' | 'version' | 'merge' | 'join' | 'leave';
  user: CollaborationUser;
  timestamp: Date;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  relatedItems?: string[]; // IDs of related questions, pages, etc.
}

export interface AuditLog {
  id: string;
  questionnaireId: string;
  organizationId: string;
  projectId: string;
  changes: ChangeRecord[];
  activities: ActivityItem[];
  startDate: Date;
  endDate: Date;
  totalChanges: number;
  totalUsers: number;
}

// ============================================================================
// Client Configuration Types
// ============================================================================

export interface CollaborationConfig {
  websocketUrl: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  operationBufferSize: number;
  maxVersionHistory: number;
  enableComments: boolean;
  enablePresence: boolean;
  enableVersionControl: boolean;
  autoSaveInterval: number;
  conflictResolution: 'automatic' | 'manual' | 'hybrid';
}

export interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  lastConnected?: Date;
  lastDisconnected?: Date;
  reconnectAttempts: number;
  error?: string;
  latency?: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface CollaborationEvents {
  'session:joined': { session: CollaborationSession; user: CollaborationUser };
  'session:left': { sessionId: string; userId: string };
  'session:updated': { session: CollaborationSession };
  'operation:received': { operation: Operation; transformed: boolean };
  'operation:applied': { operation: Operation; success: boolean };
  'cursor:updated': { userId: string; position: CursorPosition };
  'selection:updated': { userId: string; selection: Selection };
  'comment:created': { comment: Comment };
  'comment:updated': { comment: Comment };
  'comment:deleted': { commentId: string };
  'comment:resolved': { comment: Comment };
  'presence:updated': { userId: string; presence: PresenceInfo };
  'version:created': { version: Version };
  'conflict:detected': { conflict: Conflict };
  'connection:status': { status: ConnectionStatus };
  'error': { error: string; code?: string };
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type PathArray = string[];

export type OperationTransform = (op1: Operation, op2: Operation) => OperationResult;

export type ConflictResolver = (conflict: Conflict) => Operation | null;

// ============================================================================
// Component Props Types
// ============================================================================

export interface CommentThreadProps {
  thread: CommentThread;
  currentUser: CollaborationUser;
  onAddComment: (content: string, mentions: string[]) => void;
  onUpdateComment: (commentId: string, content: string) => void;
  onDeleteComment: (commentId: string) => void;
  onResolveThread: (threadId: string) => void;
  onReaction: (commentId: string, emoji: string) => void;
}

export interface PresenceIndicatorProps {
  users: CollaborationUser[];
  maxVisible?: number;
  showTooltips?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface VersionHistoryProps {
  versions: Version[];
  currentVersion: string;
  onSelectVersion: (versionId: string) => void;
  onCreateBranch: (versionId: string, branchName: string) => void;
  onRestoreVersion: (versionId: string) => void;
  showDiff?: boolean;
}

export interface ActivityTimelineProps {
  activities: ActivityItem[];
  maxItems?: number;
  groupByDate?: boolean;
  showFilters?: boolean;
  onLoadMore?: () => void;
}