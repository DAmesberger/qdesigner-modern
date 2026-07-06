/**
 * Records deadline-timeout occurrences across the unified timer subsystem (E-FLOW-5)
 * so researchers can flag rushed or abandoned items in the QualityReport.
 *
 * A single completed session can accumulate several question-level timeouts (each
 * speeded item that ran out of time) plus at most one page/survey terminate. The
 * tracker is a pure recorder — the runtime decides when a timeout occurred and calls
 * {@link record}.
 */

export type TimeoutScope = 'survey' | 'page' | 'question';

export interface TimeoutEvent {
  scope: TimeoutScope;
  /** The configured timeout action that ran (e.g. `auto-submit`, `skip`, `terminate`). */
  action: string;
  questionId?: string;
  pageId?: string;
  /** Loop iteration (E-FLOW-4) when the timed-out item was inside a loop block. */
  iterationIndex?: number;
  /** Wall-clock time of the timeout (ms epoch). */
  atMs: number;
}

export interface TimeoutReportData {
  flagged: boolean;
  questionTimeouts: number;
  pageTimeouts: number;
  surveyTimedOut: boolean;
  events: TimeoutEvent[];
}

export class TimeoutTracker {
  private readonly events: TimeoutEvent[] = [];
  private readonly questionThreshold: number;

  /**
   * @param questionThreshold Number of question-level timeouts at or above which the
   *   session is flagged. Default 1 — any speeded item running out of time is notable.
   */
  constructor(questionThreshold = 1) {
    this.questionThreshold = Math.max(1, questionThreshold);
  }

  record(event: Omit<TimeoutEvent, 'atMs'> & { atMs?: number }): void {
    this.events.push({ ...event, atMs: event.atMs ?? Date.now() });
  }

  get questionTimeouts(): number {
    return this.events.filter((e) => e.scope === 'question').length;
  }

  get pageTimeouts(): number {
    return this.events.filter((e) => e.scope === 'page').length;
  }

  get surveyTimedOut(): boolean {
    return this.events.some((e) => e.scope === 'survey');
  }

  /** Flagged when the survey timed out, any page timed out, or question timeouts hit the threshold. */
  get isFlagged(): boolean {
    return (
      this.surveyTimedOut ||
      this.pageTimeouts > 0 ||
      this.questionTimeouts >= this.questionThreshold
    );
  }

  getEvents(): TimeoutEvent[] {
    return [...this.events];
  }

  toReport(): TimeoutReportData {
    return {
      flagged: this.isFlagged,
      questionTimeouts: this.questionTimeouts,
      pageTimeouts: this.pageTimeouts,
      surveyTimedOut: this.surveyTimedOut,
      events: this.getEvents(),
    };
  }

  reset(): void {
    this.events.length = 0;
  }
}
