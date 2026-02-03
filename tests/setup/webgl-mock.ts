import { vi } from 'vitest';

// Mock WebGL context
const mockWebGLContext = {
  createShader: vi.fn(),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  createProgram: vi.fn(),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  useProgram: vi.fn(),
  createBuffer: vi.fn(),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  clearColor: vi.fn(),
  clear: vi.fn(),
  enable: vi.fn(),
  blendFunc: vi.fn(),
  viewport: vi.fn(),
  createTexture: vi.fn(),
  bindTexture: vi.fn(),
  texImage2D: vi.fn(),
  texParameteri: vi.fn(),
  activeTexture: vi.fn(),
  uniform1i: vi.fn(),
  uniform1f: vi.fn(),
  uniform2f: vi.fn(),
  uniform3f: vi.fn(),
  uniform4f: vi.fn(),
  uniformMatrix4fv: vi.fn(),
  getUniformLocation: vi.fn(),
  getAttribLocation: vi.fn(),
  drawArrays: vi.fn(),
  drawElements: vi.fn(),
  deleteProgram: vi.fn(),
  deleteShader: vi.fn(),
  deleteBuffer: vi.fn(),
  deleteTexture: vi.fn(),
  canvas: {
    width: 800,
    height: 600,
  }
};

// Mock getContext
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(contextId: string, options?: any) {
  if (contextId === 'webgl' || contextId === 'experimental-webgl') {
    return mockWebGLContext as any;
  }
  return getContext.call(this, contextId, options);
} as any;

// Global requestAnimationFrame mock if not present
if (!global.requestAnimationFrame) {
  global.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return setTimeout(callback, 0);
  };
}

if (!global.cancelAnimationFrame) {
  global.cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
  };
}
