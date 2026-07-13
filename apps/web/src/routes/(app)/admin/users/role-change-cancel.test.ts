import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

/**
 * Regression guard (org-admin twin of the project-members one): cancelling the
 * "Change role?" confirm must leave the role <select> showing the member's
 * ACTUAL role.
 *
 * The <select> is one-way bound (`value={member.role}`) and only commits after
 * the confirm resolves. The cancel path used to "revert" it with
 * `members = members` — a self-assignment of a `$state` rune, which is
 * referentially identical and so skipped by Svelte 5 outright. The control kept
 * displaying the role the admin had just *declined* to grant.
 *
 * Reinstate `members = members` and the first test fails (select stays 'admin').
 */

const TARGET_USER = 'user-them';

/**
 * Stateful server fake: `changeRole` mutates the roster, and the page's
 * post-commit `loadMembers()` refetch reads it back. Without this the refetch
 * would hand the page a stale roster and mask the commit.
 */
const h = vi.hoisted(() => {
  const roster = [
    {
      organizationId: 'org-1',
      userId: 'user-me',
      role: 'owner',
      status: 'active',
      joinedAt: '2026-01-01T00:00:00Z',
      user: { id: 'user-me', email: 'me@example.com', fullName: 'Me' },
    },
    {
      organizationId: 'org-1',
      userId: 'user-them',
      role: 'viewer',
      status: 'active',
      joinedAt: '2026-01-01T00:00:00Z',
      user: { id: 'user-them', email: 'them@example.com', fullName: 'Them' },
    },
  ];
  return {
    roster,
    confirmDialog: vi.fn(),
    // Fresh copies each call — the page must not be handed its own proxies back.
    membersList: vi.fn(async () => roster.map((m) => ({ ...m }))),
    changeRole: vi.fn(async (_orgId: string, userId: string, role: string) => {
      const target = roster.find((m) => m.userId === userId);
      if (target) target.role = role;
    }),
  };
});

vi.mock('$lib/stores/confirm.svelte', () => ({
  confirmDialog: h.confirmDialog,
}));

vi.mock('$lib/stores/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('$lib/services/auth', () => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({ id: 'user-me', email: 'me@example.com' }),
  },
}));

vi.mock('$lib/services/api', () => ({
  api: {
    organizations: {
      list: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Test Org' }]),
      members: {
        list: h.membersList,
        remove: vi.fn(),
        changeRole: h.changeRole,
        transferOwnership: vi.fn(),
      },
    },
    // Custom roles are admin-only; an empty list just hides that column.
    roles: { list: vi.fn().mockResolvedValue({ roles: [] }), assign: vi.fn() },
  },
}));

import Page from './+page.svelte';

/** Mount and wait for the onMount load to settle into a rendered roster. */
async function mountPage(): Promise<HTMLSelectElement> {
  const { container } = render(Page);
  let select: HTMLSelectElement | null = null;
  await waitFor(() => {
    select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Change role for them@example.com"]'
    );
    if (!select) throw new Error('role <select> for the editable member did not render');
  });
  return select!;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // The stateful fake persists across tests — put the roster back.
  const target = h.roster.find((m) => m.userId === TARGET_USER);
  if (target) target.role = 'viewer';
});

describe('admin users — role change confirm', () => {
  it('reverts the <select> to the original role when the confirm is cancelled', async () => {
    h.confirmDialog.mockResolvedValue(false); // user hits Cancel

    const select = await mountPage();
    expect(select.value).toBe('viewer');

    await fireEvent.change(select, { target: { value: 'admin' } });

    await waitFor(() => expect(h.confirmDialog).toHaveBeenCalledTimes(1));

    // With the `members = members` no-op, `select.value` stays 'admin' here.
    await waitFor(() => expect(select.value).toBe('viewer'));
    expect(h.changeRole).not.toHaveBeenCalled();
  });

  it('commits the new role when the confirm is accepted', async () => {
    h.confirmDialog.mockResolvedValue(true);

    const select = await mountPage();

    await fireEvent.change(select, { target: { value: 'admin' } });

    await waitFor(() =>
      expect(h.changeRole).toHaveBeenCalledWith('org-1', TARGET_USER, 'admin')
    );
    expect(select.value).toBe('admin');
  });
});
