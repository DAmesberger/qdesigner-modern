import { describe, expect, it } from 'vitest';
import {
  buildTrialRow,
  compactPhaseTimeline,
  TRIAL_ROW_COLUMNS,
  type ReactionTrialRecord,
  type ReactionTrialRow,
} from './trialRow';
import {
  buildReactionTrialRows,
  reactionTrialRowsToCsv,
  hasReactionTrialData,
} from '$lib/analytics/reactionTrialExport';
import type { ExportRow } from '$lib/shared/types/api';

/** A fully-populated persisted trial record for the happy path. */
function baseRecord(overrides: Partial<ReactionTrialRecord> = {}): ReactionTrialRecord {
  return {
    trialId: 'trial-1',
    trialNumber: 1,
    isPractice: false,
    taskType: 'simple',
    blockId: 'block-a',
    condition: 'congruent',
    trialTemplateId: 'tmpl-1',
    stimulusKind: 'shape',
    key: 'f',
    reactionTime: 420,
    rawRtMs: 421.3,
    isCorrect: true,
    timeout: false,
    anticipatory: false,
    falseStartCount: 0,
    stimulusOnsetTime: 1000,
    stimulusOffsetTime: 1200,
    expectedResponse: 'f',
    isTarget: true,
    responseTimingMethod: 'event.timeStamp',
    responseDevice: 'keyboard',
    holdDurationMs: null,
    gamepadButtonIndex: null,
    stimulusTimingMethod: 'raf',
    displayLatencyMs: 8.3,
    outputLatencyMs: null,
    offsetMethod: 'raf',
    actualDurationFrames: 12,
    videoFrameCount: 0,
    phaseTimeline: [{ name: 'stimulus', startTime: 1000, endTime: 1200, durationMs: 200 }],
    frameStats: { fps: 60, droppedFrames: 0, jitter: 0.4 },
    invalid: false,
    invalidReason: null,
    ...overrides,
  };
}

describe('compactPhaseTimeline', () => {
  it('derives durationMs and tolerates a missing timeline', () => {
    expect(compactPhaseTimeline(null)).toEqual([]);
    expect(compactPhaseTimeline([{ name: 'a', startTime: 100, endTime: 260 }])).toEqual([
      { name: 'a', startTime: 100, endTime: 260, durationMs: 160 },
    ]);
  });
});

describe('buildTrialRow', () => {
  it('populates every canonical column from a full record', () => {
    const row = buildTrialRow(baseRecord(), {
      sessionId: 'sess-1',
      participantId: 'p-1',
      questionId: 'q-1',
    });

    // Every declared column must resolve to a defined value on the row.
    for (const col of TRIAL_ROW_COLUMNS) {
      expect(row[col.key], `column ${String(col.key)} missing`).not.toBeUndefined();
    }

    expect(row.sessionId).toBe('sess-1');
    expect(row.participantId).toBe('p-1');
    expect(row.questionId).toBe('q-1');
    expect(row.reactionTimeMs).toBe(420);
    expect(row.rawRtMs).toBeCloseTo(421.3);
    expect(row.onsetMethod).toBe('raf');
    expect(row.responseMethod).toBe('event.timeStamp');
    expect(row.displayLatencyMs).toBeCloseTo(8.3);
    expect(row.excludeFromAnalysis).toBe(false);
    expect(row.excludeReason).toBeNull();
  });

  it('carries an audio trial: outputLatencyMs and onsetMethod=audioContext', () => {
    const row = buildTrialRow(
      baseRecord({
        stimulusKind: 'audio',
        stimulusTimingMethod: 'audioContext',
        displayLatencyMs: null,
        outputLatencyMs: 24.5,
      }),
      { sessionId: 's', questionId: 'q' }
    );
    expect(row.onsetMethod).toBe('audioContext');
    expect(row.outputLatencyMs).toBeCloseTo(24.5);
    expect(row.stimulusKind).toBe('audio');
  });

  it('round-trips a false-start trial with video frames: anticipatory + flagged for exclusion', () => {
    const row = buildTrialRow(
      baseRecord({
        stimulusKind: 'video',
        anticipatory: true,
        falseStartCount: 2,
        rawRtMs: -14.2,
        reactionTime: 0,
        videoFrameCount: 5,
        outputLatencyMs: 18,
      }),
      { sessionId: 's', questionId: 'q' }
    );
    expect(row.anticipatory).toBe(true);
    expect(row.falseStartCount).toBe(2);
    expect(row.rawRtMs).toBeCloseTo(-14.2);
    expect(row.videoFrameCount).toBe(5);
    expect(row.excludeFromAnalysis).toBe(true);
    expect(row.excludeReason).toBe('anticipatory');
  });

  it('flags an invalidated trial for exclusion with its invalid reason', () => {
    const row = buildTrialRow(
      baseRecord({ invalid: true, invalidReason: 'stimulus-render-failed' }),
      { sessionId: 's', questionId: 'q' }
    );
    expect(row.excludeFromAnalysis).toBe(true);
    expect(row.excludeReason).toBe('stimulus-render-failed');
  });

  it('defaults participantId to null when absent', () => {
    const row = buildTrialRow(baseRecord(), { sessionId: 's', questionId: 'q' });
    expect(row.participantId).toBeNull();
  });
});

