import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { deriveQuestionnaireCode, type ProvisionedWorkspace } from '../helpers/fullstack-api';

/**
 * @form-lane helpers (issue #35). Seed real form-style studies through the public API
 * (a published questionnaire whose questions render on the DOM overlay path, not WebGL),
 * then read the per-response rows the runtime persists (`GET /api/sessions/{id}/responses`)
 * to assert the SERVER-SIDE `value` — the thing the classic-path audit found untested.
 *
 * Mirrors `reaction-api.ts`: same authed-JSON call, same create+publish flow, same
 * `deriveQuestionnaireCode` fillout-code derivation. Form questions carry no phase hook —
 * the DOM overlay is driven directly (fill inputs, click Continue).
 */

interface SessionCredential {
  sessionCookie: string;
  csrfToken: string;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Minimal same-origin authed JSON call — mirrors reaction-api's private helper. */
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
    throw new Error(
      `API ${method} /api${path} failed (${response.status()}): ${await response.text()}`
    );
  }
  if (response.status() === 204) return null;
  return response.json();
}

// ── Response read-back ─────────────────────────────────────────────────────────

export interface ResponseRow {
  id: string;
  session_id: string;
  question_id: string;
  value: unknown;
  reaction_time_us: number | null;
  presented_at: string | null;
  answered_at: string | null;
  metadata: unknown;
  created_at: string;
  client_id: string;
}

export async function getResponses(
  request: APIRequestContext,
  sessionId: string,
  session: SessionCredential
): Promise<ResponseRow[]> {
  return authedJson(request, 'GET', `/sessions/${sessionId}/responses`, session);
}

