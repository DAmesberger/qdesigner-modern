import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime } from './QuestionnaireRuntime';
import type { FormQuestionHost, FormHostPresentation } from './FormQuestionHost';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { FlowControl, Questionnaire, QuestionnaireSession } from '$lib/shared';

/**
 * F-20: a flow `terminate` rule that carries screen-out fields ends the session as an
 * eligibility SCREEN-OUT — it stamps `session.metadata.screenOut` so the fillout page
 * routes to the distinct screened-out screen instead of the thank-you. A bare terminate
 * (no screen-out fields) and a natural end both complete WITHOUT that blob.
 */

function fixture(flow: FlowControl[]): Questionnaire {
  return {
    id: 'qn-screenout',
    name: 'Screen-out fixture',
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
      },
      {
        id: 'q2',
        type: 'text-input',
        order: 2,
        display: { prompt: 'Question q2' },
        response: { saveAs: 'q2', transform: 'none' },
      },
    ],
    pages: [
      { id: 'p1', name: 'Page 1', questions: ['q1'] },
      { id: 'p2', name: 'Page 2', questions: ['q2'] },
    ],
    flow,
    settings: {},
  } as unknown as Questionnaire;
}

/** Host that records the latest presentation so the test can pump answers into it. */
function capturingHost(): FormQuestionHost & { current: FormHostPresentation | null } {
  const host = {
    current: null as FormHostPresentation | null,
    present(p: FormHostPresentation) {
      host.current = p;
    },
    clear() {
      host.current = null;
    },
  };
  return host;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Drive the runtime by submitting a plain answer to every presented item until it ends. */
async function runToCompletion(
  flow: FlowControl[],
  questionnaire: Questionnaire = fixture(flow)
): Promise<QuestionnaireSession> {
  const host = capturingHost();
  let completed: QuestionnaireSession | undefined;
  const runtime = new QuestionnaireRuntime({
    canvas: document.createElement('canvas'),
    questionnaire,
    formHost: host,
    onComplete: (session: QuestionnaireSession) => {
      completed = session;
    },
  });

  await runtime.start();
  for (let i = 0; i < 12 && !completed; i++) {
    const p = host.current;
    if (p) {
      host.current = null;
      p.onSubmit('answer');
    }
    await flush();
  }

  runtime.dispose();
  if (!completed) throw new Error('runtime did not complete');
  return completed;
}

describe('QuestionnaireRuntime flow-terminate screen-out (F-20)', () => {
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

  it('screens out via a terminate rule carrying screen-out fields', async () => {
    const session = await runToCompletion([
      {
        id: 'f-screenout',
        type: 'terminate',
        condition: 'true',
        source: 'p1',
        screenOutMessage: 'You do not qualify for this study.',
        screenOutRedirectUrl: 'https://panel.example.com/screenout',
      } as FlowControl,
    ]);

    expect(session.status).toBe('completed');
    expect(session.metadata?.screenOut).toBeDefined();
    expect(session.metadata?.screenOut?.message).toBe('You do not qualify for this study.');
    expect(session.metadata?.screenOut?.redirectUrl).toBe('https://panel.example.com/screenout');
    expect(session.metadata?.screenOut?.ruleId).toBe('f-screenout');
    // Screened out on page 1 — q2 (page 2) never presented, so no answer for it.
    expect(session.responses.some((r) => r.questionId === 'q2')).toBe(false);
  });

  it('completes normally for a bare terminate rule (no screen-out fields)', async () => {
    const session = await runToCompletion([
      { id: 'f-end', type: 'terminate', condition: 'true', source: 'p1' } as FlowControl,
    ]);

    expect(session.status).toBe('completed');
    expect(session.metadata?.screenOut).toBeUndefined();
  });

  it('screens out via a structured screener rule at a page boundary', async () => {
    // The previously-dormant ScreenerController: an `eligibleWhen` that fails at p1
    // screens the participant out before page 2.
    const questionnaire = fixture([]);
    questionnaire.settings = {
      screeners: [
        {
          id: 's1',
          pageId: 'p1',
          rules: [
            {
              id: 'adults-only',
              eligibleWhen: 'false',
              screenOutReason: 'under_18',
              screenOutMessage: 'This study is for adults only.',
            },
          ],
        },
      ],
    } as unknown as Questionnaire['settings'];

    const session = await runToCompletion([], questionnaire);

    expect(session.status).toBe('completed');
    expect(session.metadata?.screenOut?.reason).toBe('under_18');
    expect(session.metadata?.screenOut?.message).toBe('This study is for adults only.');
    expect(session.metadata?.screenOut?.ruleId).toBe('adults-only');
    expect(session.responses.some((r) => r.questionId === 'q2')).toBe(false);
  });

  it('completes normally when the flow reaches its natural end', async () => {
    const session = await runToCompletion([]);

    expect(session.status).toBe('completed');
    expect(session.metadata?.screenOut).toBeUndefined();
    // Both pages were answered on the way to the natural end.
    expect(session.responses.some((r) => r.questionId === 'q2')).toBe(true);
  });
});
