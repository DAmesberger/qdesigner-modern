/**
 * Fraud detection service for questionnaire fillout.
 *
 * Provides browser fingerprinting, duplicate detection, honeypot fields,
 * behavior analysis, and composite fraud scoring. Integrates with the
 * existing quality detectors (SpeederDetector, FlatlineDetector).
 */

import type { FraudPreventionSettings } from '$lib/shared/types/questionnaire';

// ── Types ──────────────────────────────────────────────────────────────

export type FraudFlag =
  | 'duplicate_fingerprint'
  | 'duplicate_cookie'
  | 'honeypot_triggered'
  | 'bot_behavior'
  | 'speeder'
  | 'flatliner'
  | 'blocked_country';

export interface BehaviorAnalysis {
  score: number; // 0 (bot) to 1 (human)
  flags: string[];
  details: Record<string, unknown>;
}

export interface FraudCheckResult {
  passed: boolean;
  flags: FraudFlag[];
  fingerprint?: string;
  score: number;
}

interface BehaviorEvent {
  type: string;
  timestamp: number;
}

// ── Honeypot Config ────────────────────────────────────────────────────

const HONEYPOT_FIELD_NAME = '_qd_website_url';
const HONEYPOT_EXPECTED = '';

// ── Service ────────────────────────────────────────────────────────────