/** Poll the responses endpoint until at least `expected` rows have synced. */
export async function pollResponses(
  request: APIRequestContext,
  sessionId: string,
  session: SessionCredential,
  expected: number,
  timeoutMs = 30000
): Promise<ResponseRow[]> {
  const deadline = Date.now() + timeoutMs;
  let last: ResponseRow[] = [];
  while (Date.now() < deadline) {
    last = await getResponses(request, sessionId, session);
    if (last.length >= expected) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

/**
 * Poll until every listed question has a response whose `value.status === 'uploaded'`
 * (the binary-answer patch has landed server-side, issue #34). Returns the latest rows.
 */
export async function pollUploadedResponses(
  request: APIRequestContext,
  sessionId: string,
  session: SessionCredential,
  questionIds: string[],
  timeoutMs = 45000
): Promise<ResponseRow[]> {
  const deadline = Date.now() + timeoutMs;
  let last: ResponseRow[] = [];
  while (Date.now() < deadline) {
    last = await getResponses(request, sessionId, session);
    const allUploaded = questionIds.every((qid) => {
      const value = last.find((r) => r.question_id === qid)?.value as
        | { status?: string }
        | undefined;
      return value?.status === 'uploaded';
    });
    if (allUploaded) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

/** The single response row for a question id (throws if absent — caller asserts presence first). */
export function responseFor(rows: ResponseRow[], questionId: string): ResponseRow {
  const row = rows.find((r) => r.question_id === questionId);
  if (!row) {
    throw new Error(
      `No response row for question "${questionId}" (have: ${rows.map((r) => r.question_id).join(', ')})`
    );
  }
  return row;
}

// ── Questionnaire definitions ────────────────────────────────────────────────

export interface FormQuestion {
  id: string;
  type: string;
  required?: boolean;
  order?: number;
  display?: Record<string, unknown>;
  config?: Record<string, unknown>;
  responseType?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * A minimal published-questionnaire definition carrying only DOM-overlay questions —
 * no WebGL/reaction paradigm, so the fillout runtime never allocates a renderer.
 * Consent is skipped (`requireConsent: false`) so the fillout starts on the first click.
 */
export function buildFormDefinition(name: string, questions: FormQuestion[]) {
  const now = new Date().toISOString();
  const ordered = questions.map((q, index) => ({ order: index, ...q }));
  return {
    id: `form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    version: '1.0.0',
    name,
    created: now,
    modified: now,
    settings: {
      webgl: { targetFPS: 60 },
      allowBackNavigation: false,
      showProgressBar: false,
      randomizationSeed: 'form-lane-seed',
      requireConsent: false,
      allowAnonymous: true,
    },
    variables: [],
    pages: [{ id: 'p1', questions: ordered.map((q) => q.id) }],
    questions: ordered,
    flow: [],
  };
}

// ── Provisioning ─────────────────────────────────────────────────────────────

export interface ProvisionedFormStudy {
  workspace: ProvisionedWorkspace;
  questionnaireId: string;
  questionnaireCode: string;
}

/**
 * Create + publish a questionnaire under an EXISTING workspace and return its fillout
 * code. Studies share one workspace (see `form-fixtures`) so the lane registers a single
 * user — the auth limiter is 10 requests/60 s per IP, which a per-test registration would
 * trip.
 */
export async function publishFormStudy(
  request: APIRequestContext,
  workspace: ProvisionedWorkspace,
  questions: FormQuestion[],
  name = `Form ${Date.now()}`
): Promise<ProvisionedFormStudy> {
  const definition = buildFormDefinition(name, questions);
  const questionnaire = await authedJson(
    request,
    'POST',
    `/projects/${workspace.projectId}/questionnaires`,
    workspace,
    { name: definition.name, description: '@form lane', content: definition, settings: {} }
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

export function filloutPath(code: string): string {
  return `/q/${code.toUpperCase()}`;
}

// ── DOM-overlay driving ───────────────────────────────────────────────────────

/**
 * Click the welcome-screen start button and return the anonymous session id the runtime
 * creates (`POST /api/sessions` → 201). The welcome screen must already be visible.
 */
export async function startFormSession(page: Page): Promise<string> {
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

/**
 * The currently-presented form card, scoped to its question type. The overlay presents
 * items one at a time; the card carries `data-question-type`, so waiting on the expected
 * type confirms the right item is up before answering it.
 */
export function currentCard(page: Page, questionType: string): Locator {
  return page.locator(`.form-card[data-question-type="${questionType}"]`);
}

export async function waitForCard(page: Page, questionType: string, timeoutMs = 30000): Promise<Locator> {
  const card = currentCard(page, questionType);
  await expect(card).toBeVisible({ timeout: timeoutMs });
  return card;
}

/** The Continue button for the active item. */
export function continueButton(page: Page): Locator {
  return page.getByTestId('fillout-form-continue');
}

/** Click Continue and wait for the current card to be replaced (advance to the next item). */
export async function clickContinue(page: Page): Promise<void> {
  await continueButton(page).click();
}

/**
 * Pre-load the runtime Svelte component for each module type into the registry's cache
 * while online. The dev server lazy-loads each `.svelte` chunk on first render, so a type
 * first needed OFFLINE can't fetch its chunk; warming the registry cache up front lets a
 * whole multi-type form run offline (and, by answering offline, sync once on reconnect
 * rather than per-response — staying under the `/sync` per-IP limiter). Best-effort: a
 * type that fails to warm simply falls back to its on-demand (online) load.
 */
export async function warmModules(page: Page, types: string[]): Promise<void> {
  await page.evaluate(async (moduleTypes) => {
    try {
      const mod = await import('/src/lib/modules/registry.ts');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev-server module shape
      const registry = (mod as any).moduleRegistry;
      for (const type of moduleTypes) {
        try {
          await registry.loadComponent(type, 'runtime');
        } catch {
          /* fall back to on-demand load */
        }
      }
    } catch {
      /* registry not importable at this URL — skip warming */
    }
  }, types);
}

/** Draw a short stroke on a canvas via real mouse events (down → move → up). */
export async function drawStroke(page: Page, canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 30, y - 20);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 20, { steps: 6 });
  await page.mouse.move(x + 50, y - 10, { steps: 4 });
  await page.mouse.up();
}

// ── IndexedDB inspection (offline-first assertions) ───────────────────────────

export interface BinaryRowView {
  clientId: string;
  sessionId: string;
  questionId: string;
  name: string;
  size: number;
  mimeType: string;
  status: string;
  mediaUrl?: string;
  hasBytes: boolean;
}

/**
 * Read the `filloutBinaries` store from the offline DB (`QDesignerOfflineDB`), mapping out
 * the raw ArrayBuffer bytes (kept as a `hasBytes` flag) so the rows serialize across the
 * Playwright bridge. This is the unencrypted structured reference backing each binary
 * answer — `clientId`, `status`, name/size/mimeType — so a pending capture is assertable
 * without the at-rest response encryption key.
 */
export async function readBinaries(page: Page, sessionId?: string): Promise<BinaryRowView[]> {
  const rows = await page.evaluate(async () => {
    const openDb = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('QDesignerOfflineDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const database = await openDb();
    try {
      if (!database.objectStoreNames.contains('filloutBinaries')) return [];
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const tx = database.transaction('filloutBinaries', 'readonly');
        const getAll = tx.objectStore('filloutBinaries').getAll();
        getAll.onsuccess = () =>
          resolve(
            (getAll.result as Record<string, unknown>[]).map((r) => ({
              clientId: r.clientId,
              sessionId: r.sessionId,
              questionId: r.questionId,
              name: r.name,
              size: r.size,
              mimeType: r.mimeType,
              status: r.status,
              mediaUrl: r.mediaUrl,
              hasBytes:
                r.data instanceof ArrayBuffer && (r.data as ArrayBuffer).byteLength > 0,
            }))
          );
        getAll.onerror = () => reject(getAll.error);
      });
    } finally {
      database.close();
    }
  });
  const views = rows as unknown as BinaryRowView[];
  return sessionId ? views.filter((r) => r.sessionId === sessionId) : views;
}

/** Count `filloutBinaries` rows (optionally scoped to a session). */
export async function countBinaries(page: Page, sessionId?: string): Promise<number> {
  return (await readBinaries(page, sessionId)).length;
}

/** Count locally-persisted responses that have NOT yet synced to the server, for a session. */
export async function countUnsyncedResponses(page: Page, sessionId: string): Promise<number> {
  return page.evaluate((sid) => {
    const openDb = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('QDesignerOfflineDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    return openDb().then(
      (database) =>
        new Promise<number>((resolve, reject) => {
          if (!database.objectStoreNames.contains('filloutResponses')) {
            database.close();
            resolve(0);
            return;
          }
          const tx = database.transaction('filloutResponses', 'readonly');
          const getAll = tx.objectStore('filloutResponses').getAll();
          getAll.onsuccess = () => {
            const rows = getAll.result as { sessionId: string; synced: number }[];
            database.close();
            resolve(rows.filter((r) => r.sessionId === sid && r.synced === 0).length);
          };
          getAll.onerror = () => {
            database.close();
            reject(getAll.error);
          };
        })
    );
  }, sessionId);
}

/**
 * Attach a genuinely-sniffable PNG to a `<input type=file>` by encoding a real canvas via
 * `canvas.toBlob('image/png')` — a true PNG the server's magic-byte allowlist accepts — and
 * injecting it through a `DataTransfer` so the module's `change` handler runs. Playwright's
 * `setInputFiles` can't source bytes generated inside the page, hence the manual path.
 */
export async function setCanvasPngFile(input: Locator, name = 'answer.png'): Promise<void> {
  await input.evaluate(async (el, filename) => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas.toBlob produced no PNG');
    const file = new File([blob], filename, { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const fileInput = el as HTMLInputElement;
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
}

/**
 * Set a Svelte-bound input's value programmatically: the native value setter plus a
 * dispatched `input` event, so the component's `oninput` handler runs (a raw
 * `element.value =` assignment does not trigger it).
 */
export async function setBoundInput(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    const proto =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

// ── Question builders ─────────────────────────────────────────────────────────
// The stored shape the fillout `load` serves and `buildModuleRuntimeConfig` flattens
// into the flat `config` each runtime module reads. Prompts live under `display.prompt`;
// constraint keys (minLength / min,max / maxSize / maxFiles) live under `config`.

export function textInputQuestion(
  id: string,
  opts: { prompt: string; required?: boolean; minLength?: number; maxLength?: number; inputType?: string }
): FormQuestion {
  return {
    id,
    type: 'text-input',
    required: opts.required ?? true,
    display: { prompt: opts.prompt },
    config: {
      inputType: opts.inputType ?? 'text',
      ...(opts.minLength !== undefined ? { minLength: opts.minLength } : {}),
      ...(opts.maxLength !== undefined ? { maxLength: opts.maxLength } : {}),
    },
  };
}

export function numberInputQuestion(
  id: string,
  opts: { prompt: string; required?: boolean; min?: number; max?: number }
): FormQuestion {
  return {
    id,
    type: 'number-input',
    required: opts.required ?? true,
    display: { prompt: opts.prompt },
    config: {
      ...(opts.min !== undefined ? { min: opts.min } : {}),
      ...(opts.max !== undefined ? { max: opts.max } : {}),
    },
  };
}

export function fileUploadQuestion(
  id: string,
  opts: {
    prompt: string;
    required?: boolean;
    maxSizeBytes?: number;
    maxFiles?: number;
    accept?: string[];
  }
): FormQuestion {
  return {
    id,
    type: 'file-upload',
    required: opts.required ?? true,
    display: { prompt: opts.prompt },
    config: {
      ...(opts.maxSizeBytes !== undefined ? { maxSize: opts.maxSizeBytes } : {}),
      ...(opts.maxFiles !== undefined ? { maxFiles: opts.maxFiles } : {}),
      ...(opts.accept !== undefined ? { accept: opts.accept } : {}),
      // Off the drag-drop code path: a plain "Choose File" button is simpler to drive.
      dragDrop: false,
    },
  };
}
