import { supabase } from '$lib/services/supabase';
import { nanoid } from 'nanoid';
import type { 
  MediaAsset, 
  MediaUploadOptions, 
  MediaUploadProgress,
  MediaFilter,
  MediaAccessLevel,
  MediaError,
  MediaReference
} from '$lib/shared/types/media';
import { validateMediaFile, MIME_TYPE_EXTENSIONS } from '$lib/shared/types/media';

export class MediaService {
  private readonly BUCKET_NAME = 'media';
  private uploadAbortController: AbortController | null = null;
  private currentUserId: string | null = null;
  
  /**
   * Set the current user ID for access checks
   */
  setUserId(userId: string | null) {
    this.currentUserId = userId;
  }
  
  /**
   * Initialize storage bucket if it doesn't exist
   */
  async setupBucket(): Promise<void> {
    try {
      const { data: buckets, error } = await supabase.storage.listBuckets();
      
      if (error) {
        // Don't log - authenticated users might not have permission to list buckets
        // The bucket can still exist and be usable
        return;
      }
      
      if (!buckets?.find(b => b.name === this.BUCKET_NAME)) {
        // Bucket should be created by migration
        console.warn(`Media bucket '${this.BUCKET_NAME}' not found. It should be created by database migrations.`);
      }
    } catch (error) {
      // Don't throw or log - the bucket might exist but we can't list buckets
      // This is expected for normal authenticated users
    }
  }
  
  /**
   * Upload a media file with progress tracking
   */
  async uploadMedia(
    file: File,
    options: MediaUploadOptions,
    onProgress?: (progress: MediaUploadProgress) => void
  ): Promise<MediaAsset> {
    // Validate file
    const validation = validateMediaFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    // Generate unique storage path
    const ext = MIME_TYPE_EXTENSIONS[file.type] || file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const uniqueId = nanoid(10);
    const filename = `${timestamp}_${uniqueId}.${ext}`;
    const storagePath = `${options.organizationId}/${options.userId}/${filename}`;
    
    try {
      // Create abort controller for cancellation
      this.uploadAbortController = new AbortController();
      
      // Upload to storage with progress tracking
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
          duplex: 'half'
        });
      
      if (uploadError) throw uploadError;
      
      // Extract metadata based on file type
      const metadata = await this.extractMetadata(file);
      
      // Generate thumbnail for images/videos if requested
      let thumbnailPath: string | undefined;
      if (options.generateThumbnail && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
        thumbnailPath = await this.generateThumbnail(file, storagePath);
      }
      
      // Create database record - ensure critical fields are not overridden
      const { data: mediaAsset, error: dbError } = await supabase
        .from('media_assets')
        .insert({
          ...metadata, // Spread metadata first
          organization_id: options.organizationId,
          uploaded_by: options.userId,
          filename,
          original_filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          storage_path: storagePath,
          thumbnail_path: thumbnailPath,
          access_level: options.accessLevel || 'organization'
        })
        .select()
        .single();
      
      if (dbError) {
        // Clean up uploaded file if database insert fails
        await supabase.storage.from(this.BUCKET_NAME).remove([storagePath]);
        throw dbError;
      }
      
      // Add to collection if specified
      if (options.collectionId && mediaAsset) {
        await this.addToCollection(mediaAsset.id, options.collectionId, options.userId);
      }
      
