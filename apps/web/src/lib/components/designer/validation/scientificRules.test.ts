import { describe, it, expect } from 'vitest';
import {
  countRule,
  ratioRule,
  durationRule,
  positiveRule,
  orderedRule,
  validateReactionTask,
  validateCatItem,
  validateAdaptiveBlock,
  validateQuotaCondition,
  validateSeriesDraft,
  validateEmail,
  hasErrors,
  issueFor,
  type ValidationIssue,
  type SeriesWaveDraft,
} from './scientificRules';

const errors = (issues: ValidationIssue[]) => issues.filter((i) => i.severity === 'error');
const warnings = (issues: ValidationIssue[]) => issues.filter((i) => i.severity === 'warning');

describe('generic numeric rules', () => {
  describe('countRule', () => {
    it('accepts a positive integer', () => {
      expect(countRule('f', 5, 'Count')).toEqual([]);
      expect(countRule('f', 1, 'Count')).toEqual([]);
    });
    it('rejects zero, negatives, and non-integers', () => {
      expect(errors(countRule('f', 0, 'Count'))).toHaveLength(1);
      expect(errors(countRule('f', -1, 'Count'))).toHaveLength(1);
      expect(errors(countRule('f', 2.5, 'Count'))).toHaveLength(1);
    });
    it('rejects non-finite / missing', () => {
      expect(errors(countRule('f', undefined, 'Count'))).toHaveLength(1);
      expect(errors(countRule('f', NaN, 'Count'))).toHaveLength(1);
    });
    it('tags the field it was given', () => {
      expect(countRule('goNoGo.trialCount', 0, 'Count')[0]!.field).toBe('goNoGo.trialCount');
    });
  });

  describe('ratioRule', () => {
    it('accepts the [0,1] range', () => {
      expect(ratioRule('f', 0, 'R')).toEqual([]);
      expect(ratioRule('f', 0.5, 'R')).toEqual([]);
      expect(ratioRule('f', 1, 'R')).toEqual([]);
    });
    it('errors just outside the range', () => {
      expect(errors(ratioRule('f', -0.01, 'R'))).toHaveLength(1);
      expect(errors(ratioRule('f', 1.01, 'R'))).toHaveLength(1);
    });
    it('warns at the degenerate endpoints only when a message is given', () => {
      expect(warnings(ratioRule('f', 0, 'R', 'degenerate'))).toHaveLength(1);
      expect(warnings(ratioRule('f', 1, 'R', 'degenerate'))).toHaveLength(1);
      expect(warnings(ratioRule('f', 0.5, 'R', 'degenerate'))).toHaveLength(0);
      expect(warnings(ratioRule('f', 0, 'R'))).toHaveLength(0);
    });
  });

  describe('durationRule', () => {
    it('accepts positive durations', () => {
      expect(durationRule('f', 250, 'D')).toEqual([]);
    });
    it('errors on negatives', () => {
      expect(errors(durationRule('f', -1, 'D'))).toHaveLength(1);
    });
    it('warns on a zero-length interval', () => {
      expect(warnings(durationRule('f', 0, 'D'))).toHaveLength(1);
    });
  });

  describe('positiveRule', () => {
    it('accepts strictly positive', () => {
      expect(positiveRule('f', 0.3, 'P')).toEqual([]);
    });
    it('errors at and below zero', () => {
      expect(errors(positiveRule('f', 0, 'P'))).toHaveLength(1);
      expect(errors(positiveRule('f', -5, 'P'))).toHaveLength(1);
    });
  });

  describe('orderedRule', () => {
    it('accepts min <= max and min == max', () => {
      expect(orderedRule('f', 100, 200, 'ISI')).toEqual([]);
      expect(orderedRule('f', 200, 200, 'ISI')).toEqual([]);
    });
    it('errors when min > max', () => {
      expect(errors(orderedRule('f', 300, 200, 'ISI'))).toHaveLength(1);
    });
    it('is silent when a bound is non-finite', () => {
      expect(orderedRule('f', undefined, 200, 'ISI')).toEqual([]);
    });
  });
});

