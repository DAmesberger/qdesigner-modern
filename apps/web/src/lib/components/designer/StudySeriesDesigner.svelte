<script lang="ts">
  import { api } from '$lib/services/api';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import { Plus, Trash2, Copy, Users, Send } from 'lucide-svelte';
  import {
    validateSeriesDraft,
    validateEmail,
    hasErrors,
    issueFor,
  } from '$lib/components/designer/validation/scientificRules';
  import type {
    SeriesRecord,
    EnrollmentRecord,
    EnrollResponse,
  } from '$lib/api/generated/types.gen';

  /**
   * Longitudinal / EMA study-series designer (E-FLOW-2). A researcher surface
   * (sibling of the experimental-design settings) to define waves + cadence +
   * reminder copy, enroll participants, and view their schedule. Wraps the
   * `api.series` client. Mount with the questionnaire id, like VersionManager.
   */
  let { questionnaireId } = $props<{ questionnaireId: string }>();

  type ScheduleKind = 'fixed' | 'random-interval' | 'event';

  interface WaveDraft {
    label: string;
    offsetDays: number; // fixed: absolute offset; event: gap after prior completion
    minHours: number; // random-interval lower bound
    maxHours: number; // random-interval upper bound
  }

  const kindOptions = [
    { value: 'fixed', label: 'Fixed offsets (e.g. daily diary)' },
    { value: 'random-interval', label: 'Random interval (signal-contingent)' },
    { value: 'event', label: 'Event-triggered (next after completion)' },
  ];

  let series = $state<SeriesRecord[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // ── New-series form state ──
  let name = $state('');
  let scheduleKind = $state<ScheduleKind>('fixed');
  let timezone = $state('UTC');
  let reminderSubject = $state('Your next questionnaire is ready');
  let reminderBody = $state(
    'It is time for your next questionnaire. Open it here:\n\n{{link}}\n\nTo stop receiving these: {{unsubscribe}}'
  );
  let waves = $state<WaveDraft[]>([
    { label: 'Baseline', offsetDays: 0, minHours: 20, maxHours: 28 },
    { label: 'Day 1', offsetDays: 1, minHours: 20, maxHours: 28 },
    { label: 'Day 2', offsetDays: 2, minHours: 20, maxHours: 28 },
  ]);
  let creating = $state(false);

  // Inline validity checks for the new-series draft (R4-4): wave intervals must
  // be positive and ordered, fixed offsets must increase, the reminder body
  // should carry a {{link}} placeholder. Errors block "Create series".
  const draftIssues = $derived(
    validateSeriesDraft({ name, scheduleKind, waves, reminderBody })
  );
  const draftHasErrors = $derived(hasErrors(draftIssues));

  // ── Per-series enrollment state ──
  let enrollments = $state<Record<string, EnrollmentRecord[]>>({});
  let enrollEmail = $state<Record<string, string>>({});
  let enrollRef = $state<Record<string, string>>({});
  let lastResumeLink = $state<Record<string, string>>({});

  async function loadSeries() {
    if (!questionnaireId) return;
    loading = true;
    error = null;
    try {
      series = await api.series.list(questionnaireId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load study series';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (questionnaireId) void loadSeries();
  });

  function buildWaveDefs(): Array<Record<string, unknown>> {
    return waves.map((w) => {
      if (scheduleKind === 'random-interval') {
        return {
          label: w.label,
          minIntervalSeconds: Math.round(w.minHours * 3600),
          maxIntervalSeconds: Math.round(w.maxHours * 3600),
        };
      }
      // fixed: absolute offset from enrollment; event: gap after prior wave.
      return { label: w.label, offsetSeconds: Math.round(w.offsetDays * 86400) };
    });
  }

  function addWave() {
    const n = waves.length;
    waves = [
      ...waves,
      { label: `Wave ${n}`, offsetDays: n, minHours: 20, maxHours: 28 },
    ];
  }

  function removeWave(i: number) {
    waves = waves.filter((_, idx) => idx !== i);
  }

  async function createSeries() {
    if (!name.trim() || waves.length === 0 || draftHasErrors) return;
    creating = true;
    error = null;
    try {
      await api.series.create({
        questionnaire_id: questionnaireId,
        name: name.trim(),
        schedule_kind: scheduleKind,
        wave_defs: buildWaveDefs(),
        timezone,
        reminder_subject: reminderSubject,
        reminder_body: reminderBody,
      });
      name = '';
      await loadSeries();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create series';
    } finally {
      creating = false;
    }
  }

  async function loadEnrollments(seriesId: string) {
    try {
      enrollments = { ...enrollments, [seriesId]: await api.series.listEnrollments(seriesId) };
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load enrollments';
    }
  }

  async function enrollParticipant(seriesId: string) {
    const email = (enrollEmail[seriesId] || '').trim();
    if (!email || hasErrors(validateEmail('email', email))) return;
    try {
      const res: EnrollResponse = await api.series.enroll(seriesId, {
        contact_channel: email,
        participant_ref: (enrollRef[seriesId] || '').trim() || undefined,
      });
      lastResumeLink = { ...lastResumeLink, [seriesId]: res.resume_link };
      enrollEmail = { ...enrollEmail, [seriesId]: '' };
      enrollRef = { ...enrollRef, [seriesId]: '' };
      await loadEnrollments(seriesId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to enroll participant';
    }
  }

  function copyLink(link: string) {
    void navigator.clipboard?.writeText(link).catch(() => {});
  }

  function fmt(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }
</script>

{#snippet draftMsg(field: string)}
  {@const issue = issueFor(draftIssues, field)}
  {#if issue}
    <small class="field-msg {issue.severity}" role={issue.severity === 'error' ? 'alert' : undefined}>
      {issue.message}
    </small>
  {/if}
{/snippet}

<section class="series-designer" data-testid="study-series-designer">
  <header>
    <h3><Users size={16} /> Longitudinal / EMA study series</h3>
    <p class="hint">
      Schedule repeated-measures waves, enroll participants, and send resume-link reminders.
    </p>
  </header>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <!-- New series -->
  <div class="panel">
    <h4>New series</h4>
    <label class="field">
      <span>Name</span>
      <input bind:value={name} placeholder="e.g. 7-day mood diary" />
      {@render draftMsg('name')}
    </label>

    <label class="field">
      <span>Cadence</span>
      <Select
        value={scheduleKind}
        options={kindOptions}
        onchange={(e) => (scheduleKind = e.currentTarget.value as ScheduleKind)}
      />
    </label>

    <div class="waves">
      <div class="waves-head">
        <span>Waves</span>
        <Button size="sm" variant="ghost" onclick={addWave}><Plus size={14} /> Add wave</Button>
      </div>
      {#each waves as wave, i (i)}
        <div class="wave-row">
          <input class="wave-label" bind:value={wave.label} placeholder="Label" />
          {#if scheduleKind === 'random-interval'}
            <label class="inline">
              <span>min h</span>
              <input type="number" min="0" bind:value={wave.minHours} />
            </label>
            <label class="inline">
              <span>max h</span>
              <input type="number" min="0" bind:value={wave.maxHours} />
            </label>
          {:else}
            <label class="inline">
              <span>{scheduleKind === 'event' ? 'gap (days)' : 'offset (days)'}</span>
              <input type="number" min="0" step="0.5" bind:value={wave.offsetDays} />
            </label>
          {/if}
          <button
            class="icon-btn"
            title="Remove wave"
            onclick={() => removeWave(i)}
            aria-label="Remove wave"
          >
            <Trash2 size={14} />
          </button>
        </div>
        {@render draftMsg(`waves.${i}.label`)}
        {@render draftMsg(`waves.${i}.offsetDays`)}
        {@render draftMsg(`waves.${i}.minHours`)}
        {@render draftMsg(`waves.${i}.maxHours`)}
      {/each}
      {@render draftMsg('waves')}
    </div>

    <label class="field">
      <span>Reminder subject</span>
      <input bind:value={reminderSubject} />
    </label>
    <label class="field">
      <span>Reminder body</span>
      <textarea bind:value={reminderBody} rows="4"></textarea>
      <small class="hint">Use <code>{'{{link}}'}</code> and <code>{'{{unsubscribe}}'}</code>.</small>
      {@render draftMsg('reminderBody')}
    </label>
    <label class="field short">
      <span>Timezone</span>
      <input bind:value={timezone} />
    </label>

    <Button
      onclick={createSeries}
      disabled={creating || !name.trim() || waves.length === 0 || draftHasErrors}
    >
      {creating ? 'Creating…' : 'Create series'}
    </Button>
  </div>

  <!-- Existing series -->
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if series.length === 0}
    <p class="hint">No series yet for this questionnaire.</p>
  {/if}

  {#each series as s (s.id)}
    {@const emailIssue = issueFor(validateEmail('email', enrollEmail[s.id] ?? ''), 'email')}
    <div class="panel">
      <div class="series-head">
        <div>
          <strong>{s.name}</strong>
          <span class="badge">{s.schedule_kind}</span>
          <span class="badge">{Array.isArray(s.wave_defs) ? s.wave_defs.length : 0} waves</span>
        </div>
        <Button size="sm" variant="ghost" onclick={() => loadEnrollments(s.id)}>
          View enrollments
        </Button>
      </div>

      <div class="enroll-row">
        <input
          placeholder="participant email"
          value={enrollEmail[s.id] ?? ''}
          class:invalid={emailIssue?.severity === 'error'}
          aria-invalid={emailIssue?.severity === 'error' ? 'true' : undefined}
          oninput={(e) => (enrollEmail = { ...enrollEmail, [s.id]: e.currentTarget.value })}
        />
        <input
          class="ref"
          placeholder="participant ref (optional)"
          value={enrollRef[s.id] ?? ''}
          oninput={(e) => (enrollRef = { ...enrollRef, [s.id]: e.currentTarget.value })}
        />
        <Button
          size="sm"
          onclick={() => enrollParticipant(s.id)}
          disabled={!(enrollEmail[s.id] ?? '').trim() || emailIssue?.severity === 'error'}
        >
          <Send size={14} /> Enroll
        </Button>
      </div>
      {#if emailIssue}
        <small class="field-msg {emailIssue.severity}" role="alert">{emailIssue.message}</small>
      {/if}

      {#if lastResumeLink[s.id]}
        {@const link = lastResumeLink[s.id] ?? ''}
        <div class="resume-link">
          <code>{link}</code>
          <button class="icon-btn" title="Copy link" aria-label="Copy resume link" onclick={() => copyLink(link)}>
            <Copy size={14} />
          </button>
        </div>
      {/if}

      {#if enrollments[s.id]}
        {@const list = enrollments[s.id] ?? []}
        {#if list.length === 0}
          <p class="hint">No participants enrolled yet.</p>
        {:else}
          <table class="enroll-table">
            <thead>
              <tr><th>Participant</th><th>Status</th><th>Wave</th><th>Next prompt</th></tr>
            </thead>
            <tbody>
              {#each list as e (e.id)}
                <tr>
                  <td>{e.participant_ref || e.contact_channel}</td>
                  <td><span class="badge status-{e.status}">{e.status}</span></td>
                  <td>{e.current_wave_index}</td>
                  <td>{fmt(e.next_prompt_at)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      {/if}
    </div>
  {/each}
</section>

<style>
  .series-designer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
  header h3 {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: 1rem;
  }
  .hint {
    color: hsl(var(--muted-foreground));
    font-size: 0.8rem;
    margin: 0.25rem 0 0;
  }
  .error {
    color: hsl(var(--destructive));
    font-size: 0.85rem;
  }
  .field-msg {
    font-size: 0.72rem;
    line-height: 1rem;
  }
  .field-msg.error {
    color: hsl(var(--destructive));
  }
  .field-msg.warning {
    color: hsl(var(--warning));
  }
  .enroll-row input.invalid {
    border-color: hsl(var(--destructive));
  }
  .panel {
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: hsl(var(--card));
  }
  .panel h4 {
    margin: 0;
    font-size: 0.9rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
  }
  .field.short {
    max-width: 12rem;
  }
  .field input,
  .field textarea,
  .enroll-row input,
  .wave-row input {
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    padding: 0.4rem 0.5rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font: inherit;
  }
  .waves {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .waves-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .wave-row {
    display: flex;
    align-items: end;
    gap: 0.5rem;
  }
  .wave-label {
    flex: 1;
  }
  .inline {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
  }
  .inline input {
    width: 5rem;
  }
  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    padding: 0.35rem;
    border-radius: 0.375rem;
  }
  .icon-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }
  .series-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .badge {
    display: inline-block;
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 0.75rem;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    margin-left: 0.35rem;
  }
  .status-active {
    background: hsl(142 70% 45% / 0.15);
    color: hsl(142 70% 30%);
  }
  .status-withdrawn {
    background: hsl(0 70% 50% / 0.15);
    color: hsl(0 70% 40%);
  }
  .enroll-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .enroll-row input {
    flex: 1;
  }
  .enroll-row input.ref {
    max-width: 12rem;
  }
  .resume-link {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    background: hsl(var(--muted));
    padding: 0.4rem 0.5rem;
    border-radius: 0.375rem;
    overflow-x: auto;
  }
  .resume-link code {
    white-space: nowrap;
  }
  .enroll-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .enroll-table th,
  .enroll-table td {
    text-align: left;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid hsl(var(--border));
  }
</style>
