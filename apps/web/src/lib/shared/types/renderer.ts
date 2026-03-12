export type RGBAColor = [number, number, number, number];

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  targetFPS?: number;
  pixelRatio?: number;
  antialias?: boolean;
  vsync?: boolean;
  desynchronized?: boolean;
  powerPreference?: WebGLPowerPreference;
  preserveDrawingBuffer?: boolean;
  backgroundColor?: RGBAColor;
}

export interface FrameStats {
  fps: number;
  frameTime: number;
  droppedFrames: number;
  targetFPS: number;
  totalFrames: number;
  jitter: number;
  gpuTime?: number;
}

export interface FrameSample {
  index: number;
  now: number;
  delta: number;
  presented: boolean;
  droppedSinceLast: number;
}

export interface RenderStimulus {
  type: 'color' | 'image' | 'text' | 'shape' | 'custom';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stimulus data varies by type (color, image, text, shape, custom)
  data: any;
  duration?: number;
  transition?: 'none' | 'fade' | 'slide';
}

export interface ClearCommand {
  type: 'clear';
  params: { r: number; g: number; b: number; a: number };
  timestamp?: number;
}

export interface DrawRectCommand {
  type: 'drawRect';
  params: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: RGBAColor;
  };
  timestamp?: number;
}

export interface DrawCircleCommand {
  type: 'drawCircle';
  params: {
    x: number;
    y: number;
    radius: number;
    color: RGBAColor;
    segments?: number;
  };
  timestamp?: number;
}

export interface DrawTriangleCommand {
  type: 'drawTriangle';
  params: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3: number;
    y3: number;
    color: RGBAColor;
  };
  timestamp?: number;
}

export interface DrawTextureCommand {
  type: 'drawTexture';
  params: {
    texture: WebGLTexture | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity?: number;
  };
  timestamp?: number;
}

export interface CustomShaderCommand {
  type: 'customShader';
  params: {
    shader: string;
    vertices: number[];
    uniforms?: Record<string, number | number[] | boolean>;
  };
  timestamp?: number;
}

export type RenderCommand =
  | ClearCommand
  | DrawRectCommand
  | DrawCircleCommand
  | DrawTriangleCommand
  | DrawTextureCommand
  | CustomShaderCommand;
