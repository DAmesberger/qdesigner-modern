import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ProjectActionsMenu from './ProjectActionsMenu.svelte';
import type { Project } from '$lib/shared/types/api';

vi.mock('$lib/services/api', () => ({
  api: {
    projects: {
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

const baseProject: Project = {
  id: 'p1',
  organizationId: 'o1',
  name: 'Alpha Study',
  code: 'ALPHA',
  description: null,
  isPublic: false,
  status: 'active',
  maxParticipants: null,
  irbNumber: null,
  startDate: null,
  endDate: null,
  settings: {},
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
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
  return document.querySelector('[data-testid="project-actions-p1"]') as HTMLButtonElement;
}

describe('ProjectActionsMenu', () => {
  it('renders nothing when the viewer can neither manage nor delete', () => {
    render(ProjectActionsMenu, { project: baseProject });
    expect(trigger()).toBeNull();
  });

  it('opens the menu and prefills the rename dialog with the current name', async () => {
    render(ProjectActionsMenu, { project: baseProject, canManage: true, canDelete: true });

    await fireEvent.click(trigger());
    await tick();

    const rename = document.querySelector(
      '[data-testid="project-action-rename"]'
    ) as HTMLButtonElement;
    expect(rename).toBeTruthy();
    await fireEvent.click(rename);
    await tick();

    const input = document.querySelector('#rename-project-name') as HTMLInputElement;
    expect(input.value).toBe('Alpha Study');
  });

  it('keeps delete disabled until the typed name matches, then calls the API', async () => {
    (api.projects.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(ProjectActionsMenu, { project: baseProject, canDelete: true, onDeleted });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="project-action-delete"]') as HTMLButtonElement
    );
    await tick();

    const confirm = document.querySelector(
      '[data-testid="project-delete-confirm"]'
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const input = document.querySelector('#delete-project-confirm') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Alpha Study' } });
    await tick();
    expect(confirm.disabled).toBe(false);

    await fireEvent.click(confirm);
    await tick();
    expect(api.projects.delete).toHaveBeenCalledWith('p1');
    expect(onDeleted).toHaveBeenCalledWith('p1');
  });

  it('does not delete when the typed name does not match', async () => {
    const onDeleted = vi.fn();
    render(ProjectActionsMenu, { project: baseProject, canDelete: true, onDeleted });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="project-action-delete"]') as HTMLButtonElement
    );
    await tick();

    const input = document.querySelector('#delete-project-confirm') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'wrong name' } });
    await tick();

    const confirm = document.querySelector(
      '[data-testid="project-delete-confirm"]'
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(api.projects.delete).not.toHaveBeenCalled();
  });

  it('archives an active project through the update endpoint', async () => {
    (api.projects.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseProject,
      status: 'archived',
    });
    const onArchived = vi.fn();
    render(ProjectActionsMenu, { project: baseProject, canManage: true, onArchived });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="project-action-archive"]') as HTMLButtonElement
    );
    await tick();

    expect(api.projects.update).toHaveBeenCalledWith('p1', { status: 'archived' });
  });

  it('restores an archived project through the update endpoint', async () => {
    (api.projects.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseProject,
      status: 'active',
    });
    render(ProjectActionsMenu, {
      project: { ...baseProject, status: 'archived' },
      canManage: true,
    });

    await fireEvent.click(trigger());
    await tick();
    await fireEvent.click(
      document.querySelector('[data-testid="project-action-archive"]') as HTMLButtonElement
    );
    await tick();

    expect(api.projects.update).toHaveBeenCalledWith('p1', { status: 'active' });
  });
});
