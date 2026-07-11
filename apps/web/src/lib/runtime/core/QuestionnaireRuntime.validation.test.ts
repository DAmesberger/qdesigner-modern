import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { Questionnaire, QuestionnaireSession } from '$lib/shared';

/**
 * Script `onValidate` enforcement on the form path (ADR 0029, issue #33):
 * an EXPLICIT invalid verdict blocks the advance (participant-correctable); a script
 * THROW/timeout fails open — the answer records with provenance and the participant
 * advances (the verdict is a validation rule; the crash is an ops hiccup).
 */

function fixture(script: string): Questionnaire {
  return {
    id: 'qn-validate',
    name: 'onValidate fixture',
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

/** Host that records the latest presentation + any runtime validation-block message. */
function capturingHost(): FormQuestionHost & {
  current: FormHostPresentation | null;
  errorMessage: string | null;
} {
  const host = {
    current: null as FormHostPresentation | null,
    errorMessage: null as string | null,
    present(p: FormHostPresentation) {
      host.current = p;
    },
    clear() {
      host.current = null;
    },
    showValidationError(message: string | null) {
      host.errorMessage = message;
    },
  };
  return host;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('QuestionnaireRuntime script onValidate enforcement (ADR 0029)', () => {
  beforeAll(async () => {
    if (typeof (globalThis as { AudioContext?: unknown }).AudioContext === 'undefined') {
      (globalThis as { AudioContext?: unknown }).AudioContext = class {
        decodeAudioData() {
          return Promise.resolve({});
        }
        close() {
          return Promise.resolve();
        }
      };
    }
    await ensureModulesRegistered();
  });

  it('blocks the advance on an explicit invalid verdict, then advances once corrected', async () => {
    const host = capturingHost();
    let completed: QuestionnaireSession | undefined;
    const runtime = new QuestionnaireRuntime({
      canvas: document.createElement('canvas'),
      questionnaire: fixture(
        `const hooks = { onValidate: (value) => value === 'bad' ? 'Answer must be good' : true };`
      ),
      formHost: host,
      onComplete: (session: QuestionnaireSession) => {
        completed = session;
      },
    });

    await runtime.start();
    expect(host.current?.item.id).toBe('q1');

    // Invalid submit: blocked — message surfaced, still presented, nothing recorded, no completion.
    host.current!.onSubmit('bad');
    await flush();
    expect(host.errorMessage).toBe('Answer must be good');
    expect(host.current?.item.id).toBe('q1');
    expect(completed).toBeUndefined();

    // Corrected submit: passes, advances, completes.
    host.current!.onSubmit('good');
    await flush();

    runtime.dispose();
    expect(completed).toBeDefined();
    const r = completed!.responses.find((x) => x.questionId === 'q1');
    expect(r?.value).toBe('good');
    expect(r?.valid).toBe(true);
  });

  it('fails open when the script throws: records the answer with provenance and advances', async () => {
    const host = capturingHost();
    let completed: QuestionnaireSession | undefined;
    const runtime = new QuestionnaireRuntime({
      canvas: document.createElement('canvas'),
      questionnaire: fixture(
        `const hooks = { onValidate: () => { throw new Error('boom'); } };`
      ),
      formHost: host,
      onComplete: (session: QuestionnaireSession) => {
        completed = session;
      },
    });

    await runtime.start();
    host.current!.onSubmit('answer');
    await flush();

    runtime.dispose();
    expect(completed).toBeDefined();
    const r = completed!.responses.find((x) => x.questionId === 'q1');
    expect(r?.value).toBe('answer');
    // Fail open: the answer is kept and the participant advanced.
    expect(r?.valid).toBe(true);
    // Provenance records that the verdict is untrustworthy.
    expect(r?.metadata?.validation?.onValidate).toBe('failed-open');
  });
});
