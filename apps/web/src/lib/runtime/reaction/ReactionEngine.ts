/**
 * ReactionEngine — Frame-exact reaction time measurement.
 *
 * Provides sub-millisecond precision through:
 * - Stimulus onset: RAF callbacks (visual), requestVideoFrameCallback (video),
 *   AudioContext.currentTime + output latency (audio)
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
  ReactionResponseMode,
  ReactionTrialConfig,
  ReactionTrialResult,
  ReactionTrialProvenance,
  ScheduledPhase,
  ReactionPhaseMark,
  ReactionRenderErrorInfo,
  ReactionStimulusConfig,
  TimingMethod,
  VideoFrameSample,
} from './types';
import { computeReactionTimeMs, computeSignedReactionTimeMs } from '../core/reactionTiming';

/** Max number of video frames retained in the per-trial reconstruction ring. */
const VIDEO_FRAME_RING_MAX = 240;
/**
 * If requestVideoFrameCallback has not owned the onset within this many
 * presented raf frames, the raf clock takes over (rVFC is unavailable or slow).
 */
const VIDEO_ONSET_RAF_FALLBACK_FRAMES = 2;

interface ReactionEngineOptions {
  canvas: HTMLCanvasElement;
  renderer?: WebGLRenderer;
  hooks?: ReactionEngineHooks;
  eventTarget?: Document | HTMLElement;
  /** Optional gatekeeper for device qualification before first trial. */
  gatekeeper?: ReactionGatekeeper;
  /**
   * Injectable high-resolution clock. Defaults to `performance.now`. Exposed so
   * the deterministic test harness can drive onset/response timing without wall
   * clock flakiness.
   */
  clock?: () => number;
}

/**
 * The gatekeeper's display-latency accessor (CONTRACT-CAL). Declared as an
 * optional structural shape so the engine compiles against the method name even
 * before the wiring slice adds it to `TimingGatekeeper`, and degrades to 0 at
 * runtime when the method is absent.
 */
interface DisplayLatencyProvider {
  getEstimatedDisplayLatencyMs(): number;
}

/**
 * The only surface the engine needs from a gatekeeper (CONTRACT-CAL): run
 * qualification once, then read the measured display latency. Typed structurally
 * (not as the concrete `TimingGatekeeper`) so tests can inject a light mock.
 */
interface ReactionGatekeeper {
  qualify(force?: boolean): Promise<unknown>;
  getEstimatedDisplayLatencyMs(): number;
}

/**
 * The optional error surface the engine subscribes to (CONTRACT-ERR). Declared
 * structurally — not as a method on the concrete `WebGLRenderer` — so the engine
 * compiles before the WebGLRenderer slice adds `onError`, and degrades to a
 * no-op at runtime when the method is absent (older/stub renderers).
 */
interface RendererErrorSource {
  onError(callback: (info: ReactionRenderErrorInfo) => void): () => void;
}

interface ResponseWaitResult {
  response: ReactionResponseCapture | null;
  timeout: boolean;
}

/** Controls the lifetime of the currently-shown stimulus renderable. */
interface StimulusHandle {
  /** Remove the visual stimulus and record its offset. Idempotent. */
  removeStimulus: () => void;
  /** Close the stimulus phase, disable responses, ensure the visual is removed. */
  finish: () => void;
}

/** Arguments for the single onset-recording entry point. */
interface RecordOnsetOptions {
  /** Raw onset in the source clock (raf time, rVFC expectedDisplayTime, …). */
  raw: number;
  method: TimingMethod;
  /** Display-latency to add to `raw` (visual/raf onsets only). */
  displayLatencyMs?: number;
  /** Output/DAC latency folded into `raw` (audio onsets only; provenance). */
  outputLatencyMs?: number;
  /** Marks the onset as produced by a degraded fallback path. */
  degraded?: boolean;
  /** Bypass the first-wins guard (used by the `marksStimulusOnset` reset). */
  force?: boolean;
}

