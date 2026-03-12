/**
 * Realtime Analytics Client
 * Subscribes to analytics:{questionnaireId} via the existing WebSocket client
 * and exposes Svelte 5 reactive state for live metrics.
 */

import { ws, type WsEvent } from '$lib/services/ws';

// ── Types ──────────────────────────────────────────────────────────

export interface AnalyticsMetrics {
  /** Total responses received since subscribing */
  totalResponses: number;
  /** Responses in the last minute */
  responsesPerMinute: number;
  /** Unique session IDs seen */
  uniqueSessions: Set<string>;
  /** Timestamp of last response event */
  lastEventAt: number | null;
  /** Rolling event log (newest first, capped) */
  recentEvents: AnalyticsEvent[];
}

export interface AnalyticsEvent {
  type: 'response.submitted' | 'response.synced' | string;
  sessionId: string;
  questionnaireId: string;
  count: number;
  timestamp: number;
}

// ── Client ─────────────────────────────────────────────────────────

const MAX_RECENT_EVENTS = 100;
const RPM_WINDOW_MS = 60_000;

export class RealtimeAnalyticsClient {
  /** Svelte 5 reactive state */
  metrics: AnalyticsMetrics = $state({
    totalResponses: 0,
    responsesPerMinute: 0,
    uniqueSessions: new Set<string>(),
    lastEventAt: null,
    recentEvents: [],
  });

  connected: boolean = $state(false);

  private questionnaireId: string;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private rpmTimer: ReturnType<typeof setInterval> | null = null;
  /** Timestamps of events in the last minute for RPM calculation */
  private recentTimestamps: number[] = [];

  constructor(questionnaireId: string) {
    this.questionnaireId = questionnaireId;
  }

  /**
   * Start subscribing to live analytics events.
   * Call this from $effect or onMount.
   */
  subscribe(): void {
    const channel = `analytics:${this.questionnaireId}`;

    this.unsubscribe = ws.subscribe(channel, (event: WsEvent) => {
      this.handleEvent(event);
    });

    this.unsubscribeConnection = ws.onConnectionChange((connected) => {
      this.connected = connected;
    });

    // Recalculate RPM every 5 seconds
    this.rpmTimer = setInterval(() => this.updateRPM(), 5_000);
  }

  /**
   * Stop subscribing and clean up.
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.unsubscribeConnection) {
      this.unsubscribeConnection();
      this.unsubscribeConnection = null;
    }
    if (this.rpmTimer) {
      clearInterval(this.rpmTimer);
      this.rpmTimer = null;
    }
  }

  /**
   * Reset all metrics to zero.
   */
  reset(): void {
    this.metrics.totalResponses = 0;
    this.metrics.responsesPerMinute = 0;
    this.metrics.uniqueSessions = new Set();
    this.metrics.lastEventAt = null;
    this.metrics.recentEvents = [];
    this.recentTimestamps = [];
  }

  // ── Derived Getters ──────────────────────────────────────────────

  get uniqueSessionCount(): number {
    return this.metrics.uniqueSessions.size;
  }

  // ── Internals ────────────────────────────────────────────────────

  private handleEvent(event: WsEvent): void {
    const payload = event.payload as {
      session_id?: string;
      questionnaire_id?: string;
      count?: number;
      responses_synced?: number;
      timestamp?: string;
    };

    const count = payload.count ?? payload.responses_synced ?? 1;
    const now = Date.now();

    this.metrics.totalResponses += count;
    this.metrics.lastEventAt = now;

    if (payload.session_id) {
      // Create a new Set so Svelte detects the change
      const next = new Set(this.metrics.uniqueSessions);
      next.add(payload.session_id);
      this.metrics.uniqueSessions = next;
    }

    const analyticsEvent: AnalyticsEvent = {
      type: event.event,
      sessionId: payload.session_id ?? '',
      questionnaireId: payload.questionnaire_id ?? this.questionnaireId,
      count,
      timestamp: now,
    };

    this.metrics.recentEvents = [
      analyticsEvent,
      ...this.metrics.recentEvents.slice(0, MAX_RECENT_EVENTS - 1),
    ];

    // Track for RPM
    this.recentTimestamps.push(now);

    // Immediate RPM update
    this.updateRPM();
  }

  private updateRPM(): void {
    const cutoff = Date.now() - RPM_WINDOW_MS;
    this.recentTimestamps = this.recentTimestamps.filter(t => t > cutoff);
    this.metrics.responsesPerMinute = this.recentTimestamps.length;
  }
}
