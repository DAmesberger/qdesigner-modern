import { vi } from 'vitest';
import { config } from 'dotenv';
import '@testing-library/jest-dom/vitest';

// Load test environment variables
config({ path: '.env.test' });

// Set up global test environment
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// Mock performance.now for consistent timing tests
const mockPerformanceNow = vi.fn();
let currentTime = 0;

mockPerformanceNow.mockImplementation(() => {
  return currentTime++;
});

if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = {} as any;
}
globalThis.performance.now = mockPerformanceNow;

// Mock crypto for tests
globalThis.crypto = {
  randomUUID: () => `test-uuid-${Math.random().toString(36).substr(2, 9)}`,
  getRandomValues: (arr: any) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }
} as any;

// Mock IndexedDB for offline storage tests
import 'fake-indexeddb/auto';

// Mock service worker
globalThis.navigator = {
  ...globalThis.navigator,
  serviceWorker: {
    register: vi.fn().mockResolvedValue({
      installing: null,
      waiting: null,
      active: { state: 'activated' }
    }),
    ready: Promise.resolve({
      active: { postMessage: vi.fn() }
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
} as any;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};
globalThis.localStorage = localStorageMock as any;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};
globalThis.sessionStorage = sessionStorageMock as any;

// Clear all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  sessionStorageMock.clear();
  currentTime = 0;
});

// WebGL mock for renderer tests
class WebGLRenderingContextMock {
  canvas = { width: 800, height: 600 };
  
  createShader = vi.fn(() => ({}));
  shaderSource = vi.fn();
  compileShader = vi.fn();
  getShaderParameter = vi.fn(() => true);
  createProgram = vi.fn(() => ({}));
  attachShader = vi.fn();
  linkProgram = vi.fn();
  getProgramParameter = vi.fn(() => true);
  useProgram = vi.fn();
  getAttribLocation = vi.fn(() => 0);
  getUniformLocation = vi.fn(() => ({}));
  enableVertexAttribArray = vi.fn();
  createBuffer = vi.fn(() => ({}));
  bindBuffer = vi.fn();
  bufferData = vi.fn();
  vertexAttribPointer = vi.fn();
  uniformMatrix4fv = vi.fn();
  uniform1f = vi.fn();
  uniform2f = vi.fn();
  uniform3f = vi.fn();
  uniform4f = vi.fn();
  clearColor = vi.fn();
  clear = vi.fn();
  viewport = vi.fn();
  drawArrays = vi.fn();
  getExtension = vi.fn(() => null);
  
  ARRAY_BUFFER = 0x8892;
  STATIC_DRAW = 0x88E4;
  FLOAT = 0x1406;
  VERTEX_SHADER = 0x8B31;
  FRAGMENT_SHADER = 0x8B30;
  COMPILE_STATUS = 0x8B81;
  LINK_STATUS = 0x8B82;
  COLOR_BUFFER_BIT = 0x00004000;
  TRIANGLES = 0x0004;
}

HTMLCanvasElement.prototype.getContext = vi.fn((contextType: string) => {
  if (contextType === 'webgl2' || contextType === 'webgl') {
    return new WebGLRenderingContextMock();
  }
  return null;
}) as any;

// Mock fetch for API tests
globalThis.fetch = vi.fn();

// Add custom matchers
expect.extend({
  toBeWithinRange(received: number, min: number, max: number) {
    const pass = received >= min && received <= max;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${min} - ${max}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${min} - ${max}`,
        pass: false
      };
    }
  }
});