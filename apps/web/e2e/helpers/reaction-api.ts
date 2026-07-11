import type { APIRequestContext, Page } from '@playwright/test';
import { deriveQuestionnaireCode, type ProvisionedWorkspace } from './fullstack-api';

/**
 * RT-6 reaction-lane helpers. Seed real reaction studies through the public API
 * (paradigm config → published questionnaire), read the per-trial rows the runtime
 * persists (`GET /api/sessions/{id}/trials`), and drive the fillout against the
 * engine's test-mode phase hook (`window.__rtPhases`, gated by the
 * `qdesigner-rt-phase-hook` localStorage flag the engine reads at construction).
 */

const RT_PHASE_HOOK_KEY = 'qdesigner-rt-phase-hook';

interface SessionCredential {
  sessionCookie: string;
  csrfToken: string;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Minimal same-origin authed JSON call — mirrors fullstack-api's private helper. */
async function authedJson(
  request: APIRequestContext,
  method: HttpMethod,
  path: string,
  session: SessionCredential,
  body?: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party API response
): Promise<any> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    Cookie: `qd_session=${session.sessionCookie}`,
  };
  if (method !== 'GET') headers['X-CSRF-Token'] = session.csrfToken;

  const response = await request.fetch(`/api${path}`, { method, headers, data: body });
  if (!response.ok()) {
    throw new Error(`API ${method} /api${path} failed (${response.status()}): ${await response.text()}`);
  }
  if (response.status() === 204) return null;
  return response.json();
}

export interface ProvisionedReactionStudy {
  workspace: ProvisionedWorkspace;
  questionnaireId: string;
  questionnaireCode: string;
}

export interface ProvisionedReactionImageStudy extends ProvisionedReactionStudy {
  mediaId: string;
}

// ── Trials read-back ─────────────────────────────────────────────────────────

export interface TrialRow {
  id: string;
  session_id: string;
  question_id: string;
  trial_index: number;
  option_id: string | null;
  source: string | null;
  rt_us: number | null;
  correct: boolean | null;
  sampled_timings: unknown;
  provenance: {
    onsetMethod?: string | null;
    responseMethod?: string | null;
    crossOriginIsolated?: boolean;
    [key: string]: unknown;
  } | null;
  invalidated: string | null;
  client_id: string;
}

export async function getTrials(
  request: APIRequestContext,
  sessionId: string,
  session: SessionCredential
): Promise<TrialRow[]> {
  return authedJson(request, 'GET', `/sessions/${sessionId}/trials`, session);
}

