export interface MediaAsset {
  id: string;
  organizationId: string;
  uploadedBy: string;
  
  // File information
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  
  // Media metadata
  width?: number;
  height?: number;
  durationSeconds?: number;
  thumbnailPath?: string;
  metadata?: Record<string, any>;
  
  // Access control
  isPublic: boolean;
  accessLevel: 'private' | 'organization' | 'public';
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaUsage {
  id: string;
  mediaId: string;
  questionnaireId?: string;
  questionId?: string;
  usageType: 'stimulus' | 'instruction' | 'feedback' | 'background' | 'option';
  usageContext?: Record<string, any>;
  createdAt: Date;
}

export interface MediaPermission {
  id: string;
  mediaId: string;
  userId?: string;
  roleId?: string;
  permission: 'view' | 'edit' | 'delete';
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

export interface MediaCollection {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdBy: string;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaReference {
  mediaId: string;
  url?: string; // Cached signed URL
  alt?: string;
  caption?: string;
  position?: 'above' | 'below' | 'left' | 'right' | 'background';
  size?: 'small' | 'medium' | 'large' | 'full';
}

export interface MediaUploadOptions {
  organizationId: string;
  userId: string;
  collectionId?: string;
  accessLevel?: 'private' | 'organization' | 'public';
  generateThumbnail?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

export interface MediaUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface MediaFilter {
  type?: 'all' | 'image' | 'video' | 'audio';
  collectionId?: string;
  uploadedBy?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minSize?: number;
  maxSize?: number;
}

export interface MediaError {
  code: 'UPLOAD_FAILED' | 'ACCESS_DENIED' | 'NOT_FOUND' | 'INVALID_TYPE' | 'SIZE_EXCEEDED';
  message: string;
  details?: any;
}

export type MediaAccessLevel = 'owner' | 'delete' | 'edit' | 'view' | null;

// Helper type guards
export function isImageMedia(media: MediaAsset): boolean {
  return media.mimeType.startsWith('image/');
}

export function isVideoMedia(media: MediaAsset): boolean {
  return media.mimeType.startsWith('video/');
}

export function isAudioMedia(media: MediaAsset): boolean {
  return media.mimeType.startsWith('audio/');
}

// File size formatters
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// MIME type to extension mapping
export const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba'
};

// Allowed MIME types for questionnaires
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg'
];

export const MAX_FILE_SIZE = 52428800; // 50MB in bytes

// Media validation
export function validateMediaFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `File type ${file.type} is not supported. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` 
    };
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File size ${formatFileSize(file.size)} exceeds maximum allowed size of ${formatFileSize(MAX_FILE_SIZE)}` 
    };
  }
  
  return { valid: true };
}