export class FraudDetectionService {
  /**
   * Generate a browser fingerprint using native APIs only (no external deps).
   * Collects canvas hash, WebGL renderer, screen info, timezone, language,
   * user agent, and color depth, then hashes via SubtleCrypto SHA-256.
   */
  static async generateFingerprint(): Promise<string> {
    const components: string[] = [];

    // Screen
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    components.push(`${window.devicePixelRatio}`);

    // Timezone
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Language
    components.push(navigator.language);

    // User agent
    components.push(navigator.userAgent);

    // Platform
    components.push(navigator.platform);

    // Hardware concurrency
    components.push(`${navigator.hardwareConcurrency ?? 0}`);

    // Canvas fingerprint
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 200, 50);
        ctx.fillStyle = '#069';
        ctx.fillText('QDesigner fp', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('QDesigner fp', 4, 17);
        components.push(canvas.toDataURL());
      }
    } catch {
      components.push('canvas-unavailable');
    }

    // WebGL renderer
    try {
      const glCanvas = document.createElement('canvas');
      const gl =
        glCanvas.getContext('webgl2') ||
        glCanvas.getContext('webgl') ||
        glCanvas.getContext('experimental-webgl');
      if (gl && gl instanceof WebGLRenderingContext) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? '');
          components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '');
        }
      }
    } catch {
      components.push('webgl-unavailable');
    }

    // Hash everything
    const raw = components.join('|');
    const encoded = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check if this questionnaire was previously completed via cookie/localStorage.
   */
  static checkCookieDuplicate(questionnaireId: string): boolean {
    try {
      const key = `qd_completed_${questionnaireId}`;
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Mark a questionnaire as completed in localStorage.
   */
  static markCompleted(questionnaireId: string): void {
    try {
      const key = `qd_completed_${questionnaireId}`;
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      // Storage may be unavailable
    }
  }

  /**
   * Returns honeypot field configuration. The hidden field should be rendered
   * in the fillout form with CSS visibility:hidden / position:absolute / off-screen.
   * Bots that auto-fill all fields will populate it; humans won't see it.
   */
  static getHoneypotConfig(): { fieldName: string; expectedValue: string } {
    return {
      fieldName: HONEYPOT_FIELD_NAME,
      expectedValue: HONEYPOT_EXPECTED,
    };
  }

  /**
   * Check if a honeypot field was filled (indicating a bot).
   */
  static checkHoneypot(
    formData: Record<string, unknown>,
    config: { fieldName: string; expectedValue: string }
  ): boolean {
    const value = formData[config.fieldName];
    if (value === undefined || value === null) return false;
    return String(value) !== config.expectedValue;
  }

  /**
   * Analyze interaction events for bot-like behavior patterns.
   *
   * Checks:
   * - Mouse movement presence and variety
   * - Event timing regularity (bots often have perfectly spaced events)
   * - Overall event count (too few or too uniform)
   */
  static analyzeBehavior(events: BehaviorEvent[]): BehaviorAnalysis {
    const flags: string[] = [];
    const details: Record<string, unknown> = {};
    let score = 1.0;

    if (events.length === 0) {
      return { score: 0.3, flags: ['no_events'], details: { eventCount: 0 } };
    }

    // 1. Check mouse movement events exist
    const mouseEvents = events.filter(
      (e) => e.type === 'mousemove' || e.type === 'pointermove' || e.type === 'touchmove'
    );
    const hasMouseMovement = mouseEvents.length > 0;
    details.mouseEventCount = mouseEvents.length;

    if (!hasMouseMovement) {
      score -= 0.2;
      flags.push('no_mouse_movement');
    }

    // 2. Check timing regularity — perfectly uniform intervals suggest a bot
    if (events.length >= 5) {
      const intervals: number[] = [];
      for (let i = 1; i < events.length; i++) {
        intervals.push(events[i]!.timestamp - events[i - 1]!.timestamp);
      }

      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance =
        intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation

      details.timingCV = cv;
      details.meanInterval = mean;

      // Very low CV = suspiciously regular timing
      if (cv < 0.05 && intervals.length > 10) {
        score -= 0.3;
        flags.push('uniform_timing');
      }
    }

    // 3. Check for unrealistically fast interaction (< 50ms between events consistently)
    if (events.length >= 3) {
      const fastPairs = events.filter(
        (_, i) => i > 0 && events[i]!.timestamp - events[i - 1]!.timestamp < 50
      ).length;
      const fastRatio = fastPairs / (events.length - 1);
      details.fastEventRatio = fastRatio;

      if (fastRatio > 0.5) {
        score -= 0.2;
        flags.push('unrealistically_fast');
      }
    }

    // 4. Check for keyboard/click events (should have some for a real respondent)
    const interactiveEvents = events.filter(
      (e) =>
        e.type === 'click' ||
        e.type === 'keydown' ||
        e.type === 'keyup' ||
        e.type === 'change' ||
        e.type === 'input'
    );
    details.interactiveEventCount = interactiveEvents.length;

    if (interactiveEvents.length === 0 && events.length > 20) {
      score -= 0.15;
      flags.push('no_interactive_events');
    }

    score = Math.max(0, Math.min(1, score));
    return { score, flags, details };
  }

  /**
   * Run all applicable fraud checks based on settings.
   */
  static async checkAll(
    questionnaireId: string,
    settings: FraudPreventionSettings,
    events?: BehaviorEvent[]
  ): Promise<FraudCheckResult> {
    const flags: FraudFlag[] = [];
    let fingerprint: string | undefined;
    let score = 1.0;

    // 1. Fingerprint / duplicate detection
    if (settings.preventDuplicates) {
      const method = settings.duplicateDetectionMethod;

      if (method === 'fingerprint' || method === 'combined') {
        fingerprint = await FraudDetectionService.generateFingerprint();
      }

      if (method === 'cookie' || method === 'combined') {
        if (FraudDetectionService.checkCookieDuplicate(questionnaireId)) {
          flags.push('duplicate_cookie');
          score -= 0.5;
        }
      }
    }

    // 2. Behavior analysis
    if (settings.enableBehaviorAnalysis && events) {
      const analysis = FraudDetectionService.analyzeBehavior(events);
      if (analysis.score < 0.5) {
        flags.push('bot_behavior');
        score -= 0.3;
      }
    }

    score = Math.max(0, Math.min(1, score));

    return {
      passed: flags.length === 0,
      flags,
      fingerprint,
      score,
    };
  }

  /**
   * Check for duplicate via backend fingerprint lookup.
   * Returns true if a duplicate was found.
   */
  static async checkDuplicateViaAPI(
    questionnaireId: string,
    fingerprint: string
  ): Promise<{ isDuplicate: boolean; previousCompletions: number }> {
    try {
      const response = await fetch('/api/sessions/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionnaire_id: questionnaireId,
          fingerprint,
        }),
      });

      if (!response.ok) {
        return { isDuplicate: false, previousCompletions: 0 };
      }

      return await response.json();
    } catch {
      return { isDuplicate: false, previousCompletions: 0 };
    }
  }
}