/** Poll the trials endpoint until at least `expected` rows have synced. */
export async function pollTrials(
  request: APIRequestContext,
  sessionId: string,
  session: SessionCredential,
  expected: number,
  timeoutMs = 30000
): Promise<TrialRow[]> {
  const deadline = Date.now() + timeoutMs;
  let last: TrialRow[] = [];
  while (Date.now() < deadline) {
    last = await getTrials(request, sessionId, session);
    if (last.length >= expected) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

// ── Questionnaire definitions ────────────────────────────────────────────────

function baseDefinition(name: string, question: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    id: `reaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    version: '1.0.0',
    name,
    created: now,
    modified: now,
    settings: {
      webgl: { targetFPS: 120 },
      allowBackNavigation: false,
      showProgressBar: false,
      randomizationSeed: 'rt6-seed',
      // Skip the consent gate so the fillout starts on the first click.
      requireConsent: false,
      allowAnonymous: true,
    },
    variables: [],
    pages: [{ id: 'p1', questions: [question.id as string] }],
    questions: [{ ...question, order: 0 }],
    flow: [],
  };
}

const LEFT_RIGHT_RESPONSE_SET = {
  options: [
    { id: 'left', label: 'Left', bindings: [{ source: 'keyboard', key: 'f', on: 'down' }] },
    { id: 'right', label: 'Right', bindings: [{ source: 'keyboard', key: 'j', on: 'down' }] },
  ],
};

/**
 * A standard-style RT study authored through the `custom` block model so the four
 * test trials carry explicit fast timings and the authored ResponseSet
 * (Left→f / Right→j, `left` correct). Every trial shows "GO"; the participant
 * picks Left or Right, so correctness is a pure function of which key was pressed.
 */
export function buildReactionTimeDefinition(options?: {
  name?: string;
  testTrials?: number;
}) {
  const name = options?.name ?? `RT Golden ${Date.now()}`;
  const testTrials = options?.testTrials ?? 4;

  const trials = Array.from({ length: testTrials }, (_, index) => ({
    id: `t${index}`,
    name: `Trial ${index}`,
    condition: 'go',
    repeat: 1,
    isPractice: false,
    stimulus: { kind: 'text', text: 'GO', fontPx: 64 },
    validKeys: ['f', 'j'],
    requireCorrect: true,
    fixationMs: 60,
    preStimulusDelayMs: 0,
    stimulusDurationMs: 0,
    responseTimeoutMs: 2000,
    interTrialIntervalMs: 40,
  }));

  const question = {
    id: 'rt_standard',
    type: 'reaction-time',
    required: true,
    text: 'Reaction time task',
    config: {
      task: { type: 'custom' },
      targetFPS: 120,
      practice: false,
      testTrials,
      stimulus: { type: 'text', content: 'GO', fixation: { type: 'cross', duration: 60 } },
      response: {
        mode: 'keyboard',
        validKeys: ['f', 'j'],
        timeout: 2000,
        requireCorrect: true,
        responseSet: LEFT_RIGHT_RESPONSE_SET,
        correctOptionIds: ['left'],
      },
      feedback: false,
      study: {
        blocks: [
          {
            id: 'test',
            name: 'Test',
            kind: 'test',
            randomizeOrder: false,
            repetitions: 1,
            trials,
          },
        ],
      },
    },
  };

  return baseDefinition(name, question);
}

/**
 * A two-binding mapping study: the single `left` option is bound to BOTH `f` and
 * `g`. Either key must resolve to `left`. One trial keeps the assertion crisp.
 */
export function buildReactionTimeMappingDefinition(options?: { name?: string }) {
  const name = options?.name ?? `RT Mapping ${Date.now()}`;
  const responseSet = {
    options: [
      {
        id: 'left',
        label: 'Left',
        bindings: [
          { source: 'keyboard', key: 'f', on: 'down' },
          { source: 'keyboard', key: 'g', on: 'down' },
        ],
      },
    ],
  };

  const question = {
    id: 'rt_mapping',
    type: 'reaction-time',
    required: true,
    text: 'Mapping task',
    config: {
      task: { type: 'custom' },
      targetFPS: 120,
      practice: false,
      testTrials: 2,
      stimulus: { type: 'text', content: 'GO', fixation: { type: 'cross', duration: 60 } },
      response: {
        mode: 'keyboard',
        validKeys: ['f', 'g'],
        timeout: 2000,
        requireCorrect: true,
        responseSet,
        correctOptionIds: ['left'],
      },
      feedback: false,
      study: {
        blocks: [
          {
            id: 'test',
            name: 'Test',
            kind: 'test',
            randomizeOrder: false,
            repetitions: 1,
            trials: [0, 1].map((index) => ({
              id: `t${index}`,
              name: `Trial ${index}`,
              condition: 'go',
              repeat: 1,
              isPractice: false,
              stimulus: { kind: 'text', text: 'GO', fontPx: 64 },
              validKeys: ['f', 'g'],
              requireCorrect: true,
              fixationMs: 60,
              preStimulusDelayMs: 0,
              stimulusDurationMs: 0,
              responseTimeoutMs: 2000,
              interTrialIntervalMs: 40,
            })),
          },
        ],
      },
    },
  };

  return baseDefinition(name, question);
}

/**
 * A reaction-experiment study whose single trial shows an IMAGE stimulus resolved
 * from `mediaId`. The runtime rewrites the src to the same-origin proxy
 * (`/api/media/{id}/content`) and gates the block on decoding it — the seam the
 * preload-fail spec hangs.
 */
export function buildReactionExperimentImageDefinition(options: {
  name?: string;
  mediaId: string;
}) {
  const name = options.name ?? `RT Image ${Date.now()}`;

  const question = {
    id: 'rt_image',
    type: 'reaction-experiment',
    required: true,
    text: 'Image reaction task',
    config: {
      metadata: { prompt: 'Press F when the image appears', description: '', template: 'standard' },
      stage: {
        width: 960,
        height: 540,
        background: '#06131f',
        renderer: 'webgl',
        targetFPS: 120,
        vsync: true,
        antialias: true,
        showGrid: false,
      },
      assets: [
        {
          id: 'asset-1',
          mediaId: options.mediaId,
          label: 'Probe',
          kind: 'image',
        },
      ],
      blocks: [
        {
          id: 'test',
          name: 'Test',
          kind: 'test',
          randomizeOrder: false,
          repetitions: 1,
          trials: [
            {
              id: 't0',
              name: 'Trial 0',
              condition: 'go',
              repeat: 1,
              isPractice: false,
              stimulus: { kind: 'image', src: '' },
              assetPoolIds: ['asset-1'],
              validKeys: ['f', 'j'],
              correctResponse: 'f',
              requireCorrect: false,
              fixationMs: 60,
              preStimulusDelayMs: 0,
              stimulusDurationMs: 0,
              responseTimeoutMs: 2000,
              interTrialIntervalMs: 40,
              positionVariants: [],
              phases: [],
            },
          ],
        },
      ],
      response: {
        mode: 'keyboard',
        validKeys: ['f', 'j'],
        correctKey: 'f',
        requireCorrect: false,
        timeoutMs: 2000,
        saveAs: 'reaction_experiment',
      },
      feedback: { enabled: false },
      randomization: {
        seed: 'rt6-image',
        randomizeBlockOrder: false,
        randomizeTrialOrder: false,
        positionMode: 'fixed',
        assetSelection: 'fixed',
        conditionStrategy: 'none',
        counterbalancing: { enabled: false, groups: 2, strategy: 'participant-hash' },
        previewParticipantId: 'rt6',
      },
    },
  };

  return baseDefinition(name, question);
}

// ── Provisioning ─────────────────────────────────────────────────────────────

/**
 * Create + publish a questionnaire under an EXISTING workspace and return its
 * fillout code. Studies share one workspace (see `reaction-fixtures`) so the lane
 * registers a single user — the auth limiter is 10 requests/60 s per IP, which a
 * per-test registration would trip.
 */
export async function publishDefinition(
  request: APIRequestContext,
  workspace: ProvisionedWorkspace,
  definition: ReturnType<typeof baseDefinition>
): Promise<ProvisionedReactionStudy> {
  const questionnaire = await authedJson(
    request,
    'POST',
    `/projects/${workspace.projectId}/questionnaires`,
    workspace,
    { name: definition.name, description: 'RT-6 lane', content: definition, settings: {} }
  );
  await authedJson(
    request,
    'POST',
    `/projects/${workspace.projectId}/questionnaires/${questionnaire.id}/publish`,
    workspace
  );
  return {
    workspace,
    questionnaireId: questionnaire.id,
    questionnaireCode: deriveQuestionnaireCode(questionnaire.id),
  };
}

export function reactionTimeStudy(
  request: APIRequestContext,
  workspace: ProvisionedWorkspace,
  options?: { testTrials?: number }
): Promise<ProvisionedReactionStudy> {
  return publishDefinition(request, workspace, buildReactionTimeDefinition(options));
}

export function reactionMappingStudy(
  request: APIRequestContext,
  workspace: ProvisionedWorkspace
): Promise<ProvisionedReactionStudy> {
  return publishDefinition(request, workspace, buildReactionTimeMappingDefinition());
}

/** A minimal valid 1×1 PNG (magic-byte allowlist on the upload endpoint requires a real image). */
const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export async function uploadPng(
  request: APIRequestContext,
  workspace: ProvisionedWorkspace
): Promise<string> {
  const response = await request.fetch('/api/media', {
    method: 'POST',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: `qd_session=${workspace.sessionCookie}`,
      'X-CSRF-Token': workspace.csrfToken,
    },
    multipart: {
      organization_id: workspace.organizationId,
      file: {
        name: 'probe.png',
        mimeType: 'image/png',
        buffer: Buffer.from(ONE_PX_PNG_BASE64, 'base64'),
      },
    },
  });
  if (!response.ok()) {
    throw new Error(`Media upload failed (${response.status()}): ${await response.text()}`);
  }
  const body = await response.json();
  return (body.asset?.id ?? body.id) as string;
}

export async function reactionExperimentImageStudy(
  request: APIRequestContext,
  workspace: ProvisionedWorkspace
): Promise<ProvisionedReactionImageStudy> {
  const mediaId = await uploadPng(request, workspace);
  const definition = buildReactionExperimentImageDefinition({ mediaId });
  const study = await publishDefinition(request, workspace, definition);
  return { ...study, mediaId };
}

// ── Phase-hook driving ───────────────────────────────────────────────────────

interface RtPhaseDetail {
  phase: string;
  trialIndex: number;
  timestamp: number;
}

declare global {
  interface Window {
    __rtPhases?: RtPhaseDetail[];
  }
}

/**
 * Arm the engine's test-mode phase hook BEFORE any page script runs: set the
 * localStorage flag the engine reads at construction and install a durable
 * collector so no `rt-phase` event is missed between polls. Must be called before
 * `page.goto` of the fillout route.
 */
export async function installPhaseHook(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    try {
      window.localStorage.setItem(key, 'true');
    } catch {
      /* storage may be unavailable pre-navigation; the engine falls back to off */
    }
    window.__rtPhases = [];
    window.addEventListener('rt-phase', (event) => {
      window.__rtPhases!.push((event as CustomEvent<RtPhaseDetail>).detail);
    });
  }, RT_PHASE_HOOK_KEY);
}

/** Resolve once a `stimulus` phase event for `trialIndex` (or later) has fired. */
export async function waitForStimulus(
  page: Page,
  trialIndex: number,
  timeoutMs = 20000
): Promise<void> {
  await page.waitForFunction(
    (index) => (window.__rtPhases ?? []).some((p) => p.phase === 'stimulus' && p.trialIndex >= index),
    trialIndex,
    { timeout: timeoutMs }
  );
}

/** Resolve once any event for `phase` has fired. */
export async function waitForPhase(page: Page, phase: string, timeoutMs = 20000): Promise<void> {
  await page.waitForFunction(
    (target) => (window.__rtPhases ?? []).some((p) => p.phase === target),
    phase,
    { timeout: timeoutMs }
  );
}

/** All phase names collected so far (order preserved). */
export async function collectedPhases(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__rtPhases ?? []).map((p) => p.phase));
}

export function filloutPath(code: string): string {
  return `/q/${code.toUpperCase()}`;
}

/**
 * Click the welcome-screen start button and return the anonymous session id the
 * runtime creates (`POST /api/sessions` → 201). The welcome screen must already
 * be visible.
 */
export async function clickStartCaptureSession(page: Page): Promise<string> {
  const sessionCreated = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'POST' &&
      url.pathname === '/api/sessions' &&
      response.status() === 201
    );
  });
  await page.getByTestId('fillout-start-button').click();
  const created = await (await sessionCreated).json();
  return created.id as string;
}
