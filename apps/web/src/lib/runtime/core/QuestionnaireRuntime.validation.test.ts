import { describe, expect, it, vi } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { Questionnaire } from '$lib/shared';

function fixture(script: string): Questionnaire {
  return {
    id: 'qn-validate',
    name: 'Legacy hook fixture',
    version: '1.0.0',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    created: new Date(),
    modified: new Date(),
    variables: [],
    questions: [
      {
        id: 'q1',
        type: 'text-input',
        order: 1,
        display: { prompt: 'Question q1' },
        response: { saveAs: 'q1', transform: 'none' },
        settings: { script },
      },
    ],
    pages: [{ id: 'p1', name: 'Page 1', questions: ['q1'] }],
    flow: [],
    settings: {},
  } as unknown as Questionnaire;
}

describe('QuestionnaireRuntime rejects JavaScript hooks (ADR 0039)', () => {
  it.each([
    "const hooks = { onValidate: (value) => value === 'good' };",
    "const hooks = { onValidate: () => { throw new Error('boom'); } };",
  ])('rejects legacy validation before presenting or recording answers: %s', (script) => {
    const present = vi.fn();
    const onComplete = vi.fn();
    expect(
      () =>
        new QuestionnaireRuntime({
          canvas: document.createElement('canvas'),
          questionnaire: fixture(script),
          formHost: { present, clear: vi.fn(), showValidationError: vi.fn() },
          onComplete,
        })
    ).toThrow(/UNSAFE_JAVASCRIPT.*questionnaire.questions\[0\].settings.script/);
    expect(present).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

it('rejects unknown required extensions before presenting or recording answers', () => {
  const questionnaire = fixture('');
  questionnaire.extensions = {
    'org.example.unsupported': { required: true, data: {} },
  };
  const present = vi.fn();
  const onComplete = vi.fn();
  expect(
    () =>
      new QuestionnaireRuntime({
        canvas: document.createElement('canvas'),
        questionnaire,
        formHost: { present, clear: vi.fn(), showValidationError: vi.fn() },
        onComplete,
      })
  ).toThrow(/QDEF_REQUIRED_EXTENSION.*org.example.unsupported/);
  expect(present).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

it('rejects an unresolved cohort binding before participant presentation', () => {
  const questionnaire = fixture('');
  questionnaire.questions = [
    {
      id: 'feedback',
      type: 'statistical-feedback',
      order: 0,
      required: false,
      display: {
        title: 'Cohort',
        chartType: 'bar',
        sourceMode: 'cohort',
        dataSource: {
          source: 'variable',
          key: 'score',
          questionnaireId: '',
          questionnaireBinding: 'reference-cohort',
        },
      },
    },
  ];
  const present = vi.fn();
  expect(
    () =>
      new QuestionnaireRuntime({
        canvas: document.createElement('canvas'),
        questionnaire,
        formHost: { present, clear: vi.fn(), showValidationError: vi.fn() },
      })
  ).toThrow(/QDEF_SOURCE_BINDING_REQUIRED.*reference-cohort/);
  expect(present).not.toHaveBeenCalled();
});
