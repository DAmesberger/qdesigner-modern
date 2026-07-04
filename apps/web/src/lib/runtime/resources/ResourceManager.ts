import type { Questionnaire, Question, StimulusConfig as Stimulus } from '$lib/shared';
import { mediaContentUrl } from '$lib/services/mediaService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- resource manager caches heterogeneous decoded assets
type DynamicValue = any;

export interface Resource {
  id: string;
  url: string;
  type: ResourceType;
  data?: DynamicValue;
  status: 'pending' | 'loading' | 'loaded' | 'error';
  error?: Error;
}

export type ResourceType = 'image' | 'video' | 'audio' | 'font' | 'shader' | 'json' | 'text';

export interface LoadProgress {
  total: number;
  loaded: number;
  percentage: number;
  currentResource?: string;
}

export class ResourceManager {
  private resources: Map<string, Resource> = new Map();
  private loadedData: Map<string, DynamicValue> = new Map();
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private videoCache: Map<string, HTMLVideoElement> = new Map();
  private audioCache: Map<string, AudioBuffer> = new Map();
  private audioContext: AudioContext;

  constructor() {
    this.audioContext = new AudioContext();
  }

  /**
   * Scan questionnaire and register all resources
   */
  public async scanQuestionnaire(questionnaire: Questionnaire): Promise<void> {
    // Scan all questions for media resources
    for (const question of questionnaire.questions) {
      this.scanQuestion(question);
    }

    // Scan any global resources in settings
    const settings = questionnaire.settings as DynamicValue;
    if (settings.theme?.customCss) {
      this.registerResource('theme.css', 'text', settings.theme.customCss);
    }
  }

  /**
   * Scan a question for resources
   */
  private scanQuestion(question: Question) {
    // Scan stimulus
    if (question.stimulus) {
      // Cast to any since the type might not fully match StimulusConfig strictness in shared types yet
      this.scanStimulus(question.stimulus as DynamicValue);
    }

    // Scan reaction-experiment media assets (config.assets) so they are preloaded and
    // seeded into ReactionEngine's caches via seedFromResourceManager.
    this.scanReactionAssets(question);

    // Scan response options for images
    if (question.responseOptions) {
      for (const option of question.responseOptions) {
        if (option.label?.includes('http') || option.label?.includes('.png') || option.label?.includes('.jpg')) {
          this.registerResource(option.label, 'image', option.label);
        }
      }
    }
  }

  /**
   * Scan a reaction-experiment question's media assets. Each `config.assets` entry is a
   * ReactionExperimentAssetRef ({ mediaId, kind, url? }); the reaction runtime resolves
   * its stimulus src to the stable same-origin proxy `mediaContentUrl(mediaId)` (or the
   * literal `url`). Registering resources under that exact key means preloadAll() fills
   * the image/video/audio caches with entries ReactionEngine.seedFromResourceManager can
   * copy by key — avoiding on-demand network loads at trial time.
   */
  private scanReactionAssets(question: Question) {
    const config = (question as DynamicValue).config;
    const assets = config?.assets;
    if (!Array.isArray(assets)) return;

    for (const asset of assets) {
      if (!asset) continue;
      const kind = asset.kind;
      if (kind !== 'image' && kind !== 'video' && kind !== 'audio') continue;

      const url = asset.mediaId ? mediaContentUrl(asset.mediaId) : asset.url;
      if (!url) continue;

      this.registerResource(url, kind, url);
    }
  }

  /**
   * Scan stimulus for resources
   */
  private scanStimulus(stimulus: Stimulus) {
    const content = stimulus.content as DynamicValue;

    if (typeof content === 'string') return;

    if (content.imageUrl) {
      this.registerResource(content.imageUrl, 'image', content.imageUrl);
    }

    if (content.videoUrl) {
      this.registerResource(content.videoUrl, 'video', content.videoUrl);
    }

    if (content.audioUrl) {
      this.registerResource(content.audioUrl, 'audio', content.audioUrl);
    }

    // Scan composite stimuli
    if (content.components) {
      for (const component of content.components) {
        this.scanStimulus(component);
      }
    }
  }

  /**
   * Register a resource for loading
   */
  public registerResource(id: string, type: ResourceType, url: string) {
    if (!this.resources.has(id)) {
      this.resources.set(id, {
        id,
        url,
        type,
        status: 'pending'
      });
    }
  }

  /**
   * Preload all registered resources
   */
  public async preloadAll(onProgress?: (progress: LoadProgress) => void): Promise<void> {
    const resources = Array.from(this.resources.values());
    const total = resources.length;
    let loaded = 0;
    const errors: Array<{ resource: Resource; error: Error }> = [];

    // Create loading promises
    const loadPromises = resources.map(async (resource) => {
      try {
        resource.status = 'loading';
        
        if (onProgress) {
          onProgress({
            total,
            loaded,
            percentage: (loaded / total) * 100,
            currentResource: resource.id
          });
        }

        await this.loadResource(resource);
        
        resource.status = 'loaded';
        loaded++;
        
        if (onProgress) {
          onProgress({
            total,
            loaded,
            percentage: (loaded / total) * 100,
            currentResource: resource.id
          });
        }
      } catch (error) {
        resource.status = 'error';
        resource.error = error as Error;
        errors.push({ resource, error: error as Error });
        console.error(`Failed to load resource ${resource.id}:`, error as Error);
      }
    });

    // Wait for all resources to load
    await Promise.all(loadPromises);

    // If any resources failed to load, throw an error with details
    if (errors.length > 0) {
      const errorMessages = errors.map(({ resource, error }) => 
        `- ${resource.type} "${resource.id}" (${resource.url}): ${error.message}`
      ).join('\n');
      
      throw new Error(
        `Failed to preload ${errors.length} resource${errors.length > 1 ? 's' : ''}:\n${errorMessages}`
      );
    }
  }

