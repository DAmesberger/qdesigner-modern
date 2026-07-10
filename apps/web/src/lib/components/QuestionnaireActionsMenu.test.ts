import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import QuestionnaireActionsMenu from './QuestionnaireActionsMenu.svelte';
import type { QuestionnaireDefinition } from '$lib/shared/types/api';

vi.mock('$lib/services/api', () => ({
  api: {
    questionnaires: {
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('$lib/stores/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Imported after the mock so these resolve to the vi.fn() stubs.
import { api } from '$lib/services/api';

const baseQuestionnaire: QuestionnaireDefinition = {
  id: 'q1',
  projectId: 'p1',
  name: 'Reaction Task',
  description: 'A timing study',
  version: 1,
  content: { pages: [] },
  status: 'draft',
  settings: {},
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  publishedAt: null,
};

// jsdom lacks the Web Animations API Svelte transitions reach for.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling a missing jsdom API
  const proto = Element.prototype as any;
  if (typeof proto.animate !== 'function') {
    proto.animate = () => ({
      cancel() {},
      finish() {},
      onfinish: null,
      finished: Promise.resolve(),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function trigger() {
  return document.querySelector('[data-testid="questionnaire-actions-q1"]') as HTMLButtonElement;
}

describe('QuestionnaireActionsMenu', () => {
  it('renders nothing when the viewer can neither manage nor delete', () => {
    render(QuestionnaireActionsMenu, {
      questionnaire: baseQuestionnaire,
      projectId: 'p1',
    });
    expect(trigger()).toBeNull();
  });

  it('opens the menu and prefills the rename dialog with the current name', async () => {
    render(QuestionnaireActionsMenu, {
      questionnaire: baseQuestionnaire,
      projectId: 'p1',
      canManage: true,
      canDelete: true,
    });

    await fireEvent.click(trigger());
    await tick();

    const rename = document.querySelector(
      '[data-testid="questionnaire-action-rename"]'
    ) as HTMLButtonElement;
    expect(rename).toBeTruthy();
    await fireEvent.click(rename);
    await tick();

    const input = document.querySelector('#rename-questionnaire-name') as HTMLInputElement;
    expect(input.value).toBe('Reaction Task');
  });

  it('renames through the update endpoint', async () => {
    (api.questionnaires.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseQuestionnaire,
      name: 'Renamed Task',
    });
    const onRenamed = vi.fn();
    render(QuestionnaireActionsMenu, {
      questionnaire: baseQuestionnaire,
      projectId: 'p1',
      canManage: true,
      onRenamed,
    });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="questionnaire-action-rename"]') as HTMLButtonElement
    );
    await tick();

    const input = document.querySelector('#rename-questionnaire-name') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Renamed Task' } });
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="questionnaire-rename-confirm"]') as HTMLButtonElement
    );
    await tick();

    expect(api.questionnaires.update).toHaveBeenCalledWith('p1', 'q1', { name: 'Renamed Task' });
    expect(onRenamed).toHaveBeenCalled();
  });

  it('duplicates by fetching the definition then creating a copy', async () => {
    (api.questionnaires.get as ReturnType<typeof vi.fn>).mockResolvedValue(baseQuestionnaire);
    (api.questionnaires.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseQuestionnaire,
      id: 'q2',
      name: 'Copy of Reaction Task',
    });
    const onDuplicated = vi.fn();
    render(QuestionnaireActionsMenu, {
      questionnaire: baseQuestionnaire,
      projectId: 'p1',
      canManage: true,
      onDuplicated,
    });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="questionnaire-action-duplicate"]') as HTMLButtonElement
    );
    await tick();
    await tick();

    expect(api.questionnaires.get).toHaveBeenCalledWith('p1', 'q1');
    expect(api.questionnaires.create).toHaveBeenCalledWith('p1', {
      name: 'Copy of Reaction Task',
      description: 'A timing study',
      content: baseQuestionnaire.content,
      settings: baseQuestionnaire.settings,
    });
    expect(onDuplicated).toHaveBeenCalled();
  });

  it('archives a draft questionnaire into the archived status', async () => {
    (api.questionnaires.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseQuestionnaire,
      status: 'archived',
    });
    const onArchived = vi.fn();
    render(QuestionnaireActionsMenu, {
      questionnaire: baseQuestionnaire,
      projectId: 'p1',
      canManage: true,
      onArchived,
    });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="questionnaire-action-archive"]') as HTMLButtonElement
    );
    await tick();

    expect(api.questionnaires.update).toHaveBeenCalledWith('p1', 'q1', { status: 'archived' });
  });

  it('restores an archived questionnaire back to draft', async () => {
    (api.questionnaires.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseQuestionnaire,
      status: 'draft',
    });
    render(QuestionnaireActionsMenu, {
      questionnaire: { ...baseQuestionnaire, status: 'archived' },
      projectId: 'p1',
      canManage: true,
    });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="questionnaire-action-archive"]') as HTMLButtonElement
    );
    await tick();

    expect(api.questionnaires.update).toHaveBeenCalledWith('p1', 'q1', { status: 'draft' });
  });

  it('keeps delete disabled until the typed name matches, then calls the API', async () => {
    (api.questionnaires.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(QuestionnaireActionsMenu, {
      questionnaire: baseQuestionnaire,
      projectId: 'p1',
      canDelete: true,
      onDeleted,
    });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="questionnaire-action-delete"]') as HTMLButtonElement
    );
    await tick();

    const confirm = document.querySelector(
      '[data-testid="questionnaire-delete-confirm"]'
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const input = document.querySelector('#delete-questionnaire-confirm') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Reaction Task' } });
    await tick();
    expect(confirm.disabled).toBe(false);

    await fireEvent.click(confirm);
    await tick();
    expect(api.questionnaires.delete).toHaveBeenCalledWith('p1', 'q1');
    expect(onDeleted).toHaveBeenCalledWith('q1');
  });

  it('does not delete when the typed name does not match', async () => {
    const onDeleted = vi.fn();
    render(QuestionnaireActionsMenu, {
      questionnaire: baseQuestionnaire,
      projectId: 'p1',
      canDelete: true,
      onDeleted,
    });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="questionnaire-action-delete"]') as HTMLButtonElement
    );
    await tick();

    const input = document.querySelector('#delete-questionnaire-confirm') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'wrong name' } });
    await tick();

    const confirm = document.querySelector(
      '[data-testid="questionnaire-delete-confirm"]'
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(api.questionnaires.delete).not.toHaveBeenCalled();
  });
});
