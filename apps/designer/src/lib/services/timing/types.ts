export interface FrameCallback {
  (timestamp: DOMHighResTimeStamp): void;
}

export interface FrameTimingData {
  frameId: number;
  timestamp: DOMHighResTimeStamp;
  duration: number;
  actualFPS: number;
  targetFPS: number;
  droppedFrames: number;
}

export interface ResponseTiming {
  id: string;
  startTime: DOMHighResTimeStamp;
  endTime: DOMHighResTimeStamp;
  duration: number;
  accuracy: number;
  metadata?: Record<string, unknown>;
}

export interface LatencyReport {
  roundTrip: number;
  serverOffset: number;
  jitter: number;
  samples: number;
  timestamp: DOMHighResTimeStamp;
}

export interface Stimulus {
  id: string;
  type: 'visual' | 'audio' | 'haptic';
  content: unknown;
  duration?: number;
  priority?: number;
}

export interface PresentationReport {
  stimulusId: string;
  scheduledTime: DOMHighResTimeStamp;
  actualTime: DOMHighResTimeStamp;
  drift: number;
  frameAligned: boolean;
  success: boolean;
}

export interface TimingCalibration {
  displayRefreshRate: number;
  frameInterval: number;
  inputLatency: number;
  renderLatency: number;
  timestamp: DOMHighResTimeStamp;
}

export interface TimingValidation {
  isAccurate: boolean;
  precision: number;
  reliability: number;
  warnings: string[];
  recommendations: string[];
}

export interface TimeSyncData {
  clientTime: DOMHighResTimeStamp;
  serverTime: number;
  offset: number;
  accuracy: number;
  synced: boolean;
}