describe('validateReactionTask', () => {
  it('flags go/no-go with bad trial count, ratio, and timeout', () => {
    const issues = validateReactionTask({
      type: 'go-nogo',
      goNoGo: { trialCount: 0, goRatio: 1.5, responseTimeoutMs: 0 },
    });
    expect(issueFor(issues, 'goNoGo.trialCount')?.severity).toBe('error');
    expect(issueFor(issues, 'goNoGo.goRatio')?.severity).toBe('error');
    expect(issueFor(issues, 'goNoGo.responseTimeoutMs')?.severity).toBe('error');
  });

  it('warns on a degenerate go ratio but does not block', () => {
    const issues = validateReactionTask({
      type: 'go-nogo',
      goNoGo: { trialCount: 40, goRatio: 1, responseTimeoutMs: 1500 },
    });
    expect(hasErrors(issues)).toBe(false);
    expect(issueFor(issues, 'goNoGo.goRatio')?.severity).toBe('warning');
  });

  it('accepts a well-formed go/no-go config', () => {
    const issues = validateReactionTask({
      type: 'go-nogo',
      goNoGo: { trialCount: 100, goRatio: 0.75, responseTimeoutMs: 1000 },
    });
    expect(issues).toEqual([]);
  });

  it('enforces the SART target digit range 0-9', () => {
    expect(errors(validateReactionTask({ type: 'sart', sart: { trialCount: 10, targetDigit: 12, stimulusDuration: 250 } }))).not.toHaveLength(0);
    expect(errors(validateReactionTask({ type: 'sart', sart: { trialCount: 10, targetDigit: -1, stimulusDuration: 250 } }))).not.toHaveLength(0);
    expect(validateReactionTask({ type: 'sart', sart: { trialCount: 10, targetDigit: 3, stimulusDuration: 250 } })).toEqual([]);
  });

  it('flags min ISI above max ISI for the PVT', () => {
    const issues = validateReactionTask({ type: 'pvt', pvt: { trialCount: 20, minIsiMs: 10000, maxIsiMs: 2000 } });
    expect(issueFor(issues, 'pvt.minIsiMs')?.severity).toBe('error');
  });

  it('accepts an ordered PVT ISI window', () => {
    const issues = validateReactionTask({ type: 'pvt', pvt: { trialCount: 20, minIsiMs: 2000, maxIsiMs: 10000 } });
    expect(issues).toEqual([]);
  });

  it('requires a non-empty set-size list for visual search', () => {
    expect(errors(validateReactionTask({ type: 'visual-search', visualSearch: { trialCount: 30, setSizes: [], targetPresentRatio: 0.5 } }))).not.toHaveLength(0);
    expect(errors(validateReactionTask({ type: 'visual-search', visualSearch: { trialCount: 30, setSizes: [4, 8, -1], targetPresentRatio: 0.5 } }))).not.toHaveLength(0);
    expect(validateReactionTask({ type: 'visual-search', visualSearch: { trialCount: 30, setSizes: [4, 8, 16], targetPresentRatio: 0.5 } })).toEqual([]);
  });

  it('requires a non-empty SOA set for temporal-order', () => {
    expect(errors(validateReactionTask({ type: 'temporal-order', temporalOrder: { trialCount: 20, soaSetMs: [] } }))).toHaveLength(1);
  });

  it('warns on an empty RSVP target set and errors on zero item duration', () => {
    const issues = validateReactionTask({ type: 'rsvp', rsvp: { trialCount: 20, streamLength: 12, itemDurationMs: 0, targetSet: [] } });
    expect(issueFor(issues, 'rsvp.itemDurationMs')?.severity).toBe('error');
    expect(issueFor(issues, 'rsvp.targetSet')?.severity).toBe('warning');
  });

  it('warns when a Posner cue is predominantly invalid', () => {
    const issues = validateReactionTask({ type: 'posner', posner: { trialCount: 40, validRatio: 0.2, cueDurationMs: 100, soaMs: 200 } });
    expect(issueFor(issues, 'posner.validRatio')?.severity).toBe('warning');
  });

  it('returns nothing for an unknown / non-standard task type', () => {
    expect(validateReactionTask({ type: 'stroop' })).toEqual([]);
    expect(validateReactionTask(null)).toEqual([]);
  });
});