  /**
   * Load a single resource
   */
  private async loadResource(resource: Resource): Promise<void> {
    switch (resource.type) {
      case 'image':
        await this.loadImage(resource);
        break;
      case 'video':
        await this.loadVideo(resource);
        break;
      case 'audio':
        await this.loadAudio(resource);
        break;
      case 'json':
        await this.loadJSON(resource);
        break;
      case 'text':
      case 'shader':
        await this.loadText(resource);
        break;
      case 'font':
        await this.loadFont(resource);
        break;
    }
  }

  /**
   * Load image and create WebGL texture
   */
  private async loadImage(resource: Resource): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Set crossOrigin BEFORE src: media now resolves to the same-origin proxy
      // (`/api/media/{id}/content`), so this is a no-op for those, but keeping it
      // 'anonymous' and assigned before the request starts is defense-in-depth that
      // guarantees the decoded image is never tainted for WebGL texture upload
      // (texImage2D throws SECURITY_ERR on a tainted source).
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.imageCache.set(resource.id, img);
        resolve();
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${resource.url}`));
      };
      
      img.src = resource.url;
    });
  }

  /**
   * Load video and prepare for playback
   */
  private async loadVideo(resource: Resource): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      // crossOrigin MUST be assigned before src (same rationale as loadImage): a video
      // sampled into a WebGL texture taints the context unless it was fetched with CORS.
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = true; // Required for autoplay
      
      video.onloadeddata = () => {
        this.videoCache.set(resource.id, video);
        resolve();
      };
      
      video.onerror = () => {
        reject(new Error(`Failed to load video: ${resource.url}`));
      };
      
      video.src = resource.url;
      video.load();
    });
  }

  /**
   * Load audio into Web Audio API
   */
  private async loadAudio(resource: Resource): Promise<void> {
    try {
      const response = await fetch(resource.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.audioCache.set(resource.id, audioBuffer);
    } catch (_error) {
      throw new Error(`Failed to load audio: ${resource.url}`);
    }
  }

  /**
   * Load JSON data
   */
  private async loadJSON(resource: Resource): Promise<void> {
    const response = await fetch(resource.url);
    const data = await response.json();
    this.loadedData.set(resource.id, data);
  }

  /**
   * Load text content
   */
  private async loadText(resource: Resource): Promise<void> {
    const response = await fetch(resource.url);
    const text = await response.text();
    this.loadedData.set(resource.id, text);
  }

  /**
   * Load font
   */
  private async loadFont(resource: Resource): Promise<void> {
    const fontFace = new FontFace(resource.id, `url(${resource.url})`);
    await fontFace.load();
    document.fonts.add(fontFace);
  }

  // Getters for loaded resources
  
  public getImage(id: string): HTMLImageElement | undefined {
    return this.imageCache.get(id);
  }

  public getVideo(id: string): HTMLVideoElement | undefined {
    return this.videoCache.get(id);
  }

  public getAudioBuffer(id: string): AudioBuffer | undefined {
    return this.audioCache.get(id);
  }

  public getData(id: string): DynamicValue {
    return this.loadedData.get(id);
  }

  public getAudioContext(): AudioContext {
    return this.audioContext;
  }

  /**
   * Get all preloaded images (keyed by URL/id).
   * Used to seed ReactionEngine caches and avoid on-demand network loads.
   */
  public getImageCache(): ReadonlyMap<string, HTMLImageElement> {
    return this.imageCache;
  }

  /**
   * Get all preloaded videos (keyed by URL/id).
   */
  public getVideoCache(): ReadonlyMap<string, HTMLVideoElement> {
    return this.videoCache;
  }

  /**
   * Get all preloaded audio buffers (keyed by URL/id).
   */
  public getAudioBufferCache(): ReadonlyMap<string, AudioBuffer> {
    return this.audioCache;
  }

  /**
   * Get loading statistics
   */
  public getStats(): { total: number; loaded: number; errors: number } {
    let loaded = 0;
    let errors = 0;
    
    for (const resource of this.resources.values()) {
      if (resource.status === 'loaded') loaded++;
      if (resource.status === 'error') errors++;
    }
    
    return {
      total: this.resources.size,
      loaded,
      errors
    };
  }

  /**
   * Get all failed resources
   */
  public getFailedResources(): Array<Resource> {
    return Array.from(this.resources.values()).filter(r => r.status === 'error');
  }

  /**
   * Validate all resources are loaded successfully
   */
  public validateAllLoaded(): boolean {
    return this.getFailedResources().length === 0;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    // Clean up video elements
    for (const video of this.videoCache.values()) {
      video.pause();
      video.src = '';
      video.load();
    }

    // Close audio context
    this.audioContext.close();

    // Clear all caches
    this.resources.clear();
    this.loadedData.clear();
    this.imageCache.clear();
    this.videoCache.clear();
    this.audioCache.clear();
  }
}
