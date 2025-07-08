import { BaseStimulus } from './Stimulus';
import type { StimulusConfig, RenderContext } from './Stimulus';
import type { ResourceManager } from '../resources/ResourceManager';

export interface TextStimulusConfig extends StimulusConfig {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  color?: [number, number, number, number]; // RGBA
  backgroundColor?: [number, number, number, number];
  padding?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

/**
 * Text stimulus rendered to canvas then displayed as WebGL texture
 */
export class TextStimulus extends BaseStimulus {
  private textConfig: TextStimulusConfig;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  
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
  
  constructor(config: TextStimulusConfig) {
    super(config.id, 'text', config);
    this.textConfig = config;
    
    // Create offscreen canvas for text rendering
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  public async preload(resourceManager: ResourceManager): Promise<void> {
    // Text doesn't need resource preloading unless using custom fonts
    this.ready = true;
  }
  
  public prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void {
    // Update config
    this.config = { ...this.config, ...config };
    
    // Render text to canvas
    this.renderTextToCanvas();
    
    // Create WebGL resources
    this.createWebGLResources(gl);
  }
  
  private renderTextToCanvas(): void {
    const fontSize = this.textConfig.fontSize || 48;
    const fontFamily = this.textConfig.fontFamily || 'Arial, sans-serif';
    const padding = this.textConfig.padding || 20;
    const maxWidth = this.textConfig.maxWidth || 800;
    
    // Set up canvas context
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.textBaseline = 'top';
    
    // Measure text
    const lines = this.wrapText(this.textConfig.text, maxWidth - padding * 2);
    const lineHeight = fontSize * 1.2;
    const textHeight = lines.length * lineHeight;
    
    // Calculate canvas size
    let maxLineWidth = 0;
    for (const line of lines) {
      const metrics = this.ctx.measureText(line);
      maxLineWidth = Math.max(maxLineWidth, metrics.width);
    }
    
    this.canvas.width = maxLineWidth + padding * 2;
    this.canvas.height = textHeight + padding * 2;
    
    // Clear and fill background
    const bgColor = this.textConfig.backgroundColor || [0, 0, 0, 0];
    this.ctx.fillStyle = `rgba(${bgColor[0] * 255}, ${bgColor[1] * 255}, ${bgColor[2] * 255}, ${bgColor[3]})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw text
    const textColor = this.textConfig.color || [1, 1, 1, 1];
    this.ctx.fillStyle = `rgba(${textColor[0] * 255}, ${textColor[1] * 255}, ${textColor[2] * 255}, ${textColor[3]})`;
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = this.textConfig.align || 'center';
    
    const x = this.textConfig.align === 'left' ? padding :
              this.textConfig.align === 'right' ? this.canvas.width - padding :
              this.canvas.width / 2;
    
    let y = padding;
    for (const line of lines) {
      this.ctx.fillText(line, x, y);
      y += lineHeight;
    }
  }
  
  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
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
    
    // Create texture from canvas
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Create vertex array
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    
    // Position buffer
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
    if (!this.program || !this.vao || !this.texture) return;
    
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    
    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    
    // Set uniforms
    const textureLoc = gl.getUniformLocation(this.program, 'u_texture');
    gl.uniform1i(textureLoc, 0);
    
    const opacityLoc = gl.getUniformLocation(this.program, 'u_opacity');
    const opacity = this.config.transition?.in && context.transitionProgress !== undefined
      ? context.transitionProgress
      : 1.0;
    gl.uniform1f(opacityLoc, opacity);
    
    // Calculate transformation matrix
    const pos = this.getPixelPosition(context);
    const size = { width: this.canvas.width, height: this.canvas.height };
    
    // Convert to normalized device coordinates
    const scaleX = size.width / context.width;
    const scaleY = size.height / context.height;
    const translateX = (pos.x / context.width) * 2 - 1;
    const translateY = -((pos.y / context.height) * 2 - 1);
    
    // Create transformation matrix
    const matrix = new Float32Array([
      scaleX, 0, 0,
      0, scaleY, 0,
      translateX, translateY, 1
    ]);
    
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
  
  public cleanup(gl: WebGL2RenderingContext): void {
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }
    
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