describe('validateCatItem (IRT 3PL)', () => {
  it('accepts conventional parameters', () => {
    expect(validateCatItem({ id: 'q1', a: 1.2, b: 0.5, c: 0.15 })).toEqual([]);
  });
  it('errors when discrimination is not positive', () => {
    expect(issueFor(validateCatItem({ id: 'q1', a: 0, b: 0, c: 0 }), 'item.q1.a')?.severity).toBe('error');
    expect(issueFor(validateCatItem({ id: 'q1', a: -0.5, b: 0, c: 0 }), 'item.q1.a')?.severity).toBe('error');
  });
  it('warns on out-of-convention discrimination and difficulty', () => {
    expect(issueFor(validateCatItem({ id: 'q1', a: 5, b: 0, c: 0 }), 'item.q1.a')?.severity).toBe('warning');
    expect(issueFor(validateCatItem({ id: 'q1', a: 0.1, b: 0, c: 0 }), 'item.q1.a')?.severity).toBe('warning');
    expect(issueFor(validateCatItem({ id: 'q1', a: 1, b: 6, c: 0 }), 'item.q1.b')?.severity).toBe('warning');
    expect(issueFor(validateCatItem({ id: 'q1', a: 1, b: -6, c: 0 }), 'item.q1.b')?.severity).toBe('warning');
  });
  it('errors when guessing is out of [0,1) and warns above 0.35', () => {
    expect(issueFor(validateCatItem({ id: 'q1', a: 1, b: 0, c: 1 }), 'item.q1.c')?.severity).toBe('error');
    expect(issueFor(validateCatItem({ id: 'q1', a: 1, b: 0, c: -0.1 }), 'item.q1.c')?.severity).toBe('error');
    expect(issueFor(validateCatItem({ id: 'q1', a: 1, b: 0, c: 0.5 }), 'item.q1.c')?.severity).toBe('warning');
  });
});

describe('validateAdaptiveBlock', () => {
  it('warns on an empty item bank', () => {
    const issues = validateAdaptiveBlock({ questionIds: [] });
    expect(issueFor(issues, 'items')?.severity).toBe('warning');
  });
  it('errors on bad max-items and non-positive SE threshold', () => {
    const issues = validateAdaptiveBlock({ maxItems: 0, seThreshold: 0, questionIds: ['q1'], items: [{ id: 'q1', a: 1, b: 0, c: 0 }] });
    expect(issueFor(issues, 'maxItems')?.severity).toBe('error');
    expect(issueFor(issues, 'seThreshold')?.severity).toBe('error');
  });
  it('validates top-k only when randomesque exposure is on', () => {
    expect(issueFor(validateAdaptiveBlock({ exposureControl: 'randomesque', exposureTopK: 0, questionIds: ['q1'] }), 'exposureTopK')?.severity).toBe('error');
    expect(issueFor(validateAdaptiveBlock({ exposureControl: 'none', exposureTopK: 0, questionIds: ['q1'] }), 'exposureTopK')).toBeUndefined();
  });
  it('only validates items that belong to the block', () => {
    const issues = validateAdaptiveBlock({ questionIds: ['q1'], items: [{ id: 'q2', a: -1, b: 0, c: 0 }] });
    // q2 is not in the block → its bad `a` is ignored.
    expect(issues.filter((i) => i.field.startsWith('item.'))).toHaveLength(0);
  });
  it('is clean for a well-formed block', () => {
    const issues = validateAdaptiveBlock({ maxItems: 30, seThreshold: 0.3, questionIds: ['q1'], items: [{ id: 'q1', a: 1.1, b: 0.2, c: 0.1 }] });
    expect(issues).toEqual([]);
  });
});

describe('validateQuotaCondition', () => {
  it('treats an empty condition as a valid catch-all', () => {
    expect(validateQuotaCondition('')).toEqual([]);
    expect(validateQuotaCondition('   ')).toEqual([]);
  });
  it('accepts well-formed comparisons and boolean literals', () => {
    expect(validateQuotaCondition('true')).toEqual([]);
    expect(validateQuotaCondition('age >= 18')).toEqual([]);
    expect(validateQuotaCondition('gender == "female" && age >= 18')).toEqual([]);
  });
  it('errors on a syntax error', () => {
    const issues = validateQuotaCondition('age >=');
    expect(errors(issues)).toHaveLength(1);
    expect(issues[0]!.field).toBe('condition');
  });
  it('errors on a dangling operator / unexpected token', () => {
    expect(errors(validateQuotaCondition('age >= 18 or gender == "male"'))).toHaveLength(1);
  });
  it('warns on references to unknown variables when a list is supplied', () => {
    const issues = validateQuotaCondition('agee >= 18', ['age', 'gender']);
    expect(issueFor(issues, 'condition')?.severity).toBe('warning');
    expect(issues[0]!.message).toContain('agee');
  });
  it('does not warn when all references are known', () => {
    expect(validateQuotaCondition('age >= 18 && gender == "female"', ['age', 'gender'])).toEqual([]);
  });
  it('does not warn when no variable list is available', () => {
    expect(validateQuotaCondition('age >= 18')).toEqual([]);
  });
  it('resolves a member expression to its root variable', () => {
    // `profile.age` references `profile`, which is known.
    expect(validateQuotaCondition('profile.age >= 18', ['profile'])).toEqual([]);
    expect(warnings(validateQuotaCondition('profile.age >= 18', ['age']))).toHaveLength(1);
  });
});

