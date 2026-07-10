<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';

  let status = $derived(page.status);
  // Not-yet-open studies are thrown as 403 with a machine-readable marker (see
  // q/[code]/+page.ts). A plain 403 without it stays a genuine "forbidden".
  let notYetOpen = $derived(status === 403 && page.error?.code === 'not_yet_open');

  // The study's open date rides along on the error body when known; format it
  // loosely so participants get a human-readable "opens on" line.
  let openDate = $derived.by(() => {
    const raw = page.error?.openDate;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
  });

  let title = $derived.by(() => {
    if (status === 404) return m.fillout_error_unavailable_title();
    if (status === 410) return m.fillout_error_closed_title();
    if (notYetOpen) return m.fillout_error_not_open_title();
    return m.fillout_error_generic_title();
  });

  let description = $derived.by(() => {
    if (status === 404) {
      return m.fillout_error_unavailable_desc();
    }
    if (status === 410) {
      return m.fillout_error_closed_desc();
    }
    if (notYetOpen) {
      return openDate
        ? m.fillout_error_not_open_desc_dated({ date: openDate })
        : m.fillout_error_not_open_desc();
    }
    return m.fillout_error_generic_desc();
  });
</script>

<div class="flex min-h-screen items-center justify-center p-6">
  <div class="w-full max-w-sm text-center">
    <div class="mb-8">
      <svg class="mx-auto h-16 w-16 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        {#if notYetOpen}
          <circle cx="12" cy="12" r="10" />
          <path d="M12 7v5l3 2" />
        {:else if status === 404 || status === 410}
          <path d="M9 12h6M12 9v6" />
          <circle cx="12" cy="12" r="10" />
        {:else}
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="10" />
        {/if}
      </svg>
    </div>

    <h1 class="text-xl font-semibold tracking-tight text-foreground mb-3">
      {title}
    </h1>

    <p class="text-sm leading-6 text-muted-foreground mb-8">
      {description}
    </p>

    <p class="text-xs text-muted-foreground/60">
      {m.fillout_error_contact()}
    </p>
  </div>
</div>
