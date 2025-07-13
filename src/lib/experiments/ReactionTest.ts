import { WebGLRenderer } from '$lib/renderer';
import type { RenderCommand } from '$lib/shared';

export interface ReactionTestConfig {
  stimulusDuration: number; // How long to show the stimulus (ms)
  interTrialInterval: number; // Time between trials (ms)
  numberOfTrials: number;
  warmupTrials: number;
  targetKey: string; // Which key to press
  stimulusColor: [number, number, number, number]; // RGBA
  backgroundColor: [number, number, number, number]; // RGBA
}

export interface ReactionTestResult {
  trialNumber: number;
  reactionTime: number; // in milliseconds
  stimulusOnsetTime: number;
  keyPressTime: number;
  correct: boolean;
  isWarmup: boolean;
}

export interface ReactionTestStats {
  meanReactionTime: number;
  medianReactionTime: number;
  standardDeviation: number;
  minReactionTime: number;
  maxReactionTime: number;
  validTrials: number;
  missedTrials: number;
}

export class ReactionTest {
  private renderer: WebGLRenderer;
  private config: ReactionTestConfig;
  private results: ReactionTestResult[] = [];
  private currentTrial: number = 0;
  private isRunning: boolean = false;
  private stimulusOnsetTime: number = 0;
  private trialTimeout: number | null = null;
  private nextTrialTimeout: number | null = null;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, config: ReactionTestConfig) {
    this.config = config;
    this.renderer = new WebGLRenderer({
      canvas,
      targetFPS: 120, // Default to 120 FPS for reaction tests
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.results = [];
    this.currentTrial = 0;

    // Set up keyboard listener
    this.keyHandler = (event: KeyboardEvent) => {
      if (event.key === this.config.targetKey && this.stimulusOnsetTime > 0) {
        this.recordResponse();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    // Start renderer
    this.renderer.start();

    // Begin first trial
    this.startNextTrial();
  }

  public stop(): void {
    this.isRunning = false;

    // Clean up timeouts
    if (this.trialTimeout) {
      clearTimeout(this.trialTimeout);
      this.trialTimeout = null;
    }
    if (this.nextTrialTimeout) {
      clearTimeout(this.nextTrialTimeout);
      this.nextTrialTimeout = null;
    }

    // Remove keyboard listener
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }

    // Stop renderer
    this.renderer.stop();
  }

  private startNextTrial(): void {
    if (!this.isRunning || this.currentTrial >= this.config.numberOfTrials) {
      this.complete();
      return;
    }

    // Clear screen with background color
    const clearCommand: RenderCommand = {
      type: 'clear',
      params: {
        r: this.config.backgroundColor[0],
        g: this.config.backgroundColor[1],
        b: this.config.backgroundColor[2],
        a: this.config.backgroundColor[3],
      },
    };
    this.renderer.executeCommand(clearCommand);

    // Schedule stimulus presentation
    const delay = Math.random() * 2000 + 1000; // Random delay between 1-3 seconds
    this.nextTrialTimeout = window.setTimeout(() => {
      this.presentStimulus();
    }, delay);
  }

  private presentStimulus(): void {
    // Record precise stimulus onset time
    this.stimulusOnsetTime = performance.now();

    // Draw stimulus (full screen color change)
    const stimulusCommand: RenderCommand = {
      type: 'clear',
      params: {
        r: this.config.stimulusColor[0],
        g: this.config.stimulusColor[1],
        b: this.config.stimulusColor[2],
        a: this.config.stimulusColor[3],
      },
      timestamp: this.stimulusOnsetTime,
    };
    this.renderer.executeCommand(stimulusCommand);

    // Set timeout for stimulus duration
    this.trialTimeout = window.setTimeout(() => {
      this.endTrial(false); // Missed trial
    }, this.config.stimulusDuration);
  }

  private recordResponse(): void {
    const keyPressTime = performance.now();
    const reactionTime = keyPressTime - this.stimulusOnsetTime;

    // Record result
    const result: ReactionTestResult = {
      trialNumber: this.currentTrial,
      reactionTime,
      stimulusOnsetTime: this.stimulusOnsetTime,
      keyPressTime,
      correct: true,
      isWarmup: this.currentTrial < this.config.warmupTrials,
    };
    this.results.push(result);

    // Clear trial timeout
    if (this.trialTimeout) {
      clearTimeout(this.trialTimeout);
      this.trialTimeout = null;
    }

    // End trial
    this.endTrial(true);
  }

  private endTrial(responded: boolean): void {
    // Record missed trial if no response
    if (!responded) {
      const result: ReactionTestResult = {
        trialNumber: this.currentTrial,
        reactionTime: -1,
        stimulusOnsetTime: this.stimulusOnsetTime,
        keyPressTime: -1,
        correct: false,
        isWarmup: this.currentTrial < this.config.warmupTrials,
      };
      this.results.push(result);
    }

    // Reset stimulus onset time
    this.stimulusOnsetTime = 0;

    // Increment trial counter
    this.currentTrial++;

    // Clear screen
    const clearCommand: RenderCommand = {
      type: 'clear',
      params: {
        r: this.config.backgroundColor[0],
        g: this.config.backgroundColor[1],
        b: this.config.backgroundColor[2],
        a: this.config.backgroundColor[3],
      },
    };
    this.renderer.executeCommand(clearCommand);

    // Schedule next trial
    this.nextTrialTimeout = window.setTimeout(() => {
      this.startNextTrial();
    }, this.config.interTrialInterval);
  }

  private complete(): void {
    this.stop();
    // Emit completion event or call callback
    this.onComplete?.(this.results);
  }

  public getStats(): ReactionTestStats {
    // Filter out warmup trials and missed trials
    const validResults = this.results.filter(
      (r) => !r.isWarmup && r.reactionTime > 0
    );

    if (validResults.length === 0) {
      return {
        meanReactionTime: 0,
        medianReactionTime: 0,
        standardDeviation: 0,
        minReactionTime: 0,
        maxReactionTime: 0,
        validTrials: 0,
        missedTrials: this.results.filter((r) => !r.correct).length,
      };
    }

    const reactionTimes = validResults.map((r) => r.reactionTime);
    reactionTimes.sort((a, b) => a - b);

    const mean = reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length;
    const median = reactionTimes[Math.floor(reactionTimes.length / 2)] || 0;
    const variance =
      reactionTimes.reduce((acc, rt) => acc + Math.pow(rt - mean, 2), 0) /
      reactionTimes.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      meanReactionTime: mean,
      medianReactionTime: median,
      standardDeviation,
      minReactionTime: Math.min(...reactionTimes),
      maxReactionTime: Math.max(...reactionTimes),
      validTrials: validResults.length,
      missedTrials: this.results.filter((r) => !r.correct).length,
    };
  }

  public getResults(): ReactionTestResult[] {
    return [...this.results];
  }

  // Optional callback for completion
  public onComplete?: (results: ReactionTestResult[]) => void;

  public destroy(): void {
    this.stop();
    this.renderer.destroy();
  }
}