import type { Questionnaire, Question, Stimulus } from '$lib/shared';

export interface Resource {
  id: string;
  url: string;
  type: ResourceType;
  data?: any;
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
  private loadedData: Map<string, any> = new Map();
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private videoCache: Map<string, HTMLVideoElement> = new Map();
  private audioCache: Map<string, AudioBuffer> = new Map();
  private audioContext: AudioContext;
  private gl: WebGL2RenderingContext | null = null;
  private textureCache: Map<string, WebGLTexture> = new Map();
  
  constructor() {
    this.audioContext = new AudioContext();
  }

  /**
   * Initialize with WebGL context for texture creation
   */
  public setWebGLContext(gl: WebGL2RenderingContext) {
    this.gl = gl;
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
    if (questionnaire.settings.theme?.customCss) {
      this.registerResource('theme.css', 'text', questionnaire.settings.theme.customCss);
    }
  }

  /**
   * Scan a question for resources
   */
  private scanQuestion(question: Question) {
    // Scan stimulus
    if (question.stimulus) {
      this.scanStimulus(question.stimulus);
    }

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
   * Scan stimulus for resources
   */
  private scanStimulus(stimulus: Stimulus) {
    const content = stimulus.content;

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
        console.error(`Failed to load resource ${resource.id}:`, error);
      }
    });

    // Wait for all resources to load
    await Promise.all(loadPromises);
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
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        this.imageCache.set(resource.id, img);
        
        // Create WebGL texture if context available
        if (this.gl) {
          const texture = this.createTexture(img);
          if (texture) {
            this.textureCache.set(resource.id, texture);
          }
        }
        
        resolve();
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${resource.url}`));
      };
      
      img.src = resource.url;
    });
  }

  /**
   * Create WebGL texture from image
   */
  private createTexture(image: HTMLImageElement): WebGLTexture | null {
    if (!this.gl) return null;
    
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Upload image to texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    
    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Generate mipmaps if power of 2
    if (this.isPowerOf2(image.width) && this.isPowerOf2(image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  /**
   * Check if value is power of 2
   */
  private isPowerOf2(value: number): boolean {
    return (value & (value - 1)) === 0;
  }

  /**
   * Load video and prepare for playback
   */
  private async loadVideo(resource: Resource): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
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
    } catch (error) {
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

  public getTexture(id: string): WebGLTexture | undefined {
    return this.textureCache.get(id);
  }

  public getVideo(id: string): HTMLVideoElement | undefined {
    return this.videoCache.get(id);
  }

  public getAudioBuffer(id: string): AudioBuffer | undefined {
    return this.audioCache.get(id);
  }

  public getData(id: string): any {
    return this.loadedData.get(id);
  }

  public getAudioContext(): AudioContext {
    return this.audioContext;
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
   * Clean up resources
   */
  public dispose(): void {
    // Clean up WebGL textures
    if (this.gl) {
      for (const texture of this.textureCache.values()) {
        this.gl.deleteTexture(texture);
      }
    }

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
    this.textureCache.clear();
  }
}