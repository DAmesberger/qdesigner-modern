import { describe, it, expect } from 'vitest';
import type { Question } from '@qdesigner/questionnaire-core';
import { buildModuleRuntimeConfig, FORM_STYLE_QUESTION_TYPES } from './moduleConfigAdapter';

// The adapter takes the typed `Question` union, but these cases deliberately feed
// partial / nullish / legacy-shaped payloads to exercise its runtime defensiveness,
// so each argument is cast through `unknown`.
const build = (q: unknown) => buildModuleRuntimeConfig(q as Question);

describe('buildModuleRuntimeConfig', () => {
  it('always returns a plain object (never undefined) so components never deref undefined config', () => {
    expect(build(undefined)).toEqual({});
    expect(build(null)).toEqual({});
    expect(typeof build({ type: 'drawing' })).toBe('object');
  });

  it('maps a single-choice question to the multiple-choice component config shape', () => {
    const config = build({
      id: 'q1',
      type: 'single-choice',
      display: {
        prompt: 'Pick one',
        options: [
          { id: 'a', label: 'Apple', value: 'apple' },
          { id: 'b', label: 'Banana', value: 'banana' },
        ],
      },
      responseType: { type: 'single' },
    });

    expect(config.responseType).toEqual({ type: 'single' });
    expect(config.options).toHaveLength(2);
    expect(config.options![0]).toMatchObject({ id: 'a', label: 'Apple', value: 'apple' });
    expect(config.layout).toBe('vertical');
  });

  it('preserves multi-select for multiple-choice questions', () => {
    const config = build({
      type: 'multiple-choice',
      responseType: { type: 'multiple' },
      display: { options: [{ value: 1, label: 'One' }] },
    });
    expect(config.responseType).toEqual({ type: 'multiple' });
    expect(config.options![0]).toMatchObject({ value: 1, label: 'One' });
  });

  it('normalizes choice options from responseType.options when display has none', () => {
    const config = build({
      type: 'multiple-choice',
      responseType: { type: 'single', options: [{ value: 'x', label: 'X', key: '1' }] },
    });
    expect(config.options![0]).toMatchObject({ value: 'x', label: 'X' });
  });

  it('maps matrix rows/columns and converts the stored responseType to a widget kind', () => {
    const config = build({
      type: 'matrix',
      display: {
        rows: [{ id: 'r1', label: 'Row 1' }],
        columns: [{ id: 'c1', label: 'Agree', value: 1 }],
        responseType: 'single',
      },
    });
    expect(config.rows).toHaveLength(1);
    expect(config.columns).toHaveLength(1);
    expect(config.responseType).toBe('radio');
  });

  it('maps matrix multiple -> checkbox', () => {
    const config = build({
      type: 'matrix',
      display: { rows: [], columns: [], responseType: 'multiple' },
    });
    expect(config.responseType).toBe('checkbox');
  });

  it('provides scale defaults from responseType', () => {
    const config = build({
      type: 'scale',
      responseType: { type: 'scale', min: 0, max: 10, minLabel: 'Low', maxLabel: 'High' },
    });
    expect(config.min).toBe(0);
    expect(config.max).toBe(10);
    expect(config.labels).toEqual({ min: 'Low', max: 'High' });
  });

  it('lists the advanced types among form-style types (MOD-02)', () => {
    for (const type of ['matrix', 'ranking', 'date-time', 'file-upload', 'media-response', 'drawing']) {
      expect(FORM_STYLE_QUESTION_TYPES).toContain(type);
    }
  });
});
