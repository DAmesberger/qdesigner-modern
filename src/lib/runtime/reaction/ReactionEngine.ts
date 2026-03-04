/**
 * ReactionEngine — Frame-exact reaction time measurement.
 *
 * Provides sub-millisecond precision through:
 * - Stimulus onset: RAF callbacks (visual), requestVideoFrameCallback (video),
 *   AudioContext.currentTime (audio)
 * - Response capture: event.timeStamp (DOMHighResTimeStamp)
 * - Fallback: performance.now() when browser APIs unavailable
 *
 * Requires COOP/COEP headers for full timer precision (~5μs vs ~100μs).
 * See src/hooks.server.ts for header configuration on fillout routes.
 *
 * For standard survey questions (response times in seconds), the general
 * QuestionnaireRuntime path with performance.now() is sufficient.
 */

import type { FrameSample, RGBAColor } from '$lib/shared';
import { WebGLRenderer } from '$lib/renderer';
import type { Renderable } from '$lib/renderer';
import type { ResourceManager } from '../resources/ResourceManager';
import type {
  ReactionEngineHooks,
  ReactionResponseCapture,
  ReactionTrialConfig,
  ReactionTrialResult,
  ScheduledPhase,
  ReactionPhaseMark,
  ReactionStimulusConfig,
  TimingMethod,
} from './types';
import type { TimingGatekeeper } from '../timing/TimingGatekeeper';

interface ReactionEngineOptions {
  canvas: HTMLCanvasElement;
  renderer?: WebGLRenderer;
  hooks?: ReactionEngineHooks;
  eventTarget?: Document | HTMLElement;
  /** Optional gatekeeper for device qualification before first trial. */
  gatekeeper?: TimingGatekeeper;
}

interface ResponseWaitResult {
  response: ReactionResponseCapture | null;
  timeout: boolean;
}