      // Transform snake_case to camelCase
      return {
        id: mediaAsset.id,
        organizationId: mediaAsset.organization_id,
        uploadedBy: mediaAsset.uploaded_by,
        filename: mediaAsset.filename,
        originalFilename: mediaAsset.original_filename,
        mimeType: mediaAsset.mime_type,
        sizeBytes: mediaAsset.size_bytes,
        storagePath: mediaAsset.storage_path,
        width: mediaAsset.width,
        height: mediaAsset.height,
        durationSeconds: mediaAsset.duration_seconds,
        thumbnailPath: mediaAsset.thumbnail_path,
        metadata: mediaAsset.metadata,
        isPublic: mediaAsset.access_level === 'public',
        accessLevel: mediaAsset.access_level,
        createdAt: new Date(mediaAsset.created_at),
        updatedAt: new Date(mediaAsset.updated_at)
      };
    } catch (error) {
      console.error('Media upload failed:', error);
      throw error;
    } finally {
      this.uploadAbortController = null;
    }
  }
  
  /**
   * Cancel ongoing upload
   */
  cancelUpload(): void {
    if (this.uploadAbortController) {
      this.uploadAbortController.abort();
      this.uploadAbortController = null;
    }
  }
  
  /**
   * Get a signed URL for media access
   */
  async getSignedUrl(mediaId: string, expiresIn = 3600): Promise<string> {
    console.log(`[MediaService] Getting signed URL for media: ${mediaId}`);
    
    // Check access permissions
    const accessLevel = await this.checkAccess(mediaId);
    console.log(`[MediaService] Access level for ${mediaId}: ${accessLevel}`);
    
    if (!accessLevel) {
      throw new Error('Access denied');
    }
    
    // Get media record
    const { data: media, error } = await supabase
      .from('media_assets')
      .select('storage_path, access_level')
      .eq('id', mediaId)
      .single();
    
    console.log(`[MediaService] Media query result:`, { media, error });
    
    if (error || !media) {
      console.error(`[MediaService] Failed to fetch media record:`, error);
      throw new Error('Media not found');
    }
    
    // Generate signed URL
    const { data: urlData, error: urlError } = await supabase.storage
      .from(this.BUCKET_NAME)
      .createSignedUrl(media.storage_path, expiresIn);
    
    if (urlError || !urlData) {
      throw urlError || new Error('Failed to generate URL');
    }
    
    return urlData.signedUrl;
  }
  
  /**
   * Get multiple signed URLs at once
   */
  async getSignedUrls(mediaIds: string[], expiresIn = 3600): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};
    
    // Batch process for efficiency
    await Promise.all(
      mediaIds.map(async (id) => {
        try {
          urls[id] = await this.getSignedUrl(id, expiresIn);
        } catch (error) {
          console.error(`Failed to get URL for media ${id}:`, error);
        }
      })
    );
    
    return urls;
  }
  
  /**
   * List media assets with filtering
   */
  async listMedia(filter: MediaFilter = {}): Promise<MediaAsset[]> {
    let query = supabase
      .from('media_assets')
      .select('*')
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (filter.type && filter.type !== 'all') {
      query = query.like('mime_type', `${filter.type}/%`);
    }
    
    if (filter.collectionId) {
      // First get the media IDs from the collection
      const { data: collectionItems } = await supabase
        .from('media_collection_items')
        .select('media_id')
        .eq('collection_id', filter.collectionId);
      
      if (collectionItems && collectionItems.length > 0) {
        const mediaIds = collectionItems.map(item => item.media_id);
        query = query.in('id', mediaIds);
      } else {
        // No items in collection, return empty result
        query = query.in('id', []);
      }
    }
    
    if (filter.uploadedBy) {
      query = query.eq('uploaded_by', filter.uploadedBy);
    }
    
    if (filter.search) {
      query = query.or(`original_filename.ilike.%${filter.search}%,metadata->>'description'.ilike.%${filter.search}%`);
    }
    
    if (filter.dateFrom) {
      query = query.gte('created_at', filter.dateFrom.toISOString());
    }
    
    if (filter.dateTo) {
      query = query.lte('created_at', filter.dateTo.toISOString());
    }
    
    if (filter.minSize) {
      query = query.gte('size_bytes', filter.minSize);
    }
    
    if (filter.maxSize) {
      query = query.lte('size_bytes', filter.maxSize);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Transform snake_case to camelCase
    return (data || []).map(item => ({
      id: item.id,
      organizationId: item.organization_id,
      uploadedBy: item.uploaded_by,
      filename: item.filename,
      originalFilename: item.original_filename,
      mimeType: item.mime_type,
      sizeBytes: item.size_bytes,
      storagePath: item.storage_path,
      width: item.width,
      height: item.height,
      durationSeconds: item.duration_seconds,
      thumbnailPath: item.thumbnail_path,
      metadata: item.metadata,
      isPublic: item.access_level === 'public',
      accessLevel: item.access_level,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at)
    }));
  }
  
  /**
   * Delete media asset
   */
  async deleteMedia(mediaId: string): Promise<void> {
    // Check delete permission
    const accessLevel = await this.checkAccess(mediaId);
    if (accessLevel !== 'owner' && accessLevel !== 'delete') {
      throw new Error('Permission denied');
    }
    
    // Get media info
    const { data: media } = await supabase
      .from('media_assets')
      .select('storage_path, thumbnail_path')
      .eq('id', mediaId)
      .single();
    
    if (!media) return;
    
    // Delete from storage
    const filesToDelete = [media.storage_path];
    if (media.thumbnail_path) {
      filesToDelete.push(media.thumbnail_path);
    }
    
    await supabase.storage
      .from(this.BUCKET_NAME)
      .remove(filesToDelete);
    
    // Delete from database (cascades to related tables)
    await supabase
      .from('media_assets')
      .delete()
      .eq('id', mediaId);
  }
  
  /**
   * Update media metadata
   */
  async updateMedia(mediaId: string, updates: Partial<MediaAsset>): Promise<MediaAsset> {
    const { data, error } = await supabase
      .from('media_assets')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', mediaId)
      .select()
      .single();
    
    if (error) throw error;
    
    return data;
  }
  
  /**
   * Track media usage in a questionnaire
   */
  async trackUsage(
    mediaId: string,
    questionnaireId: string,
    questionId: string,
    usageType: 'stimulus' | 'instruction' | 'feedback' | 'background' | 'option',
    context?: Record<string, any>
  ): Promise<void> {
    await supabase
      .from('media_usage')
      .upsert({
        media_id: mediaId,
        questionnaire_id: questionnaireId,
        question_id: questionId,
        usage_type: usageType,
        usage_context: context || {}
      }, {
        onConflict: 'media_id,questionnaire_id,question_id,usage_type'
      });
  }
  
  /**
   * Remove media usage tracking
   */
  async removeUsage(
    mediaId: string,
    questionnaireId: string,
    questionId?: string
  ): Promise<void> {
    let query = supabase
      .from('media_usage')
      .delete()
      .eq('media_id', mediaId)
      .eq('questionnaire_id', questionnaireId);
    
    if (questionId) {
      query = query.eq('question_id', questionId);
    }
    
    await query;
  }
  
  /**
   * Grant permission to a user or role
   */
  async grantPermission(
    mediaId: string,
    permission: 'view' | 'edit' | 'delete',
    targetId: string,
    targetType: 'user' | 'role',
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    const data: any = {
      media_id: mediaId,
      permission,
      granted_by: grantedBy
    };
    
    if (targetType === 'user') {
      data.user_id = targetId;
    } else {
      data.role_id = targetId;
    }
    
    if (expiresAt) {
      data.expires_at = expiresAt.toISOString();
    }
    
    await supabase
      .from('media_permissions')
      .upsert(data, {
        onConflict: targetType === 'user' 
          ? 'media_id,user_id,permission'
          : 'media_id,role_id,permission'
      });
  }
  
  /**
   * Revoke permission
   */
  async revokePermission(
    mediaId: string,
    permission: 'view' | 'edit' | 'delete',
    targetId: string,
    targetType: 'user' | 'role'
  ): Promise<void> {
    let query = supabase
      .from('media_permissions')
      .delete()
      .eq('media_id', mediaId)
      .eq('permission', permission);
    
    if (targetType === 'user') {
      query = query.eq('user_id', targetId);
    } else {
      query = query.eq('role_id', targetId);
    }
    
    await query;
  }
  
  /**
   * Check user's access level for a media asset
   */
  async checkAccess(mediaId: string, userId?: string): Promise<MediaAccessLevel> {
    try {
      // Get the current auth user if no userId provided
      let authUserId = userId;
      if (!authUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        authUserId = user?.id || undefined;
      }
      
      // If still no user ID, try to use the stored currentUserId
      if (!authUserId && this.currentUserId) {
        // currentUserId is the public user ID, we need to get the auth ID
        const { data: userData } = await supabase
          .from('users')
          .select('auth_id')
          .eq('id', this.currentUserId)
          .single();
        
        authUserId = userData?.auth_id || null;
      }
      
      if (!authUserId) {
        console.error('No user ID available for access check');
        return null;
      }
      
      const { data, error } = await supabase
        .rpc('get_media_access_level', {
          p_media_id: mediaId,
          p_user_id: authUserId
        });
      
      if (error) {
        console.error('Failed to check media access:', error);
        return null;
      }
      
      return data as MediaAccessLevel;
    } catch (err) {
      console.error('Error checking media access:', err);
      return null;
    }
  }
  
  /**
   * Create a media collection
   */
  async createCollection(
    name: string,
    organizationId: string,
    createdBy: string,
    description?: string
  ): Promise<string> {
    const { data, error } = await supabase
      .from('media_collections')
      .insert({
        name,
        organization_id: organizationId,
        created_by: createdBy,
        description
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    return data.id;
  }
  
  /**
   * Add media to a collection
   */
  async addToCollection(
    mediaId: string,
    collectionId: string,
    addedBy: string
  ): Promise<void> {
    await supabase
      .from('media_collection_items')
      .insert({
        media_id: mediaId,
        collection_id: collectionId,
        added_by: addedBy
      });
  }
  
  /**
   * Extract metadata from file
   */
  private async extractMetadata(file: File): Promise<any> {
    const metadata: any = {};
    
    if (file.type.startsWith('image/')) {
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
          metadata.width = img.width;
          metadata.height = img.height;
          URL.revokeObjectURL(url);
          resolve(metadata);
        };
        
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(metadata);
        };
        
        img.src = url;
      });
    }
    
    if (file.type.startsWith('video/')) {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(file);
        
        video.onloadedmetadata = () => {
          metadata.width = video.videoWidth;
          metadata.height = video.videoHeight;
          metadata.duration_seconds = video.duration;
          URL.revokeObjectURL(url);
          resolve(metadata);
        };
        
        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(metadata);
        };
        
        video.src = url;
      });
    }
    
    if (file.type.startsWith('audio/')) {
      return new Promise((resolve) => {
        const audio = new Audio();
        const url = URL.createObjectURL(file);
        
        audio.onloadedmetadata = () => {
          metadata.duration_seconds = audio.duration;
          URL.revokeObjectURL(url);
          resolve(metadata);
        };
        
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(metadata);
        };
        
        audio.src = url;
      });
    }
    
    return metadata;
  }
  
  /**
   * Generate thumbnail for image/video
   */
  private async generateThumbnail(file: File, originalPath: string): Promise<string | undefined> {
    // For now, return undefined - thumbnail generation would require
    // server-side processing or a cloud function
    // This is a placeholder for future implementation
    return undefined;
  }
  
  /**
   * Prepare media references with signed URLs
   */
  async prepareMediaReferences(
    references: MediaReference[],
    expiresIn = 3600
  ): Promise<MediaReference[]> {
    const mediaIds = references.map(r => r.mediaId);
    const urls = await this.getSignedUrls(mediaIds, expiresIn);
    
    return references.map(ref => ({
      ...ref,
      url: urls[ref.mediaId]
    }));
  }
}

// Export singleton instance
export const mediaService = new MediaService();