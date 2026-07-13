import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { PageData } from './$types';

/**
 * Regression guard: the dashboard's "Your active work" cards and "Live study
 * movement" rows must render EAGERLY.
 *
 * They used to be gated behind `use:lazyRender` + `{#if visible.has(id)}` with an
 * empty `{:else}` placeholder. On a short viewport the first card sat just past
 * the observer's 600px `rootMargin` (measured live: reveal zone ended at y=1233,
 * card top was y=1235), so `IntersectionObserver` never reported an
 * intersection, the reveal Set stayed empty, and the user saw blank pulse boxes
 * until they scrolled.
 *
 * The seam that catches this: an `IntersectionObserver` that records `observe()`
 * but NEVER invokes its callback — i.e. "this element is not in view, and no
 * scroll is coming". Under that observer, lazy-gated content stays unmounted
 * forever, so asserting the questionnaire name is in the DOM fails. Eager
 * content renders regardless of the observer, so it passes.
 *
 * NB: the shared test setup (tests/setup/test-setup.ts) already installs exactly
 * such a never-firing observer globally, which is why this bug is reproducible
 * in jsdom at all. We install it locally anyway so this test states its own
 * precondition and cannot be silently defused by a change to the setup file.
 */
class NeverFiringIntersectionObserver {
  static observed: Element[] = [];
  constructor(_callback: IntersectionObserverCallback) {
    // Deliberately drop the callback: the element never intersects.
  }
  observe(target: Element) {
    NeverFiringIntersectionObserver.observed.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal('IntersectionObserver', NeverFiringIntersectionObserver);

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$lib/services/ws', () => ({
  ws: { subscribe: vi.fn(() => () => {}) },
}));

vi.mock('$lib/services/api', () => ({
  api: { sessions: { timeseries: vi.fn(async () => []) } },
}));

// Keep the first-run welcome tour from auto-starting over the assertions.
vi.mock('$lib/help/stores/helpStore.svelte', () => ({
  helpStore: {
    hasSeenFeature: () => true,
    hasTourCompleted: () => true,
    markFeatureSeen: vi.fn(),
  },
}));

vi.mock('$lib/help/tours/TourEngine.svelte', () => ({
  tourEngine: {
    isActive: false,
    currentStep: null,
    currentStepIndex: 0,
    totalSteps: 0,
    targetElement: null,
    highlightRect: null,
    start: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    end: vi.fn(),
  },
}));

import DashboardPage from './+page.svelte';

const data: PageData = {
  session: null,
  organizationId: 'org-1',
  user: { fullName: 'Ada Lovelace', email: 'ada@example.com' },
  questionnaires: [
    {
      questionnaire_id: 'q-1',
      project_id: 'p-1',
      name: 'Stroop Reaction Study',
      status: 'published',
      total_responses: 12,
      completed_responses: 9,
      response_rate_7d: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  recentActivity: [
    {
      id: 's-1',
      questionnaire_id: 'q-1',
      questionnaire_name: 'Stroop Reaction Study',
      participant_email: 'participant-7',
      status: 'completed',
      started_at: new Date().toISOString(),
    },
  ],
  stats: {
    totalQuestionnaires: 1,
    totalResponses: 12,
    activeQuestionnaires: 1,
    avgCompletionRate: 75,
  },
};

describe('dashboard page — eager rendering of the small lists', () => {
  afterEach(() => {
    cleanup();
    NeverFiringIntersectionObserver.observed = [];
  });

  it('renders questionnaire cards even when no IntersectionObserver callback ever fires', async () => {
    render(DashboardPage, { props: { data } });
    await tick();

    // The card body itself — not just its container — must be mounted: the
    // <h3> title and the card-only "Open designer" affordance both live inside
    // the gated region that used to stay unmounted.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Stroop Reaction Study' })
    ).toBeInTheDocument();
    expect(screen.getByText('Open designer')).toBeInTheDocument();
  });

  it('renders recent-activity rows even when no IntersectionObserver callback ever fires', async () => {
    render(DashboardPage, { props: { data } });
    await tick();

    expect(screen.getByText('participant-7')).toBeInTheDocument();
  });

  it('does not hand the dashboard lists to an IntersectionObserver at all', async () => {
    render(DashboardPage, { props: { data } });
    await tick();

    // Eager-by-construction: nothing on this page defers mounting on visibility,
    // so no reveal can be missed by a rootMargin that falls short of the row.
    expect(NeverFiringIntersectionObserver.observed).toHaveLength(0);
  });
});
