import { BaseStimulus } from './Stimulus';
import type { StimulusConfig, RenderContext } from './Stimulus';
import type { ResourceManager } from '../resources/ResourceManager';

export interface ImageStimulusConfig extends StimulusConfig {
  imageUrl: string;
  fit?: 'contain' | 'cover' | 'fill' | 'none';
  opacity?: number;
}

/**
 * Image stimulus with WebGL rendering
 */
export class ImageStimulus extends BaseStimulus {
  private imageConfig: ImageStimulusConfig;
  private texture: WebGLTexture | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private imageWidth: number = 0;
  private imageHeight: number = 0;
  
  // Shader sources
  private vertexShader = `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;
    
    uniform mat3 u_matrix;
    
    out vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
      v_texCoord = a_texCoord;
    }`;
  
  private fragmentShader = `#version 300 es
    precision highp float;
    
    in vec2 v_texCoord;
    
    uniform sampler2D u_texture;
    uniform float u_opacity;
    
    out vec4 outColor;
    
    void main() {
      vec4 color = texture(u_texture, v_texCoord);
      outColor = vec4(color.rgb, color.a * u_opacity);
    }`;
  
  constructor(config: ImageStimulusConfig) {
    super(config.id, 'image', config);
    this.imageConfig = config;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Register image for loading
    resourceManager.registerResource(this.imageConfig.imageUrl, 'image', this.imageConfig.imageUrl);
    
    // The actual loading is done by ResourceManager
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void {
    // Update config
    this.config = { ...this.config, ...config };
    
    // Create WebGL resources
    this.createWebGLResources(gl);
  }
  
  private createWebGLResources(gl: WebGL2RenderingContext): void {
    // Create shader program
    const vertShader = this.createShader(gl, gl.VERTEX_SHADER, this.vertexShader);
    const fragShader = this.createShader(gl, gl.FRAGMENT_SHADER, this.fragmentShader);
    
    if (!vertShader || !fragShader) {
      throw new Error('Failed to create shaders');
    }
    
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertShader);
    gl.attachShader(this.program, fragShader);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('Failed to link program');
    }
    
    // Create vertex array
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    
    // Position buffer (full quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const positionLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    
    // Texture coordinate buffer
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    
    const texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    
    gl.bindVertexArray(null);
  }
  
  private createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  protected renderStimulus(gl: WebGL2RenderingContext, context: RenderContext): void {
    if (!this.program || !this.vao) return;
    
    // Get texture from resource manager (set in runtime)
    if (!this.texture) {
      const resourceManager = (gl as any).resourceManager as ResourceManager;
      if (resourceManager) {
        this.texture = resourceManager.getTexture(this.imageConfig.imageUrl) || null;
        const image = resourceManager.getImage(this.imageConfig.imageUrl);
        if (image) {
          this.imageWidth = image.width;
          this.imageHeight = image.height;
        }
      }
    }
    
    if (!this.texture) return;
    
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    
    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    
    // Set uniforms
    const textureLoc = gl.getUniformLocation(this.program, 'u_texture');
    gl.uniform1i(textureLoc, 0);
    
    const opacityLoc = gl.getUniformLocation(this.program, 'u_opacity');
    const baseOpacity = this.imageConfig.opacity ?? 1.0;
    const transitionOpacity = this.config.transition?.in && context.transitionProgress !== undefined
      ? context.transitionProgress
      : 1.0;
    gl.uniform1f(opacityLoc, baseOpacity * transitionOpacity);
    
    // Calculate transformation matrix based on fit mode
    const matrix = this.calculateTransformMatrix(context);
    
    const matrixLoc = gl.getUniformLocation(this.program, 'u_matrix');
    gl.uniformMatrix3fv(matrixLoc, false, matrix);
    
    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
  
  private calculateTransformMatrix(context: RenderContext): Float32Array {
    const pos = this.getPixelPosition(context);
    const targetSize = this.getPixelSize(context);
    
    let scaleX = 1;
    let scaleY = 1;
    
    if (this.imageWidth && this.imageHeight) {
      const imageAspect = this.imageWidth / this.imageHeight;
      const targetAspect = targetSize.width / targetSize.height;
      
      switch (this.imageConfig.fit) {
        case 'contain':
          // Fit inside while maintaining aspect ratio
          if (imageAspect > targetAspect) {
            scaleX = targetSize.width / context.width;
            scaleY = (targetSize.width / imageAspect) / context.height;
          } else {
            scaleX = (targetSize.height * imageAspect) / context.width;
            scaleY = targetSize.height / context.height;
          }
          break;
          
        case 'cover':
          // Fill area while maintaining aspect ratio
          if (imageAspect > targetAspect) {
            scaleX = (targetSize.height * imageAspect) / context.width;
            scaleY = targetSize.height / context.height;
          } else {
            scaleX = targetSize.width / context.width;
            scaleY = (targetSize.width / imageAspect) / context.height;
          }
          break;
          
        case 'fill':
          // Stretch to fill
          scaleX = targetSize.width / context.width;
          scaleY = targetSize.height / context.height;
          break;
          
        case 'none':
        default:
          // Original size
          scaleX = this.imageWidth / context.width;
          scaleY = this.imageHeight / context.height;
          break;
      }
    }
    
    // Apply transition scaling
    if (this.config.transition?.in?.type === 'zoom' && context.transitionProgress !== undefined) {
      const scale = this.applyTransition(1, context.transitionProgress, 'zoom');
      scaleX *= scale;
      scaleY *= scale;
    }
    
    // Convert position to NDC
    const translateX = (pos.x / context.width) * 2 - 1;
    const translateY = -((pos.y / context.height) * 2 - 1);
    
    // Create transformation matrix
    return new Float32Array([
      scaleX, 0, 0,
      0, scaleY, 0,
      translateX, translateY, 1
    ]);
  }
  
  public cleanup(gl: WebGL2RenderingContext): void {
    // Note: We don't delete the texture here as it's managed by ResourceManager
    
    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
    
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
  }
}