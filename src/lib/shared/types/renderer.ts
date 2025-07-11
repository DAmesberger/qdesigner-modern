export interface RendererOptions {
  canvas: HTMLCanvasElement;
  targetFPS?: 60 | 120 | 144 | 240;
  pixelRatio?: number;
}

export interface FrameStats {
  fps: number;
  frameTime: number;
  droppedFrames: number;
  targetFPS: number;
  gpuTime?: number;
}

export interface RenderStimulus {
  type: 'color' | 'image' | 'text' | 'shape' | 'custom';
  data: any;
  duration?: number;
  transition?: 'none' | 'fade' | 'slide';
}

export interface RenderCommand {
  type: 'clear' | 'drawRect' | 'drawCircle' | 'drawImage' | 'drawText' | 'drawCustom';
  params: any;
  timestamp?: number;
}