import { describe, it, expect } from 'vitest';
import {
  interpretBandMessage,
  buildBandMessageScope,
  interpretScore,
  type ScoreInterpreterConfig,
  type ScoreInterpretationRange,
} from './ScoreInterpreter';

// E-FEEDBACK-6: conditional per-band interpretive messages with variable piping.
describe('interpretBandMessage', () => {
  const config: ScoreInterpreterConfig = {
    variableId: 'anxiety',
    scaleName: 'Anxiety',
    ranges: [
      {
        min: 0,
        max: 10,
        label: 'Low',
        description: '',
        color: '#22c55e',
        message:
          'Your anxiety score of {{score.anxiety.value}} is in the {{score.anxiety.band}} range — no action needed.',
      },
      {
        min: 11,
        max: 20,
        label: 'Elevated',
        description: '',
        color: '#f59e0b',
        // Intentionally no message.
      },
    ],
  };

  const variables = {
    anxiety: 5,
    'score.anxiety': { value: 5, tScore: 45, percentile: 30, band: 'Low' },
  };

  it('interpolates the matched band message with substituted score.<scaleId> values', () => {
    const interp = interpretScore(5, config);
    const msg = interpretBandMessage(interp.range, variables);
    expect(msg).toBe('Your anxiety score of 5 is in the Low range — no action needed.');
  });

  it('returns an empty string when the matched band carries no message', () => {
    const interp = interpretScore(15, config);
    expect(interp.range?.label).toBe('Elevated');
    expect(interpretBandMessage(interp.range, variables)).toBe('');
  });

  it('returns an empty string for a null range (no classification)', () => {
    expect(interpretBandMessage(null, variables)).toBe('');
  });

  it('returns an empty string for a whitespace-only message', () => {
    const range: ScoreInterpretationRange = {
      min: 0,
      max: 10,
      label: 'Low',
      description: '',
      color: '#22c55e',
      message: '   ',
    };
    expect(interpretBandMessage(range, variables)).toBe('');
  });

  it('pipes plain question variables alongside scale scores', () => {
    const range: ScoreInterpretationRange = {
      min: 0,
      max: 10,
      label: 'Low',
      description: '',
      color: '#22c55e',
      message: 'Hi {{participantName}}, your T-score is {{score.anxiety.tScore}}.',
    };
    const msg = interpretBandMessage(range, { ...variables, participantName: 'Sam' });
    expect(msg).toBe('Hi Sam, your T-score is 45.');
  });
});

describe('buildBandMessageScope', () => {
  it('exposes one level of dotted member access for object-valued variables', () => {
    const scope = buildBandMessageScope({
      'score.anxiety': { value: 5, band: 'Low' },
      plain: 7,
    });
    expect(scope['score.anxiety.value']).toBe(5);
    expect(scope['score.anxiety.band']).toBe('Low');
    expect(scope['plain']).toBe(7);
    // The original object key is preserved.
    expect(scope['score.anxiety']).toEqual({ value: 5, band: 'Low' });
  });

  it('does not overwrite an explicit flat dotted key', () => {
    const scope = buildBandMessageScope({
      'score.anxiety': { value: 5 },
      'score.anxiety.value': 99,
    });
    expect(scope['score.anxiety.value']).toBe(99);
  });

  it('leaves array-valued variables un-flattened', () => {
    const scope = buildBandMessageScope({ items: [1, 2, 3] });
    expect(scope['items.0']).toBeUndefined();
    expect(scope['items']).toEqual([1, 2, 3]);
  });
});
