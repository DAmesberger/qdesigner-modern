import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import type { PageData } from './$types';

/**
 * Regression guard: cancelling the "Change role?" confirm must leave the role
 * <select> showing the member's ACTUAL role.
 *
 * The role <select> is one-way bound (`value={member.role}`) and commits only
 * after the confirm resolves, so between the user's pick and the commit the DOM
 * holds a value the state does not. The cancel path used to "revert" it with
 * `members = members` — a self-assignment of a `$state` rune. That is
 * referentially identical, so Svelte 5 skips the update entirely: it is a no-op.
 * The <select> therefore kept displaying the role the user had just *declined*
 * to grant, and the UI lied about the member's real role.
 *
 * The seam: mount the page with a viewer holding a role the user can edit,
 * pick a different role, resolve the confirm as CANCELLED, and assert the
 * element's own `.value` snapped back. Reinstate `members = members` and this
 * fails (the select stays on 'admin').
 */

/**
 * Stateful server fake: `update` mutates the roster and the page's post-commit
 * `reloadMembers()` refetch reads it back. Without this the refetch would hand
 * the page a stale (or empty) roster and mask the commit.
 */
const h = vi.hoisted(() => {
  const roster = [
    { user_id: 'user-me', email: 'me@example.com', full_name: 'Me', role: 'owner' },
    {
      user_id: 'user-them',
      email: 'them@example.com',
      full_name: 'Them',
      role: 'viewer',
      joined_at: '2026-01-01T00:00:00Z',
    },
  ];
  return {
    roster,
    confirmDialog: vi.fn(),
    membersList: vi.fn(async () => roster.map((m) => ({ ...m }))),
    updateMember: vi.fn(async (_projectId: string, userId: string, body: { role: string }) => {
      const target = roster.find((m) => m.user_id === userId);
      if (target) target.role = body.role;
    }),
  };
});

vi.mock('$lib/stores/confirm.svelte', () => ({
  confirmDialog: h.confirmDialog,
}));

vi.mock('$lib/stores/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('$lib/services/api', () => ({
  api: {
    projects: {
      members: {
        list: h.membersList,
        add: vi.fn(),
        update: h.updateMember,
        remove: vi.fn(),
      },
      transferOwnership: vi.fn(),
    },
    projectInvitations: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
  },
}));

import Page from './+page.svelte';

const CURRENT_USER = 'user-me';
const TARGET_USER = 'user-them';

function pageData(): PageData {
  return {
    project: { id: 'proj-1', name: 'Test Project' },
    // The viewer is the project owner → canManage, and may edit the other row.
    members: h.roster.map((m) => ({ ...m })),
    orgMembers: [],
    invitations: [],
    organizationId: 'org-1',
    currentUserId: CURRENT_USER,
  } as unknown as PageData;
}

function roleSelect(container: HTMLElement): HTMLSelectElement {
  const select = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Change role for them@example.com"]'
  );
  if (!select) throw new Error('role <select> for the editable member did not render');
  return select;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // The stateful fake persists across tests — put the roster back.
  const target = h.roster.find((m) => m.user_id === TARGET_USER);
  if (target) target.role = 'viewer';
});

describe('project members — role change confirm', () => {
  it('reverts the <select> to the original role when the confirm is cancelled', async () => {
    h.confirmDialog.mockResolvedValue(false); // user hits Cancel

    const { container } = render(Page, { props: { data: pageData() } });
    const select = roleSelect(container);
    expect(select.value).toBe('viewer');

    await fireEvent.change(select, { target: { value: 'admin' } });

    await waitFor(() => expect(h.confirmDialog).toHaveBeenCalledTimes(1));

    // The cancel must put the control back on the committed role. With the
    // `members = members` no-op, `select.value` stays 'admin' here.
    await waitFor(() =>
      expect(select.value).toBe('viewer')
    );
    expect(h.updateMember).not.toHaveBeenCalled();
  });

  it('commits the new role when the confirm is accepted', async () => {
    h.confirmDialog.mockResolvedValue(true);

    const { container } = render(Page, { props: { data: pageData() } });
    const select = roleSelect(container);

    await fireEvent.change(select, { target: { value: 'admin' } });

    await waitFor(() =>
      expect(h.updateMember).toHaveBeenCalledWith('proj-1', TARGET_USER, { role: 'admin' })
    );
    expect(select.value).toBe('admin');
  });
});
