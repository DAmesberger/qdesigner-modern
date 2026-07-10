import { describe, it, expect } from 'vitest';
import {
  buildQuestionIndex,
  resolveAnswer,
  renderAnswerValue,
  selectPinnedContent,
  extractArmAssignment,
  type VersionSnapshot,
} from './sessionRecord';

// A minimal but representative pinned-definition content blob: one single-choice
// question (with authored option labels + a saveAs), one scale, one free-text.
const content = {
  questions: [
    {
      id: 'q_gender',
      type: 'single-choice',
      display: {
        prompt: 'What is your gender?',
        options: [
          { id: 'o1', label: 'Woman', value: 'f', code: 1 },
          { id: 'o2', label: 'Man', value: 'm', code: 2 },
        ],
      },
      response: { saveAs: 'gender' },
    },
    {
      id: 'q_mood',
      type: 'scale',
      display: { prompt: 'Rate your mood', min: 1, max: 7 },
    },
    {
      id: 'q_comments',
      type: 'text-input',
      display: { prompt: 'Any comments?' },
    },
    {
      id: 'q_topics',
      type: 'multiple-choice',
      display: {
        prompt: 'Which topics interest you?',
        options: [
          { id: 't1', label: 'Sports', value: 'sports' },
          { id: 't2', label: 'Music', value: 'music' },
        ],
      },
    },
  ],
};

describe('buildQuestionIndex / resolveAnswer', () => {
  const index = buildQuestionIndex(content);

  it('keys questions by id and by their saveAs variable', () => {
    expect(index.get('q_gender')?.prompt).toBe('What is your gender?');
    expect(index.get('gender')?.id).toBe('q_gender');
  });

  it('renders a single-choice value as its authored option label', () => {
    const answer = resolveAnswer({ question_id: 'q_gender', value: 'f' }, index);
    expect(answer.prompt).toBe('What is your gender?');
    expect(answer.type).toBe('single-choice');
    expect(answer.resolved).toBe(true);
    expect(answer.displayValue).toBe('Woman');
  });

  it('matches a choice option by its numeric code as well as its value', () => {
    expect(renderAnswerValue(2, index.get('q_gender')!)).toBe('Man');
  });

  it('renders a multiple-choice array as comma-joined labels', () => {
    const answer = resolveAnswer({ question_id: 'q_topics', value: ['sports', 'music'] }, index);
    expect(answer.displayValue).toBe('Sports, Music');
  });

  it('passes through a scale/number answer unchanged', () => {
    const answer = resolveAnswer({ question_id: 'q_mood', value: 5 }, index);
    expect(answer.displayValue).toBe('5');
  });

  it('shows a no-answer placeholder for null/empty values', () => {
    expect(resolveAnswer({ question_id: 'q_comments', value: null }, index).displayValue).toBe(
      '(no answer)'
    );
    expect(resolveAnswer({ question_id: 'q_topics', value: [] }, index).displayValue).toBe(
      '(no answer)'
    );
  });

  it('falls back to the raw question id when the question is not in the definition', () => {
    const answer = resolveAnswer({ question_id: 'q_removed', value: 'x' }, index);
    expect(answer.resolved).toBe(false);
    expect(answer.prompt).toBe('q_removed');
    expect(answer.type).toBeNull();
    expect(answer.displayValue).toBe('x');
  });

  it('renders an unknown choice value (e.g. an "other" free-text) verbatim', () => {
    expect(renderAnswerValue('nonbinary', index.get('q_gender')!)).toBe('nonbinary');
  });

  it('tolerates malformed content by yielding an empty index', () => {
    expect(buildQuestionIndex(null).size).toBe(0);
    expect(buildQuestionIndex({ questions: 'nope' }).size).toBe(0);
  });
});

describe('selectPinnedContent (version pinning + fallback)', () => {
  const versions: VersionSnapshot[] = [
    { version_major: 1, version_minor: 0, version_patch: 0, content: { marker: 'v100' } },
    { version_major: 1, version_minor: 2, version_patch: 0, content: { marker: 'v120' } },
    { version_major: 2, version_minor: 0, version_patch: 0, content: { marker: 'v200' } },
  ];

  it('returns the exact pinned snapshot when present', () => {
    const result = selectPinnedContent(versions, { major: 1, minor: 2, patch: 0 });
    expect(result.matchedExact).toBe(true);
    expect(result.resolvedVersion).toBe('1.2.0');
    expect((result.content as { marker: string }).marker).toBe('v120');
  });

  it('falls back to the supplied latest content when no snapshot matches', () => {
    const result = selectPinnedContent(
      versions,
      { major: 1, minor: 9, patch: 9 },
      { content: { marker: 'latest' }, version: '2.0.0' }
    );
    expect(result.matchedExact).toBe(false);
    expect(result.resolvedVersion).toBe('2.0.0');
    expect((result.content as { marker: string }).marker).toBe('latest');
  });

  it('falls back to the newest snapshot when no exact match and no fallback content', () => {
    const result = selectPinnedContent(versions, { major: 5, minor: 0, patch: 0 });
    expect(result.matchedExact).toBe(false);
    expect(result.resolvedVersion).toBe('2.0.0');
    expect((result.content as { marker: string }).marker).toBe('v200');
  });

  it('falls back to latest content when the session has no pinned version', () => {
    const result = selectPinnedContent(
      versions,
      { major: null, minor: null, patch: null },
      { content: { marker: 'latest' }, version: '2.0.0' }
    );
    expect(result.matchedExact).toBe(false);
    expect((result.content as { marker: string }).marker).toBe('latest');
  });

  it('returns null content when nothing is available', () => {
    const result = selectPinnedContent([], { major: 1, minor: 0, patch: 0 });
    expect(result.content).toBeNull();
    expect(result.resolvedVersion).toBeNull();
  });
});

describe('extractArmAssignment', () => {
  it('reads the arm from the persisted _condition / _conditionIndex variables', () => {
    const arm = extractArmAssignment([
      { variable_name: '_condition', variable_value: 'treatment' },
      { variable_name: '_conditionIndex', variable_value: 1 },
      { variable_name: 'gender', variable_value: 'f' },
    ]);
    expect(arm).toEqual({ condition: 'treatment', conditionIndex: 1 });
  });

  it('returns null for a single-arm session with no condition variable', () => {
    expect(extractArmAssignment([{ variable_name: 'gender', variable_value: 'f' }])).toBeNull();
  });
});