export class ReactionEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly ownsRenderer: boolean;
  private readonly hooks?: ReactionEngineHooks;
  private eventTarget: Document | HTMLElement;
  private readonly now: () => number;

  private scheduledPhases: ScheduledPhase[] = [];
  private frameUnsubscribe: (() => void) | null = null;
  private cleanupListeners: Array<() => void> = [];
  private responseResolver: ((value: ReactionResponseCapture | null) => void) | null = null;
  private responsePromise: Promise<ReactionResponseCapture | null> | null = null;
  private responseEnabled = false;

  // Onset state.
  private stimulusOnsetTime: number | null = null;
  private stimulusOnsetRaw: number | null = null;
  private stimulusOffsetTime: number | null = null;
  private stimulusTimingMethod: TimingMethod = 'performance.now';
  private onsetDisplayLatencyMs: number | undefined = undefined;
  private onsetOutputLatencyMs: number | undefined = undefined;
  private onsetDegraded = false;
  /** Measured display latency from the gatekeeper; applied to visual onset only. */
  private displayLatencyMs = 0;
  /** Armed when the next presented frame should stamp the (visual) raf onset. */
  private pendingStimulusOnsetMark = false;

  // False-start (anticipatory response) state.
  private anticipatory = false;
  private falseStartCount = 0;
  private firstFalseStartTime: number | null = null;

  // Video onset state.
  private awaitingVideoOnset = false;
  private videoOnsetFramesWaited = 0;
  private videoFrameRing: VideoFrameSample[] = [];
  private rvfcHandle: number | null = null;
  private rvfcVideo: HTMLVideoElement | null = null;

  // Concurrent stimulus-duration timer (3.2).
  private stimulusDurationTimerId: number | null = null;

  // Render-error abort state (4.1, CONTRACT-ERR). When the renderer reports a
  // texture-upload failure during a trial the stimulus is blank, so the trial is
  // aborted and its result marked invalid rather than timing an RT against
  // nothing. Subscription is per-trial; `renderErrorUnsubscribe` tears it down.
  private renderErrorUnsubscribe: (() => void) | null = null;
  private renderErrorDuringTrial = false;
  private renderErrorReason: string | null = null;

  // Single reusable text canvas (4.5). createTextCanvas previously minted a new
  // canvas per trial, each spawning a distinct GPU texture that accumulated in
  // the renderer's cache until destroy(). Reusing one canvas keeps the renderer
  // to a single text texture (keyed on the canvas identity) across a long block.
  private textCanvas: HTMLCanvasElement | null = null;

  private readonly gatekeeper?: ReactionGatekeeper;
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
    this.now = options.clock ?? (() => performance.now());

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
   * Lazily create and resume the shared AudioContext (CONTRACT-AUDIO). Safe to
   * call from a user-gesture handler (the consent/continue button) so the first
   * audio trial does not trip the browser autoplay policy or block on
   * create/resume mid-trial. All errors are swallowed.
   */
  public async primeAudio(): Promise<void> {
    try {
      const ctx = this.getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch {
      // Priming is best-effort; a failure here is recovered from per-trial.
    }
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
   *
   * Audio is decoded into the AudioContext buffer cache (`audioBufferCache`) —
   * the path the primary `audioContext` playback reads — so the first audio
   * trial never fetches/decodes mid-trial (CONTRACT-AUDIO). Only when no
   * AudioContext is available do we warm the HTMLAudioElement fallback cache.
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
      if (stimulus.kind === 'audio' && !this.audioBufferCache.has(stimulus.src)) {
        const ctx = this.getOrCreateAudioContext();
        if (ctx) {
          // Decode into the AudioContext buffer cache (the primary playback path).
          promises.push(this.decodeAudioBuffer(ctx, stimulus.src).then(() => undefined));
        } else if (!this.audioCache.has(stimulus.src)) {
          // No Web Audio available — warm the HTMLAudio fallback instead.
          promises.push(
            this.loadAudio(stimulus.src).then((audio) => {
              if (audio) this.audioCache.set(stimulus.src, audio);
            })
          );
        }
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

  /** Arm the visual (raf) onset detector; the next presented frame stamps onset. */
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

    // Run device qualification before the first trial if a gatekeeper is provided,
    // then read the measured display latency (CONTRACT-CAL). Applied to visual
    // (raf) onset only; video/audio use their own clocks and are not shifted.
    if (this.gatekeeper && !this.gatekeeperRan) {
      await this.gatekeeper.qualify();
      this.gatekeeperRan = true;
      const provider = this.gatekeeper as unknown as Partial<DisplayLatencyProvider>;
      this.displayLatencyMs =
        typeof provider.getEstimatedDisplayLatencyMs === 'function'
          ? provider.getEstimatedDisplayLatencyMs()
          : 0;
    }

    this.resetTrialState();

    // Free this trial's per-trial GPU textures (image/video/text) on exit so they
    // don't accumulate across a long block (4.5). Marker taken before the stimulus
    // is created; everything uploaded after it is released in the finally.
    const textureMarker = this.renderer.markTextures?.() ?? 0;

    const startedAt = this.now();
    const frameLog: FrameSample[] = [];
    const timeline: ReactionPhaseMark[] = [];

    this.subscribeFrameLogging(frameLog);
    this.setupResponseCapture(config, signal);
    this.subscribeRenderErrors();

    if (this.ownsRenderer) {
      this.renderer.start();
    }

    try {
      await this.runFixation(config, timeline, signal);
      await this.runPreStimulusDelay(config, timeline, signal);

      const stimulus = await this.runStimulus(config, timeline, signal);

      // 3.2: run the stimulus-duration timer CONCURRENTLY with the response
      // window. When the duration elapses we remove the visual stimulus (and
      // record the offset) but keep the response window open until
      // responseTimeoutMs — the stimulus is shown for stimulusDurationMs, not
      // "response time + stimulusDurationMs".
      if (config.stimulusDurationMs && config.stimulusDurationMs > 0) {
        this.stimulusDurationTimerId = window.setTimeout(() => {
          this.stimulusDurationTimerId = null;
          stimulus.removeStimulus();
        }, config.stimulusDurationMs);
      }

      const timeoutMs = config.responseTimeoutMs ?? 2000;
      const waitResult = await this.waitForResponse(timeoutMs, signal);

      // 4.1: a render error mid-trial (blank stimulus) invalidates the trial — the
      // captured timestamp, if any, was measured against nothing shown, so it is
      // discarded and no RT is reported.
      const invalid = this.renderErrorDuringTrial;
      const response = invalid ? null : waitResult.response;
      const timeout = invalid ? true : waitResult.timeout;

      // Response window closed: cancel the pending duration timer (no leak) and
      // finish the stimulus phase (disables responses, removes the renderable if
      // it is still on screen, recording the offset if not already removed).
      if (this.stimulusDurationTimerId != null) {
        clearTimeout(this.stimulusDurationTimerId);
        this.stimulusDurationTimerId = null;
      }
      stimulus.finish();

      // Aborted trials skip the tail phases — there is nothing left to measure.
      if (!invalid) {
        for (const phase of this.scheduledPhases) {
          await this.runScheduledPhase(phase, timeline, signal);
        }

        if (config.interTrialIntervalMs && config.interTrialIntervalMs > 0) {
          const closePhase = this.openPhase('inter-trial', timeline);
          await this.wait(config.interTrialIntervalMs, signal);
          closePhase();
        }
      }

      const isCorrect = invalid ? null : this.evaluateCorrectness(config, response);
      const stats = this.renderer.getStats();

      const provenance: ReactionTrialProvenance = {
        onsetMethod: this.stimulusTimingMethod,
        responseMethod: response?.timingMethod ?? null,
        displayLatencyMs: this.onsetDisplayLatencyMs,
        outputLatencyMs: this.onsetOutputLatencyMs,
        rawRtMs: response?.rawRtMs ?? null,
        anticipatory: this.anticipatory,
        falseStart: this.falseStartCount > 0,
        falseStartCount: this.falseStartCount,
        degraded: this.onsetDegraded,
        frameStats: {
          fps: stats.fps,
          droppedFrames: stats.droppedFrames,
          jitter: stats.jitter,
        },
        videoFrames: this.videoFrameRing.length > 0 ? [...this.videoFrameRing] : undefined,
      };

      return {
        trialId: config.id,
        startedAt,
        stimulusOnsetTime: this.stimulusOnsetTime,
        stimulusOnsetRawTime: this.stimulusOnsetRaw,
        stimulusOffsetTime: this.stimulusOffsetTime,
        stimulusTimingMethod: this.stimulusTimingMethod,
        displayLatencyMs: this.onsetDisplayLatencyMs,
        outputLatencyMs: this.onsetOutputLatencyMs,
        anticipatory: this.anticipatory,
        falseStart: this.falseStartCount > 0,
        falseStartCount: this.falseStartCount,
        videoFrames: [...this.videoFrameRing],
        response,
        isCorrect,
        timeout,
        invalid,
        invalidReason: invalid ? (this.renderErrorReason ?? 'stimulus-render-failed') : undefined,
        frameLog,
        phaseTimeline: timeline,
        stats,
        provenance,
      };
    } finally {
      this.cleanupRuntimeState();
      this.renderer.clearRenderables();
      this.renderer.deleteTexturesSince?.(textureMarker);
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
    this.textCanvas = null;
  }

  /** Reset all per-trial onset/response/video state to a clean slate. */
  private resetTrialState(): void {
    this.responseEnabled = false;
    this.pendingStimulusOnsetMark = false;
    this.stimulusOnsetTime = null;
    this.stimulusOnsetRaw = null;
    this.stimulusOffsetTime = null;
    this.stimulusTimingMethod = 'performance.now';
    this.onsetDisplayLatencyMs = undefined;
    this.onsetOutputLatencyMs = undefined;
    this.onsetDegraded = false;

    this.anticipatory = false;
    this.falseStartCount = 0;
    this.firstFalseStartTime = null;

    this.renderErrorDuringTrial = false;
    this.renderErrorReason = null;

    this.cancelVideoFrameLogging();
    this.awaitingVideoOnset = false;
    this.videoOnsetFramesWaited = 0;
    this.videoFrameRing = [];

    if (this.stimulusDurationTimerId != null) {
      clearTimeout(this.stimulusDurationTimerId);
      this.stimulusDurationTimerId = null;
    }
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
  ): Promise<StimulusHandle> {
    const closePhase = this.openPhase('stimulus', timeline);
    this.responseEnabled = true;

    const stimulus = config.stimulus;

    // Arm onset detection appropriate to the stimulus kind:
    // - visual (shape/text/image/custom): raf pending mark, next presented frame.
    // - video: requestVideoFrameCallback owns onset (armed in createStimulusRenderable);
    //          raf is only a fallback after ~2 frames.
    // - audio: onset is stamped synchronously in createStimulusRenderable
    //          (audioContext or degraded HTMLAudio).
    if (stimulus.kind === 'video') {
      this.awaitingVideoOnset = true;
      this.videoOnsetFramesWaited = 0;
      this.pendingStimulusOnsetMark = false;
    } else if (stimulus.kind === 'audio') {
      this.pendingStimulusOnsetMark = false;
    } else {
      this.pendingStimulusOnsetMark = true;
    }

    const renderable = await this.createStimulusRenderable(stimulus, signal);

    let renderableId: string | null = null;
    let removed = false;
    if (renderable) {
      renderableId = renderable.id;
      this.renderer.addRenderable(renderable);
    } else if (stimulus.kind !== 'audio') {
      // Non-audio stimulus produced no renderable (e.g. media failed to load) and
      // no clock-driven onset will arrive — stamp an immediate fallback onset so
      // RT can still be computed. Audio sets its own onset inside the branch.
      if (this.stimulusOnsetTime == null) {
        this.recordStimulusOnset({ raw: this.now(), method: 'performance.now' });
      }
    }

    const removeStimulus = () => {
      if (removed) return;
      removed = true;
      if (renderableId != null) {
        this.renderer.removeRenderable(renderableId);
      }
      if (this.stimulusOffsetTime == null) {
        this.stimulusOffsetTime = this.now();
      }
    };

    return {
      removeStimulus,
      finish: () => {
        this.responseEnabled = false;
        removeStimulus();
        closePhase();
      },
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
      // Explicit reset semantic (3.8): discard the earlier onset and re-arm the
      // raf detector so the next presented frame during this phase becomes the
      // new onset. Not blocked by the first-wins guard.
      this.resetStimulusOnsetForRemark();
    }

    await this.wait(phase.durationMs, signal);
    this.responseEnabled = false;
    closePhase();
  }

  private openPhase(name: string, timeline: ReactionPhaseMark[]): () => void {
    const startTime = this.now();
    this.hooks?.onPhaseChange?.(name, startTime);

    return () => {
      timeline.push({
        name,
        startTime,
        endTime: this.now(),
      });
    };
  }

  private subscribeFrameLogging(frameLog: FrameSample[]): void {
    this.frameUnsubscribe?.();
    this.frameUnsubscribe = this.renderer.onFrame((sample, stats) => {
      frameLog.push(sample);
      this.hooks?.onFrame?.(sample, stats);

      if (!sample.presented) return;

      if (this.pendingStimulusOnsetMark) {
        // Visual (raf) onset — apply the measured display latency (CONTRACT-CAL):
        // recorded onset = rafFrameTime + displayLatencyMs.
        this.recordStimulusOnset({
          raw: sample.now,
          method: 'raf',
          displayLatencyMs: this.displayLatencyMs,
        });
        return;
      }

      if (this.awaitingVideoOnset) {
        this.videoOnsetFramesWaited++;
        // Fall back to raf only if rVFC has not owned the onset within ~2 frames.
        if (
          this.videoOnsetFramesWaited >= VIDEO_ONSET_RAF_FALLBACK_FRAMES &&
          this.stimulusOnsetTime == null
        ) {
          this.awaitingVideoOnset = false;
          // Video raf fallback uses the compositor frame clock — the same clock
          // as the visual raf path — so the compositor→photons display latency
          // applies equally. (rVFC video, which uses expectedDisplayTime, is
          // already display-referenced and is NOT compensated.)
          this.recordStimulusOnset({
            raw: sample.now,
            method: 'raf',
            displayLatencyMs: this.displayLatencyMs,
          });
        }
      }
    });
  }

  /**
   * Subscribe to the renderer's error hook for the duration of a trial (4.1,
   * CONTRACT-ERR). The WebGLRenderer slice stops silently swallowing
   * `texImage2D` failures and invokes `onError` when a texture upload throws
   * (e.g. a cross-origin `SecurityError` tainting the canvas). We treat any such
   * error as a blank stimulus and abort the trial. Subscription is optional and
   * guarded structurally so the engine still runs against a renderer that does
   * not yet expose `onError`.
   */
  private subscribeRenderErrors(): void {
    this.renderErrorUnsubscribe?.();
    this.renderErrorUnsubscribe = null;

    const errorCapable = this.renderer as unknown as Partial<RendererErrorSource>;
    if (typeof errorCapable.onError !== 'function') return;

    this.renderErrorUnsubscribe = errorCapable.onError((info) => this.handleRenderError(info));
  }

  /**
   * Abort the in-flight trial on the first render error: the stimulus never made
   * it onto the screen, so the response window is closed WITHOUT resolving a
   * response (no RT is recorded against a blank screen). The trial's result is
   * marked invalid downstream via `renderErrorDuringTrial`.
   */
  private handleRenderError(info: ReactionRenderErrorInfo): void {
    if (this.renderErrorDuringTrial) return; // first error wins
    this.renderErrorDuringTrial = true;
    this.renderErrorReason = 'stimulus-render-failed';
    this.hooks?.onRenderError?.(info);

    this.responseEnabled = false;
    // End the response wait (resolves as no-response); the invalid flag turns it
    // into an aborted trial rather than a timeout in the returned result.
    this.resolveResponse(null);
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
        this.handleResponse('keyboard', key, time, method);
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
        this.handleResponse('mouse', { x, y }, time, method);
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
        this.handleResponse('touch', { x, y }, time, method);
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

  /**
   * Central response admission (3.5). A response that arrives before the onset
   * is an anticipatory / false start: it is recorded (flagged, counted) but
   * DISCARDED — it does not resolve the trial and no RT is computed against a
   * null onset. The response window stays open; a subsequent post-onset response
   * (or timeout) ends the trial. A captured response carries a signed `rawRtMs`
   * alongside the clamped `reactionTimeMs`.
   */
  private handleResponse(
    source: ReactionResponseMode,
    value: string | { x: number; y: number },
    time: number,
    method: TimingMethod
  ): void {
    if (this.stimulusOnsetTime == null) {
      this.anticipatory = true;
      this.falseStartCount++;
      if (this.firstFalseStartTime == null) {
        this.firstFalseStartTime = time;
      }
      this.hooks?.onFalseStart?.({ source, value, timestamp: time });
      return; // DISCARD — keep waiting for a valid post-onset response.
    }

    const rawRtMs = computeSignedReactionTimeMs(this.stimulusOnsetTime, time);
    this.resolveResponse({
      source,
      value,
      timestamp: time,
      reactionTimeMs: computeReactionTimeMs(this.stimulusOnsetTime, time),
      rawRtMs,
      timingMethod: method,
    });
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

  /**
   * Single onset-recording entry point. Computes the corrected onset
   * (`raw + displayLatencyMs`), records the raw/corrected pair, method, and
   * latency provenance, then re-arms the renderer's onset marker. Respects the
   * first-wins guard unless `force` is set (the `marksStimulusOnset` reset).
   */
  private recordStimulusOnset(opts: RecordOnsetOptions): void {
    if (this.stimulusOnsetTime != null && !opts.force) return;

    const displayLatencyMs = opts.displayLatencyMs;
    const corrected = opts.raw + (displayLatencyMs ?? 0);

    this.stimulusOnsetRaw = opts.raw;
    this.stimulusOnsetTime = corrected;
    this.stimulusTimingMethod = opts.method;
    this.onsetDisplayLatencyMs = displayLatencyMs;
    this.onsetOutputLatencyMs = opts.outputLatencyMs;
    this.onsetDegraded = opts.degraded ?? false;

    this.pendingStimulusOnsetMark = false;
    this.awaitingVideoOnset = false;

    this.renderer.markStimulusOnset();

    this.hooks?.onStimulusOnset?.({
      method: opts.method,
      rawOnsetTime: opts.raw,
      correctedOnsetTime: corrected,
      displayLatencyMs,
      outputLatencyMs: opts.outputLatencyMs,
      degraded: opts.degraded ?? false,
    });
  }

  /** Discard the current onset and re-arm the raf detector (3.8 reset semantic). */
  private resetStimulusOnsetForRemark(): void {
    this.stimulusOnsetTime = null;
    this.stimulusOnsetRaw = null;
    this.stimulusOffsetTime = null;
    this.stimulusTimingMethod = 'performance.now';
    this.onsetDisplayLatencyMs = undefined;
    this.onsetOutputLatencyMs = undefined;
    this.onsetDegraded = false;
    this.awaitingVideoOnset = false;
    this.pendingStimulusOnsetMark = true;
  }

  /**
   * Extract high-resolution timestamp from an input event.
   * Uses event.timeStamp (DOMHighResTimeStamp) when available and valid,
   * falling back to the injected clock.
   */
  private getEventTime(event: Event): { time: number; method: TimingMethod } {
    if (event.timeStamp > 0) {
      return { time: event.timeStamp, method: 'event.timeStamp' };
    }
    return { time: this.now(), method: 'performance.now' };
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

      // requestVideoFrameCallback owns the onset (3.3): it exposes the
      // compositor's expectedDisplayTime, which is the frame's true on-screen
      // time — more accurate than a raf timestamp. We do NOT arm the raf mark
      // for video; raf only takes over as a fallback (handled in the frame loop)
      // when rVFC is unavailable or has not fired within ~2 frames.
      if ('requestVideoFrameCallback' in video) {
        this.startVideoFrameLogging(video as HTMLVideoElement);
      } else {
        // No rVFC — hand the onset to the raf detector immediately.
        this.awaitingVideoOnset = false;
        this.pendingStimulusOnsetMark = true;
      }

      if (stimulus.autoplay !== false) {
        void Promise.resolve((video as HTMLVideoElement).play?.()).catch(() => {
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

      // Primary path: Web Audio API for precise, output-latency-compensated onset.
      if (stimulus.autoplay !== false) {
        const played = await this.playAudioViaContext(stimulus.src, volume, signal);
        if (played) return null;
      }

      // Degraded fallback: HTMLAudioElement. Stamp the onset BEFORE play() (there
      // is no precise clock on this path) and mark the trial degraded (3.7).
      const audio = await this.loadAudio(stimulus.src, signal);
      if (!audio) return null;

      audio.volume = volume;
      this.recordStimulusOnset({ raw: this.now(), method: 'performance.now', degraded: true });
      if (stimulus.autoplay !== false) {
        void audio.play().catch(() => {
          // Ignore autoplay restrictions.
        });
      }

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
    // 4.5: reuse ONE canvas across trials. The renderer caches textures by source
    // identity, so returning the same canvas keeps it to a single text texture
    // instead of leaking one per trial. Resizing the canvas below resets its 2D
    // context state, which is why font/align/baseline are re-applied each time.
    const canvas = (this.textCanvas ??= document.createElement('canvas'));
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

    // The renderer caches textures by SOURCE identity and re-uploads a static 2D
    // canvas only when it is flagged dirty. Since we reuse one canvas across
    // trials, the freshly-drawn pixels must be flagged or the renderer would keep
    // drawing the PREVIOUS trial's text. (Per-trial texture freeing below also
    // covers this; invalidating is the direct guard.)
    this.renderer.invalidateTexture?.(canvas);

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
      // 4.2: request an anonymous CORS fetch BEFORE assigning src. Fillout media
      // is same-origin via the proxy, but an absolute cross-origin URL must never
      // taint the texture — crossOrigin only takes effect if set before the load
      // begins (i.e. before `src`).
      image.crossOrigin = 'anonymous';
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
      // 4.2: set crossOrigin BEFORE src so the anonymous CORS mode governs the
      // media fetch — assigning it after src leaves the (possibly cross-origin)
      // load in no-CORS mode, which taints the texture. Defense-in-depth even
      // though fillout media is same-origin via the proxy.
      video.crossOrigin = 'anonymous';
      video.src = src;
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
   * Register a self-re-arming requestVideoFrameCallback that (a) logs every
   * presented frame into the per-trial ring so the displayed frame at response
   * time is reconstructable, and (b) owns the stimulus onset on the first frame
   * using metadata.expectedDisplayTime (3.3).
   */
  private startVideoFrameLogging(video: HTMLVideoElement): void {
    this.cancelVideoFrameLogging();
    this.rvfcVideo = video;

    const callback: VideoFrameRequestCallback = (_now, metadata) => {
      this.videoFrameRing.push({
        mediaTime: metadata.mediaTime,
        presentedFrames: metadata.presentedFrames,
        expectedDisplayTime: metadata.expectedDisplayTime,
      });
      if (this.videoFrameRing.length > VIDEO_FRAME_RING_MAX) {
        this.videoFrameRing.shift();
      }

      if (this.awaitingVideoOnset && this.stimulusOnsetTime == null) {
        // rVFC owns onset via its own clock — not shifted by displayLatency.
        this.recordStimulusOnset({ raw: metadata.expectedDisplayTime, method: 'rvfc' });
      }

      // Keep logging subsequent frames.
      this.rvfcHandle = video.requestVideoFrameCallback(callback);
    };

    this.rvfcHandle = video.requestVideoFrameCallback(callback);
  }

  private cancelVideoFrameLogging(): void {
    if (
      this.rvfcVideo &&
      this.rvfcHandle != null &&
      'cancelVideoFrameCallback' in this.rvfcVideo
    ) {
      try {
        this.rvfcVideo.cancelVideoFrameCallback(this.rvfcHandle);
      } catch {
        // best-effort cancel
      }
    }
    this.rvfcHandle = null;
    this.rvfcVideo = null;
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
   * The perceived onset is when audio reaches the output (DAC), which lags the
   * scheduled buffer start by the context's output latency. We therefore record
   * onset as the performance.now() equivalent of
   *   (scheduledStartCtxTime + (outputLatency ?? baseLatency ?? 0))
   * mapping the AudioContext clock to the performance clock via
   * getOutputTimestamp() (a correlated {contextTime, performanceTime} pair) when
   * available, else the currentTime/perf-now pair captured at scheduling (3.1).
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

      // Capture the ctx/perf correlation right before scheduling to minimise
      // clock-drift error, then schedule immediate playback.
      const outputLatencySec = ctx.outputLatency ?? ctx.baseLatency ?? 0;
      const perfNowAtSchedule = this.now();
      const startCtxTime = ctx.currentTime;
      source.start(0);

      // Our buffer's first sample has audio-time `startCtxTime`. We want the perf
      // time at which it is HEARD (reaches the DAC). Two clock pairs, handled
      // differently so output latency is counted exactly ONCE:
      const timestamp =
        typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
      let onsetPerfTime: number;
      if (
        timestamp &&
        typeof timestamp.contextTime === 'number' &&
        typeof timestamp.performanceTime === 'number' &&
        timestamp.contextTime > 0
      ) {
        // getOutputTimestamp() is an OUTPUT/heard pair: audio-time `contextTime`
        // (the sample AT the DAC) was heard at `performanceTime`. Output latency
        // is ALREADY encoded (contextTime lags ctx.currentTime by ~outputLatency),
        // so map straight through WITHOUT adding it again:
        //   heard(startCtxTime) = performanceTime + (startCtxTime - contextTime)*1000
        onsetPerfTime = timestamp.performanceTime + (startCtxTime - timestamp.contextTime) * 1000;
      } else {
        // Fallback: (startCtxTime, perfNowAtSchedule) is a PROCESSING pair (submit
        // time). The sample is HEARD one output latency later.
        onsetPerfTime = perfNowAtSchedule + outputLatencySec * 1000;
      }

      this.recordStimulusOnset({
        raw: onsetPerfTime,
        method: 'audioContext',
        outputLatencyMs: outputLatencySec * 1000,
      });
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

    this.renderErrorUnsubscribe?.();
    this.renderErrorUnsubscribe = null;

    this.cleanupListeners.forEach((cleanup) => cleanup());
    this.cleanupListeners = [];

    if (this.stimulusDurationTimerId != null) {
      clearTimeout(this.stimulusDurationTimerId);
      this.stimulusDurationTimerId = null;
    }

    this.cancelVideoFrameLogging();

    this.responseEnabled = false;
    this.responseResolver = null;
    this.responsePromise = null;
    this.pendingStimulusOnsetMark = false;
    this.awaitingVideoOnset = false;
  }
}