describe('reactionTrialExport flattener', () => {
  function exportRow(responses: ReactionTrialRecord[], overrides: Partial<ExportRow> = {}): ExportRow {
    return {
      session_id: 'sess-1',
      participant_id: 'p-1',
      session_status: 'completed',
      started_at: null,
      completed_at: null,
      question_id: 'q-1',
      value: { responses, averageRT: 400, accuracy: 1 },
      reaction_time_us: null,
      presented_at: null,
      answered_at: null,
      ...overrides,
    };
  }

  it('flattens N trials into N rows in trial order', () => {
    const rows = buildReactionTrialRows([
      exportRow([
        baseRecord({ trialNumber: 1, trialId: 't1' }),
        baseRecord({ trialNumber: 2, trialId: 't2' }),
        baseRecord({ trialNumber: 3, trialId: 't3' }),
      ]),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.trialId)).toEqual(['t1', 't2', 't3']);
  });

  it('skips non-reaction rows and detects reaction data', () => {
    const nonReaction = exportRow([], { value: { some: 'scalar' } });
    const reaction = exportRow([baseRecord()]);
    expect(hasReactionTrialData([nonReaction])).toBe(false);
    expect(hasReactionTrialData([reaction])).toBe(true);
    expect(buildReactionTrialRows([nonReaction, reaction])).toHaveLength(1);
  });

  it('serializes CSV with a stable header and one line per trial', () => {
    const rows = buildReactionTrialRows([
      exportRow([baseRecord({ trialNumber: 1 }), baseRecord({ trialNumber: 2 })]),
    ]);
    const csv = reactionTrialRowsToCsv(rows);
    const lines = csv.split('\n');
    // 1 header + 2 data rows.
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(TRIAL_ROW_COLUMNS.map((c) => c.header).join(','));
    // Header includes the E-REACT-5 provenance columns.
    expect(lines[0]).toContain('raw_rt_ms');
    expect(lines[0]).toContain('anticipatory');
    expect(lines[0]).toContain('display_latency_ms');
    expect(lines[0]).toContain('exclude_from_analysis');
    // Every data line has exactly one cell per column.
    for (const line of lines.slice(1)) {
      expect(line.split(',').length).toBe(TRIAL_ROW_COLUMNS.length);
    }
  });

  it('quotes cells containing commas', () => {
    const rows: ReactionTrialRow[] = buildReactionTrialRows([
      exportRow([baseRecord({ condition: 'a,b' })]),
    ]);
    const csv = reactionTrialRowsToCsv(rows);
    expect(csv).toContain('"a,b"');
  });
});