describe('validateSeriesDraft', () => {
  const wave = (o: Partial<SeriesWaveDraft>): SeriesWaveDraft => ({
    label: 'W',
    offsetDays: 0,
    minHours: 20,
    maxHours: 28,
    ...o,
  });

  it('requires a name and at least one wave', () => {
    const issues = validateSeriesDraft({ name: '  ', scheduleKind: 'fixed', waves: [] });
    expect(issueFor(issues, 'name')?.severity).toBe('error');
    expect(issueFor(issues, 'waves')?.severity).toBe('error');
  });

  it('requires fixed offsets to strictly increase', () => {
    const issues = validateSeriesDraft({
      name: 'S',
      scheduleKind: 'fixed',
      waves: [wave({ offsetDays: 0 }), wave({ offsetDays: 2 }), wave({ offsetDays: 1 })],
    });
    expect(issueFor(issues, 'waves.2.offsetDays')?.severity).toBe('error');
  });

  it('accepts strictly-increasing fixed offsets', () => {
    const issues = validateSeriesDraft({
      name: 'S',
      scheduleKind: 'fixed',
      waves: [wave({ offsetDays: 0 }), wave({ offsetDays: 1 }), wave({ offsetDays: 2 })],
    });
    expect(hasErrors(issues)).toBe(false);
  });

  it('errors on a negative offset', () => {
    const issues = validateSeriesDraft({ name: 'S', scheduleKind: 'event', waves: [wave({ offsetDays: -1 })] });
    expect(issueFor(issues, 'waves.0.offsetDays')?.severity).toBe('error');
  });

  it('validates random-interval bounds and ordering', () => {
    const issues = validateSeriesDraft({
      name: 'S',
      scheduleKind: 'random-interval',
      waves: [wave({ minHours: 30, maxHours: 10 })],
    });
    expect(issueFor(issues, 'waves.0.minHours')?.severity).toBe('error');
  });

  it('errors on a zero random-interval bound', () => {
    const issues = validateSeriesDraft({
      name: 'S',
      scheduleKind: 'random-interval',
      waves: [wave({ minHours: 0, maxHours: 10 })],
    });
    expect(errors(issues).some((i) => i.field === 'waves.0.minHours')).toBe(true);
  });

  it('warns when the reminder body lacks a {{link}} placeholder', () => {
    const issues = validateSeriesDraft({
      name: 'S',
      scheduleKind: 'fixed',
      waves: [wave({})],
      reminderBody: 'Time for your next survey.',
    });
    expect(issueFor(issues, 'reminderBody')?.severity).toBe('warning');
  });

  it('does not warn when {{link}} is present', () => {
    const issues = validateSeriesDraft({
      name: 'S',
      scheduleKind: 'fixed',
      waves: [wave({})],
      reminderBody: 'Open it: {{link}}',
    });
    expect(warnings(issues).some((i) => i.field === 'reminderBody')).toBe(false);
  });
});

describe('validateEmail', () => {
  it('accepts a plausible address and ignores empty input', () => {
    expect(validateEmail('email', 'a@b.co')).toEqual([]);
    expect(validateEmail('email', '')).toEqual([]);
  });
  it('rejects malformed addresses', () => {
    expect(errors(validateEmail('email', 'not-an-email'))).toHaveLength(1);
    expect(errors(validateEmail('email', 'a@b'))).toHaveLength(1);
    expect(errors(validateEmail('email', 'a b@c.com'))).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('hasErrors reflects error presence only', () => {
    expect(hasErrors([{ field: 'f', severity: 'warning', message: 'w' }])).toBe(false);
    expect(hasErrors([{ field: 'f', severity: 'error', message: 'e' }])).toBe(true);
  });
  it('issueFor prefers an error over a warning for the same field', () => {
    const issues: ValidationIssue[] = [
      { field: 'f', severity: 'warning', message: 'w' },
      { field: 'f', severity: 'error', message: 'e' },
    ];
    expect(issueFor(issues, 'f')?.severity).toBe('error');
    expect(issueFor(issues, 'other')).toBeUndefined();
  });
});