export class ReactionEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly ownsRenderer: boolean;
  private readonly hooks?: ReactionEngineHooks;
  private eventTarget: Document | HTMLElement;

  private scheduledPhases: ScheduledPhase[] = [];
  private frameUnsubscribe: (() => void) | null = null;
  private cleanupListeners: Array<() => void> = [];
  private responseResolver: ((value: ReactionResponseCapture | null) => void) | null = null;
  private responsePromise: Promise<ReactionResponseCapture | null> | null = null;
  private responseEnabled = false;
  private stimulusOnsetTime: number | null = null;
  private stimulusTimingMethod: TimingMethod = 'performance.now';
  private pendingStimulusOnsetMark = false;

  private readonly gatekeeper?: TimingGatekeeper;
  private gatekeeperRan = false;

  private readonly imageCache = new Map<string, HTMLImageElement>();
  private readonly videoCache = new Map<string, HTMLVideoElement>();
  private readonly audioCache = new Map<string, HTMLAudioElement>();
  private readonly audioBufferCache = new Map<string, AudioBuffer>();
  private audioContext: AudioContext | null = null;

  constructor(options: ReactionEngineOptions) {
    this.canvas = options.canvas;
    this.eventTarget = options.eventTarget || document;
    this.hooks = options.hooks;

    this.gatekeeper = options.gatekeeper;

    if (options.renderer) {
      this.renderer = options.renderer;
      this.ownsRenderer = false;
    } else {
      this.renderer = new WebGLRenderer({
        canvas: this.canvas,
        targetFPS: 120,
        vsync: true,
        antialias: false,
      });
      this.ownsRenderer = true;
    }
  }

  public setEventTarget(target: Document | HTMLElement): void {
    this.eventTarget = target;
  }

  /**
   * Seed internal media caches from a ResourceManager that has already
   * preloaded assets. This eliminates on-demand network fetches during
   * trials, which would otherwise add 10-500ms latency and destroy
   * frame-exact stimulus onset timing.
   */
  public seedFromResourceManager(rm: ResourceManager): void {
    for (const [key, img] of rm.getImageCache()) {
      if (!this.imageCache.has(key)) {
        this.imageCache.set(key, img);
      }
    }

    for (const [key, video] of rm.getVideoCache()) {
      if (!this.videoCache.has(key)) {
        this.videoCache.set(key, video);
      }
    }

    // ResourceManager stores AudioBuffer objects — seed our audioBufferCache
    // so the AudioContext path can reuse them without re-fetching/decoding.
    for (const [key, buffer] of rm.getAudioBufferCache()) {
      if (!this.audioBufferCache.has(key)) {
        this.audioBufferCache.set(key, buffer);
      }
    }
  }

  /**
   * Pre-warm the cache for a batch of stimuli that will be used in an
   * upcoming block of trials. Call this before the first trial in a block
   * to ensure all media is loaded and ready.
   */
  public async warmUpStimuli(stimuli: ReactionStimulusConfig[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const stimulus of stimuli) {
      if (stimulus.kind === 'image' && !this.imageCache.has(stimulus.src)) {
        promises.push(
          this.loadImage(stimulus.src).then((img) => {
            if (img) this.imageCache.set(stimulus.src, img);
          })
        );
      }
      if (stimulus.kind === 'video' && !this.videoCache.has(stimulus.src)) {
        promises.push(
          this.loadVideo(stimulus.src).then((video) => {
            if (video) this.videoCache.set(stimulus.src, video);
          })
        );
      }
      if (stimulus.kind === 'audio' && !this.audioCache.has(stimulus.src)) {
        promises.push(
          this.loadAudio(stimulus.src).then((audio) => {
            if (audio) this.audioCache.set(stimulus.src, audio);
          })
        );
      }
    }

    await Promise.all(promises);
  }

  public schedulePhase(phase: ScheduledPhase): void {
    this.scheduledPhases.push(phase);
  }

  public clearScheduledPhases(): void {
    this.scheduledPhases = [];
  }

  public markStimulusOnset(): void {
    this.pendingStimulusOnsetMark = true;
  }

  public async runTrial(
    config: ReactionTrialConfig,
    signal?: AbortSignal
  ): Promise<ReactionTrialResult> {
    this.renderer.setTargetFPS(config.targetFPS || 120);
    this.renderer.setVSync(config.vsync ?? true);
    this.renderer.setBackgroundColor(config.backgroundColor || [0, 0, 0, 1]);
    this.renderer.clearRenderables();

    // Run device qualification before the first trial if a gatekeeper is provided.
    if (this.gatekeeper && !this.gatekeeperRan) {
      await this.gatekeeper.qualify();
      this.gatekeeperRan = true;
    }

    this.responseEnabled = false;
    this.pendingStimulusOnsetMark = false;
    this.stimulusOnsetTime = null;
    this.stimulusTimingMethod = 'performance.now';

    const startedAt = performance.now();
    const frameLog: FrameSample[] = [];
    const timeline: ReactionPhaseMark[] = [];

    this.subscribeFrameLogging(frameLog);
    this.setupResponseCapture(config, signal);

    if (this.ownsRenderer) {
      this.renderer.start();
    }

    try {
      await this.runFixation(config, timeline, signal);
      await this.runPreStimulusDelay(config, timeline, signal);

      const stimulusCleanup = await this.runStimulus(config, timeline, signal);

      const timeoutMs = config.responseTimeoutMs ?? 2000;
      const waitResult = await this.waitForResponse(timeoutMs, signal);

      const response = waitResult.response;
      const timeout = waitResult.timeout;

      if (config.stimulusDurationMs && config.stimulusDurationMs > 0) {
        await this.wait(config.stimulusDurationMs, signal);
      }

      stimulusCleanup();

      for (const phase of this.scheduledPhases) {
        await this.runScheduledPhase(phase, timeline, signal);
      }

      if (config.interTrialIntervalMs && config.interTrialIntervalMs > 0) {
        const closePhase = this.openPhase('inter-trial', timeline);
        await this.wait(config.interTrialIntervalMs, signal);
        closePhase();
      }

      const isCorrect = this.evaluateCorrectness(config, response);

      return {
        trialId: config.id,
        startedAt,
        stimulusOnsetTime: this.stimulusOnsetTime,
        stimulusTimingMethod: this.stimulusTimingMethod,
        response,
        isCorrect,
        timeout,
        frameLog,
        phaseTimeline: timeline,
        stats: this.renderer.getStats(),
      };
    } finally {
      this.cleanupRuntimeState();
      this.renderer.clearRenderables();
    }
  }

  public destroy(): void {
    this.cleanupRuntimeState();
    this.renderer.clearRenderables();
    if (this.ownsRenderer) {
      this.renderer.destroy();
    }
    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.audioBufferCache.clear();
  }

  private runFixation(
    config: ReactionTrialConfig,
    timeline: ReactionPhaseMark[],
    signal?: AbortSignal
  ) {
    const fixation = config.fixation;
    const enabled = fixation?.enabled ?? false;
    const duration = fixation?.durationMs ?? 0;

    if (!enabled || duration <= 0) {
      return Promise.resolve();
    }

    const closePhase = this.openPhase('fixation', timeline);
    const fixationType = fixation?.type || 'cross';
    const fixationColor = fixation?.color || [1, 1, 1, 1];
    const fixationSize = fixation?.sizePx || 20;

    const fixationRenderable = this.createFixationRenderable(
      fixationType,
      fixationColor,
      fixationSize
    );
    this.renderer.addRenderable(fixationRenderable);

    return this.wait(duration, signal).finally(() => {
      this.renderer.removeRenderable(fixationRenderable.id);
      closePhase();
    });
  }

  private async runPreStimulusDelay(
    config: ReactionTrialConfig,
    timeline: ReactionPhaseMark[],
    signal?: AbortSignal
  ): Promise<void> {
    const delay = config.preStimulusDelayMs || 0;
    if (delay <= 0) return;

    const closePhase = this.openPhase('pre-stimulus-delay', timeline);
    this.responseEnabled = Boolean(config.allowResponseDuringPreStimulus);
    await this.wait(delay, signal);
    this.responseEnabled = false;
    closePhase();
  }

  private async runStimulus(
    config: ReactionTrialConfig,
    timeline: ReactionPhaseMark[],
    signal?: AbortSignal
  ): Promise<() => void> {
    const closePhase = this.openPhase('stimulus', timeline);
    const cleanupCallbacks: Array<() => void> = [closePhase];

    this.pendingStimulusOnsetMark = true;
    this.responseEnabled = true;

    const renderable = await this.createStimulusRenderable(config.stimulus, signal);
    if (renderable) {
      this.renderer.addRenderable(renderable);
      cleanupCallbacks.push(() => this.renderer.removeRenderable(renderable.id));
    } else {
      this.setStimulusOnset(performance.now());
    }

    return () => {
      this.responseEnabled = false;
      cleanupCallbacks.forEach((callback) => callback());
    };
  }

  private async runScheduledPhase(
    phase: ScheduledPhase,
    timeline: ReactionPhaseMark[],
    signal?: AbortSignal
  ): Promise<void> {
    if (phase.durationMs <= 0) return;

    const closePhase = this.openPhase(phase.name, timeline);
    this.responseEnabled = Boolean(phase.allowResponse);

    if (phase.marksStimulusOnset) {
      this.setStimulusOnset(performance.now());
    }

    await this.wait(phase.durationMs, signal);
    this.responseEnabled = false;
    closePhase();
  }

  private openPhase(name: string, timeline: ReactionPhaseMark[]): () => void {
    const startTime = performance.now();
    this.hooks?.onPhaseChange?.(name, startTime);

    return () => {
      timeline.push({
        name,
        startTime,
        endTime: performance.now(),
      });
    };
  }

  private subscribeFrameLogging(frameLog: FrameSample[]): void {
    this.frameUnsubscribe?.();
    this.frameUnsubscribe = this.renderer.onFrame((sample, stats) => {
      frameLog.push(sample);
      this.hooks?.onFrame?.(sample, stats);

      if (this.pendingStimulusOnsetMark && sample.presented) {
        this.setStimulusOnset(sample.now);
      }
    });
  }

  private setupResponseCapture(config: ReactionTrialConfig, signal?: AbortSignal): void {
    this.responsePromise = new Promise<ReactionResponseCapture | null>((resolve) => {
      this.responseResolver = resolve;
    });

    const mode = config.responseMode || 'keyboard';

    if (mode === 'keyboard') {
      const allowedKeys = new Set((config.validKeys || []).map((key) => key.toLowerCase()));
      const handler = (event: KeyboardEvent) => {
        if (!this.responseEnabled) return;

        const key = event.key.toLowerCase();
        if (allowedKeys.size > 0 && !allowedKeys.has(key)) return;

        const { time, method } = this.getEventTime(event);
        this.resolveResponse({
          source: 'keyboard',
          value: key,
          timestamp: time,
          reactionTimeMs: this.computeReactionTime(time),
          timingMethod: method,
        });
      };

      this.eventTarget.addEventListener('keydown', handler as EventListener);
      this.cleanupListeners.push(() =>
        this.eventTarget.removeEventListener('keydown', handler as EventListener)
      );
    }

    if (mode === 'mouse') {
      const handler = (event: MouseEvent) => {
        if (!this.responseEnabled) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;

        const { time, method } = this.getEventTime(event);
        this.resolveResponse({
          source: 'mouse',
          value: { x, y },
          timestamp: time,
          reactionTimeMs: this.computeReactionTime(time),
          timingMethod: method,
        });
      };

      this.canvas.addEventListener('click', handler);
      this.cleanupListeners.push(() => this.canvas.removeEventListener('click', handler));
    }

    if (mode === 'touch') {
      const handler = (event: TouchEvent) => {
        if (!this.responseEnabled) return;

        const touch = event.touches[0];
        if (!touch) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;

        const { time, method } = this.getEventTime(event);
        this.resolveResponse({
          source: 'touch',
          value: { x, y },
          timestamp: time,
          reactionTimeMs: this.computeReactionTime(time),
          timingMethod: method,
        });
      };

      this.canvas.addEventListener('touchstart', handler);
      this.cleanupListeners.push(() => this.canvas.removeEventListener('touchstart', handler));
    }

    if (signal) {
      const abortListener = () => this.resolveResponse(null);
      signal.addEventListener('abort', abortListener, { once: true });
      this.cleanupListeners.push(() => signal.removeEventListener('abort', abortListener));
    }
  }

  private resolveResponse(response: ReactionResponseCapture | null): void {
    if (!this.responseResolver) return;

    if (response) {
      this.hooks?.onResponse?.(response);
    }

    this.responseResolver(response);
    this.responseResolver = null;
  }

  private waitForResponse(timeoutMs: number, signal?: AbortSignal): Promise<ResponseWaitResult> {
    if (!this.responsePromise) {
      return Promise.resolve({ response: null, timeout: true });
    }

    return new Promise<ResponseWaitResult>((resolve, reject) => {
      let settled = false;

      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        this.resolveResponse(null);
        resolve({ response: null, timeout: true });
      }, timeoutMs);

      const finish = (response: ReactionResponseCapture | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve({ response, timeout: response === null });
      };

      this.responsePromise?.then(finish).catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      });

      if (signal) {
        const onAbort = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          this.resolveResponse(null);
          resolve({ response: null, timeout: true });
        };
        signal.addEventListener('abort', onAbort, { once: true });
        this.cleanupListeners.push(() => signal.removeEventListener('abort', onAbort));
      }
    });
  }

  private evaluateCorrectness(
    config: ReactionTrialConfig,
    response: ReactionResponseCapture | null
  ): boolean | null {
    if (!config.requireCorrect) {
      return null;
    }

    if (!config.correctResponse) {
      return response !== null;
    }

    if (!response) {
      return false;
    }

    const expected = config.correctResponse.toLowerCase();
    if (typeof response.value === 'string') {
      return response.value.toLowerCase() === expected;
    }

    return false;
  }

  private computeReactionTime(timestamp: number): number {
    if (this.stimulusOnsetTime == null) {
      return 0;
    }
    return Math.max(0, timestamp - this.stimulusOnsetTime);
  }

  private setStimulusOnset(timestamp: number, method: TimingMethod = 'performance.now'): void {
    if (this.stimulusOnsetTime != null) return;
    this.stimulusOnsetTime = timestamp;
    this.stimulusTimingMethod = method;
    this.pendingStimulusOnsetMark = false;
    this.renderer.markStimulusOnset();
  }

  /**
   * Extract high-resolution timestamp from an input event.
   * Uses event.timeStamp (DOMHighResTimeStamp) when available and valid,
   * falling back to performance.now().
   */
  private getEventTime(event: Event): { time: number; method: TimingMethod } {
    if (event.timeStamp > 0) {
      return { time: event.timeStamp, method: 'event.timeStamp' };
    }
    return { time: performance.now(), method: 'performance.now' };
  }

  private createFixationRenderable(
    type: 'cross' | 'dot',
    color: RGBAColor,
    sizePx: number
  ): Renderable {
    return {
      id: 'reaction-fixation',
      layer: 100,
      render: (_gl, context) => {
        const x = context.width / 2;
        const y = context.height / 2;

        if (type === 'dot') {
          this.renderer.executeCommand({
            type: 'drawCircle',
            params: { x, y, radius: Math.max(1, sizePx / 4), color },
          });
          return;
        }

        this.renderer.executeCommand({
          type: 'drawRect',
          params: {
            x: x - sizePx,
            y: y - 1,
            width: sizePx * 2,
            height: 2,
            color,
          },
        });

        this.renderer.executeCommand({
          type: 'drawRect',
          params: {
            x: x - 1,
            y: y - sizePx,
            width: 2,
            height: sizePx * 2,
            color,
          },
        });
      },
    };
  }

  private async createStimulusRenderable(
    stimulus: ReactionStimulusConfig,
    signal?: AbortSignal
  ): Promise<Renderable | null> {
    const id = stimulus.id || 'reaction-stimulus';

    if (stimulus.kind === 'shape') {
      return {
        id,
        layer: 50,
        render: (_gl, context) => this.drawShapeStimulus(stimulus, context.width, context.height),
      };
    }

    if (stimulus.kind === 'text') {
      const textCanvas = this.createTextCanvas(
        stimulus.text,
        stimulus.fontPx || 64,
        stimulus.fontFamily || 'Arial',
        stimulus.color || [1, 1, 1, 1]
      );
      return {
        id,
        layer: 50,
        render: (_gl, context) => {
          const { x, y, width, height } = this.resolveBounds(
            stimulus.position,
            context.width,
            context.height,
            textCanvas.width,
            textCanvas.height
          );
          this.renderer.executeCommand({
            type: 'drawTexture',
            params: {
              texture: textCanvas,
              x,
              y,
              width,
              height,
            },
          });
        },
      };
    }

    if (stimulus.kind === 'image') {
      const image = await this.loadImage(stimulus.src, signal);
      if (!image) return null;
      return {
        id,
        layer: 50,
        render: (_gl, context) => {
          const { x, y, width, height } = this.resolveBounds(
            stimulus.position,
            context.width,
            context.height,
            stimulus.widthPx || image.width,
            stimulus.heightPx || image.height
          );

          this.renderer.executeCommand({
            type: 'drawTexture',
            params: {
              texture: image,
              x,
              y,
              width,
              height,
            },
          });
        },
      };
    }

    if (stimulus.kind === 'video') {
      const video = await this.loadVideo(stimulus.src, signal);
      if (!video) return null;

      // Use requestVideoFrameCallback for precise onset timing when available.
      // This gives us the compositor's presentationTime which is more accurate
      // than RAF timestamps for video frames (~1 frame vs ~1-2 frames).
      if ('requestVideoFrameCallback' in video) {
        (video as HTMLVideoElement).requestVideoFrameCallback((_now, metadata) => {
          this.setStimulusOnset(metadata.presentationTime, 'rvfc');
        });
      }
      // If rVFC is unavailable, the existing RAF-based onset detection
      // (pendingStimulusOnsetMark) handles it in subscribeFrameLogging.

      if (stimulus.autoplay !== false) {
        void video.play().catch(() => {
          // Ignore autoplay restrictions.
        });
      }

      return {
        id,
        layer: 50,
        render: (_gl, context) => {
          const { x, y, width, height } = this.resolveBounds(
            stimulus.position,
            context.width,
            context.height,
            stimulus.widthPx || video.videoWidth || 640,
            stimulus.heightPx || video.videoHeight || 360
          );

          this.renderer.executeCommand({
            type: 'drawTexture',
            params: {
              texture: video,
              x,
              y,
              width,
              height,
            },
          });
        },
      };
    }

    if (stimulus.kind === 'audio') {
      const volume = Math.max(0, Math.min(1, stimulus.volume ?? 1));

      // Try AudioContext path for precise onset timing. AudioContext.currentTime
      // is driven by the audio hardware clock and gives sub-millisecond precision
      // for when audio actually reaches the DAC.
      if (stimulus.autoplay !== false) {
        const played = await this.playAudioViaContext(stimulus.src, volume, signal);
        if (played) return null;
      }

      // Fallback to HTMLAudioElement when AudioContext is unavailable or fails.
      const audio = await this.loadAudio(stimulus.src, signal);
      if (!audio) return null;

      audio.volume = volume;
      if (stimulus.autoplay !== false) {
        void audio.play().catch(() => {
          // Ignore autoplay restrictions.
        });
      }

      this.setStimulusOnset(performance.now());
      return null;
    }

    if (stimulus.kind === 'custom') {
      return {
        id,
        layer: 50,
        render: (_gl, context) => {
          this.renderer.executeCommand({
            type: 'customShader',
            params: {
              shader: stimulus.shader,
              vertices: stimulus.vertices,
              uniforms: {
                ...(stimulus.uniforms || {}),
                time: context.stimulusTime / 1000,
                resolution: [context.width, context.height],
              },
            },
          });
        },
      };
    }

    return null;
  }

  private drawShapeStimulus(
    stimulus: Extract<ReactionStimulusConfig, { kind: 'shape' }>,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    const color = stimulus.color || [1, 1, 1, 1];
    const position = stimulus.position || { x: 0.5, y: 0.5 };
    const x = position.x <= 1 ? position.x * viewportWidth : position.x;
    const y = position.y <= 1 ? position.y * viewportHeight : position.y;

    if (stimulus.shape === 'circle') {
      this.renderer.executeCommand({
        type: 'drawCircle',
        params: {
          x,
          y,
          radius: stimulus.radiusPx || Math.min(viewportWidth, viewportHeight) * 0.08,
          color,
        },
      });
      return;
    }

    if (stimulus.shape === 'triangle') {
      const size = stimulus.widthPx || Math.min(viewportWidth, viewportHeight) * 0.14;
      this.renderer.executeCommand({
        type: 'drawTriangle',
        params: {
          x1: x,
          y1: y - size / 2,
          x2: x - size / 2,
          y2: y + size / 2,
          x3: x + size / 2,
          y3: y + size / 2,
          color,
        },
      });
      return;
    }

    const width = stimulus.widthPx || Math.min(viewportWidth, viewportHeight) * 0.16;
    const height =
      stimulus.shape === 'square'
        ? width
        : stimulus.heightPx || Math.min(viewportWidth, viewportHeight) * 0.12;

    this.renderer.executeCommand({
      type: 'drawRect',
      params: {
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
        color,
      },
    });
  }

  private createTextCanvas(
    text: string,
    fontPx: number,
    fontFamily: string,
    color: RGBAColor
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return canvas;

    context.font = `${fontPx}px ${fontFamily}`;
    const metrics = context.measureText(text);
    const padding = 24;

    canvas.width = Math.ceil(metrics.width + padding * 2);
    canvas.height = Math.ceil(fontPx * 1.6 + padding * 2);

    const drawContext = canvas.getContext('2d');
    if (!drawContext) return canvas;

    drawContext.clearRect(0, 0, canvas.width, canvas.height);
    drawContext.font = `${fontPx}px ${fontFamily}`;
    drawContext.textAlign = 'center';
    drawContext.textBaseline = 'middle';
    drawContext.fillStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;
    drawContext.fillText(text, canvas.width / 2, canvas.height / 2);

    return canvas;
  }

  private resolveBounds(
    position: { x: number; y: number } | undefined,
    viewportWidth: number,
    viewportHeight: number,
    preferredWidth: number,
    preferredHeight: number
  ): { x: number; y: number; width: number; height: number } {
    const pos = position || { x: 0.5, y: 0.5 };
    const centerX = pos.x <= 1 ? pos.x * viewportWidth : pos.x;
    const centerY = pos.y <= 1 ? pos.y * viewportHeight : pos.y;

    return {
      x: centerX - preferredWidth / 2,
      y: centerY - preferredHeight / 2,
      width: preferredWidth,
      height: preferredHeight,
    };
  }

  private async loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
    if (this.imageCache.has(src)) {
      return this.imageCache.get(src)!;
    }

    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        this.imageCache.set(src, image);
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = src;

      if (signal) {
        const abort = () => resolve(null);
        signal.addEventListener('abort', abort, { once: true });
      }
    });
  }

  private async loadVideo(src: string, signal?: AbortSignal): Promise<HTMLVideoElement | null> {
    if (this.videoCache.has(src)) {
      return this.videoCache.get(src)!;
    }

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = src;
      video.crossOrigin = 'anonymous';
      video.playsInline = true;
      video.muted = true;

      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
      };

      const onLoaded = () => {
        cleanup();
        this.videoCache.set(src, video);
        resolve(video);
      };

      const onError = () => {
        cleanup();
        resolve(null);
      };

      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('error', onError);
      video.load();

      if (signal) {
        const abort = () => {
          cleanup();
          resolve(null);
        };
        signal.addEventListener('abort', abort, { once: true });
      }
    });
  }

  /**
   * Get or create a shared AudioContext. Lazily initialized because
   * AudioContext creation may require user gesture on some browsers.
   */
  private getOrCreateAudioContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext;
    try {
      const Ctor = globalThis.AudioContext ||
        (globalThis as Record<string, unknown>).webkitAudioContext as typeof AudioContext | undefined;
      if (!Ctor) return null;
      this.audioContext = new Ctor();
      return this.audioContext;
    } catch {
      return null;
    }
  }

  /**
   * Play audio through the Web Audio API for precise onset timing.
   *
   * AudioContext.currentTime is driven by the audio hardware clock and
   * provides sub-millisecond accuracy for when audio reaches the DAC.
   * We convert this to the performance.now() domain so reaction times
   * remain comparable across timing methods.
   *
   * Returns true if playback was successfully initiated via AudioContext.
   */
  private async playAudioViaContext(
    src: string,
    volume: number,
    signal?: AbortSignal
  ): Promise<boolean> {
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return false;

    // Resume context if suspended (requires user gesture on first call).
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }

    try {
      const buffer = await this.decodeAudioBuffer(ctx, src, signal);
      if (!buffer) return false;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(ctx.destination);

      // Record the precise mapping between AudioContext and performance.now()
      // clocks right before starting playback, to minimize clock-drift error.
      const perfNowAtSchedule = performance.now();
      const ctxTimeAtSchedule = ctx.currentTime;

      // Schedule immediate playback.
      source.start(0);

      // Convert the AudioContext start time to performance.now() domain.
      // The source starts at ctxTimeAtSchedule (or very close to it since
      // we passed 0 for "now"). The onset in perf time is:
      //   perfNowAtSchedule + (actualStartCtxTime - ctxTimeAtSchedule) * 1000
      // Since we start at ctx.currentTime, the delta is ~0.
      const onsetPerfTime = perfNowAtSchedule +
        (ctx.currentTime - ctxTimeAtSchedule) * 1000;

      this.setStimulusOnset(onsetPerfTime, 'audioContext');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch and decode audio data into an AudioBuffer, with caching.
   */
  private async decodeAudioBuffer(
    ctx: AudioContext,
    src: string,
    signal?: AbortSignal
  ): Promise<AudioBuffer | null> {
    if (this.audioBufferCache.has(src)) {
      return this.audioBufferCache.get(src)!;
    }

    try {
      const response = await fetch(src, { signal });
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.audioBufferCache.set(src, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }

  private async loadAudio(src: string, signal?: AbortSignal): Promise<HTMLAudioElement | null> {
    if (this.audioCache.has(src)) {
      return this.audioCache.get(src)!;
    }

    return new Promise((resolve) => {
      const audio = new Audio(src);
      audio.preload = 'auto';

      const cleanup = () => {
        audio.removeEventListener('canplaythrough', onLoaded);
        audio.removeEventListener('error', onError);
      };

      const onLoaded = () => {
        cleanup();
        this.audioCache.set(src, audio);
        resolve(audio);
      };

      const onError = () => {
        cleanup();
        resolve(null);
      };

      audio.addEventListener('canplaythrough', onLoaded);
      audio.addEventListener('error', onError);
      audio.load();

      if (signal) {
        const abort = () => {
          cleanup();
          resolve(null);
        };
        signal.addEventListener('abort', abort, { once: true });
      }
    });
  }

  private wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => resolve(), ms);

      if (signal) {
        const abort = () => {
          clearTimeout(timeoutId);
          reject(new DOMException('Operation aborted', 'AbortError'));
        };

        signal.addEventListener('abort', abort, { once: true });
        this.cleanupListeners.push(() => signal.removeEventListener('abort', abort));
      }
    });
  }

  private cleanupRuntimeState(): void {
    this.frameUnsubscribe?.();
    this.frameUnsubscribe = null;

    this.cleanupListeners.forEach((cleanup) => cleanup());
    this.cleanupListeners = [];

    this.responseEnabled = false;
    this.responseResolver = null;
    this.responsePromise = null;
    this.pendingStimulusOnsetMark = false;
  }
}
