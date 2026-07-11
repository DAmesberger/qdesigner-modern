<script lang="ts">
	import { appPaths } from '$lib/routing/paths';
	import {
		buildReactionTrialRows,
		hasReactionTrialData,
	} from '$lib/analytics/reactionTrialExport';
	import { TRIAL_ROW_COLUMNS } from '$lib/modules/questions/reaction-time/model/trialRow';
	import type { ExportRow } from '$lib/shared/types/api';
	import type { PageData } from './$types';
	import {
		ArrowLeft,
		ChevronRight,
		ListChecks,
		Timer,
		Variable as VariableIcon,
		Activity,
		AlertTriangle,
	} from 'lucide-svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const shortId = $derived(data.session.id.slice(0, 8));

	function formatDate(date: string | null | undefined): string {
		if (!date) return '--';
		return new Date(date).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	}

	function formatDuration(startIso: string, endIso: string | null): string {
		if (!endIso) return '--';
		const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
		if (!Number.isFinite(ms) || ms < 0) return '--';
		const totalSeconds = Math.round(ms / 1000);
		const h = Math.floor(totalSeconds / 3600);
		const m = Math.floor((totalSeconds % 3600) / 60);
		const s = totalSeconds % 60;
		if (h > 0) return `${h}h ${m}m ${s}s`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
	}

	function getStatusBadge(status: string): string {
		const classes: Record<string, string> = {
			completed: 'bg-success/10 text-success',
			active: 'bg-info/10 text-info',
			abandoned: 'bg-destructive/10 text-destructive',
		};
		return classes[status] || 'bg-muted text-muted-foreground';
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined) return '--';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	// A binary answer (file-upload / media-response) whose blob has not yet been
	// delivered carries `status:'pending'` in its response value (ADR 0029 Half 2).
	// Surface it honestly rather than implying the answer is fully in hand.
	function isPendingBinary(v: unknown): boolean {
		if (v && typeof v === 'object' && 'status' in v && 'clientId' in v) {
			return (v as { status?: string }).status === 'pending';
		}
		return false;
	}

	function answerHasPendingBinary(rawValue: unknown): boolean {
		if (Array.isArray(rawValue)) return rawValue.some(isPendingBinary);
		return isPendingBinary(rawValue);
	}

	const pendingBinaryCount = $derived(
		data.answers.filter((a) => answerHasPendingBinary(a.rawValue)).length
	);

	const pinnedVersion = $derived(
		data.session.questionnaireVersionMajor != null
			? `${data.session.questionnaireVersionMajor}.${data.session.questionnaireVersionMinor ?? 0}.${data.session.questionnaireVersionPatch ?? 0}`
			: null
	);

	// Fraud / duplicate-participation flags, if the fillout stack stamped any onto
	// the session metadata (fraud-prevention 'flag' action, duplicate fingerprint).
	const flagged = $derived(
		Boolean(
			data.session.metadata?.duplicate ||
				data.session.metadata?.flagged ||
				data.session.metadata?.fraud ||
				data.session.metadata?.fraudFlag
		)
	);

	// Screen-out metadata (R2-2): stamped onto session.metadata.screenOut when an
	// eligibility rule fired. Distinct from a natural completion.
	const screenOut = $derived(
		(data.session.metadata?.screenOut as
			| { reason?: string; message?: string; ruleId?: string }
			| undefined) ?? null
	);

	// Reaction-time per-trial detail lives in the reaction responses' value blob.
	// Reuse the export flattener by shaping this session's responses as ExportRows.
	const reactionExportRows = $derived<ExportRow[]>(
		data.responses.map((r) => ({
			session_id: r.session_id,
			participant_id: data.session.participantId,
			session_status: data.session.status,
			started_at: data.session.startedAt,
			completed_at: data.session.completedAt,
			question_id: r.question_id,
			value: r.value,
			reaction_time_us: r.reaction_time_us,
			presented_at: r.presented_at,
			answered_at: r.answered_at,
		}))
	);
	const hasTrials = $derived(hasReactionTrialData(reactionExportRows));
	const reactionTrialRows = $derived(hasTrials ? buildReactionTrialRows(reactionExportRows) : []);

	// A compact subset of trial columns for the on-screen table.
	const TRIAL_COLUMNS = ['trial_number', 'condition', 'stimulus_kind', 'reaction_time_ms', 'is_correct'] as const;
	const TRIAL_KEYS = TRIAL_COLUMNS.map(
		(header) => TRIAL_ROW_COLUMNS.find((c) => c.header === header)!.key
	);
</script>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<div class="bg-card shadow">
		<div class="px-4 sm:px-6 lg:px-8">
			<div class="py-6">
				<!-- Breadcrumb -->
				<nav class="flex mb-4" aria-label="Breadcrumb">
					<ol class="flex items-center space-x-4 text-sm">
						<li>
							<a href={appPaths.projects()} class="text-muted-foreground hover:text-foreground"
								>Projects</a
							>
						</li>
						<li class="flex items-center">
							<ChevronRight size={18} class="flex-shrink-0 text-muted-foreground" />
							<a
								href={appPaths.project(data.project.id)}
								class="ml-4 text-muted-foreground hover:text-foreground">{data.project.name}</a
							>
						</li>
						<li class="flex items-center">
							<ChevronRight size={18} class="flex-shrink-0 text-muted-foreground" />
							<a
								href={appPaths.projectAnalytics(data.project.id)}
								class="ml-4 text-muted-foreground hover:text-foreground">Analytics</a
							>
						</li>
						<li class="flex items-center">
							<ChevronRight size={18} class="flex-shrink-0 text-muted-foreground" />
							<span class="ml-4 text-foreground font-medium font-mono">{shortId}</span>
						</li>
					</ol>
				</nav>

				<div class="flex items-start gap-3">
					<a
						href={appPaths.projectAnalytics(data.project.id)}
						class="mt-1 text-muted-foreground hover:text-foreground"
						aria-label="Back to analytics"
					>
						<ArrowLeft class="h-5 w-5" />
					</a>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-3 flex-wrap">
							<h1 class="text-2xl font-bold text-foreground font-mono">Session {shortId}</h1>
							<span
								class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {getStatusBadge(
									data.session.status
								)}"
							>
								{data.session.status}
							</span>
							{#if screenOut}
								<span
									class="px-2 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full bg-destructive/10 text-destructive"
								>
									<AlertTriangle class="h-3 w-3" /> Screened out
								</span>
							{/if}
							{#if flagged}
								<span
									class="px-2 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full bg-warning/10 text-warning"
								>
									<AlertTriangle class="h-3 w-3" /> Flagged
								</span>
							{/if}
						</div>
						<p class="mt-1 text-xs text-muted-foreground font-mono break-all">{data.session.id}</p>
					</div>
				</div>

				<!-- Meta grid -->
				<dl class="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
					<div>
						<dt class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</dt>
						<dd class="mt-1 text-sm text-foreground">{formatDate(data.session.startedAt)}</dd>
					</div>
					<div>
						<dt class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Completed
						</dt>
						<dd class="mt-1 text-sm text-foreground">{formatDate(data.session.completedAt)}</dd>
					</div>
					<div>
						<dt class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Duration
						</dt>
						<dd class="mt-1 text-sm text-foreground">
							{formatDuration(
								data.session.startedAt,
								data.session.completedAt ?? data.session.lastActivityAt ?? null
							)}
						</dd>
					</div>
					<div>
						<dt class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Participant
						</dt>
						<dd class="mt-1 text-sm text-foreground break-all">
							{data.session.participantId || 'Anonymous'}
						</dd>
					</div>
					<div>
						<dt class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Pinned version
						</dt>
						<dd class="mt-1 text-sm text-foreground font-mono">{pinnedVersion ?? '--'}</dd>
					</div>
					{#if data.arm}
						<div>
							<dt class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Assigned arm
							</dt>
							<dd class="mt-1 text-sm text-foreground">
								{data.arm.condition}{#if data.arm.conditionIndex != null}
									<span class="text-muted-foreground"> (#{data.arm.conditionIndex})</span>{/if}
							</dd>
						</div>
					{/if}
				</dl>

				{#if screenOut && (screenOut.reason || screenOut.message)}
					<div class="mt-4 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm">
						<span class="font-medium text-destructive">Screen-out:</span>
						<span class="text-foreground">
							{screenOut.message || screenOut.reason}
							{#if screenOut.message && screenOut.reason}
								<span class="text-muted-foreground">({screenOut.reason})</span>
							{/if}
						</span>
					</div>
				{/if}

				{#if !data.matchedPinnedVersion}
					<div
						class="mt-4 rounded-md bg-warning/10 border border-warning/30 p-3 text-sm text-foreground"
						role="note"
					>
						<AlertTriangle class="inline h-4 w-4 text-warning" />
						Prompts resolved against {data.resolvedVersion
							? `version ${data.resolvedVersion}`
							: 'the latest definition'}, not the exact pinned snapshot{pinnedVersion
							? ` (${pinnedVersion})`
							: ''}. Question wording may differ from what the participant saw.
					</div>
				{/if}
			</div>
		</div>
	</div>

	<main class="px-4 sm:px-6 lg:px-8 py-8 space-y-8">
		<!-- Answers -->
		<section class="bg-card shadow rounded-lg overflow-hidden">
			<div class="px-6 py-4 border-b border-border flex items-center gap-2">
				<ListChecks class="h-5 w-5 text-muted-foreground" />
				<h2 class="text-lg font-medium text-foreground">Answers</h2>
				{#if pendingBinaryCount > 0}
					<span
						class="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
						title="Binary answers captured on the participant's device but not yet uploaded"
					>
						{pendingBinaryCount} binary answer{pendingBinaryCount === 1 ? '' : 's'} not yet received
					</span>
				{/if}
				<span class="ml-auto text-sm text-muted-foreground">{data.answers.length} responses</span>
			</div>

			{#if data.answers.length === 0}
				<div class="text-center py-12">
					<ListChecks class="mx-auto h-10 w-10 text-muted-foreground" />
					<p class="mt-2 text-sm text-muted-foreground">No answers recorded for this session.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border">
						<thead class="bg-muted">
							<tr>
								<th
									scope="col"
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>Question</th
								>
								<th
									scope="col"
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>Answer</th
								>
								<th
									scope="col"
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>RT (ms)</th
								>
								<th
									scope="col"
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>Answered</th
								>
							</tr>
						</thead>
						<tbody class="bg-card divide-y divide-border">
							{#each data.answers as answer (answer.questionId)}
								<tr class="hover:bg-accent align-top">
									<td class="px-6 py-4 text-sm text-foreground max-w-md">
										<div class="whitespace-pre-wrap">{answer.prompt}</div>
										<div class="mt-0.5 text-xs text-muted-foreground font-mono">
											{answer.questionId}{#if answer.type}
												· {answer.type}{/if}{#if !answer.resolved}
												· <span class="text-warning">unresolved</span>{/if}
										</div>
									</td>
									<td class="px-6 py-4 text-sm text-foreground max-w-sm">
										<div class="whitespace-pre-wrap break-words">{answer.displayValue}</div>
										{#if answerHasPendingBinary(answer.rawValue)}
											<div class="mt-1 inline-flex items-center gap-1 text-xs text-warning">
												binary answer not yet received
											</div>
										{/if}
										{#if answer.clientId}
											<div class="mt-0.5 text-xs text-muted-foreground font-mono" title="Sync client_id">
												{answer.clientId.slice(0, 8)}
											</div>
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-mono">
										{answer.reactionTimeUs != null
											? Math.round(answer.reactionTimeUs / 1000)
											: '--'}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
										{formatDate(answer.answeredAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- Reaction-time data -->
		{#if hasTrials}
			<section class="bg-card shadow rounded-lg overflow-hidden">
				<div class="px-6 py-4 border-b border-border flex items-center gap-2">
					<Timer class="h-5 w-5 text-muted-foreground" />
					<h2 class="text-lg font-medium text-foreground">Reaction-time trials</h2>
					<span class="ml-auto text-sm text-muted-foreground">{reactionTrialRows.length} trials</span>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border text-xs">
						<thead class="bg-muted">
							<tr>
								{#each TRIAL_COLUMNS as header (header)}
									<th
										scope="col"
										class="px-4 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap"
										>{header}</th
									>
								{/each}
							</tr>
						</thead>
						<tbody class="bg-card divide-y divide-border">
							{#each reactionTrialRows.slice(0, 200) as trial, i (i)}
								<tr class={trial.excludeFromAnalysis ? 'bg-destructive/5' : 'hover:bg-accent'}>
									{#each TRIAL_KEYS as key (key)}
										<td class="px-4 py-2 whitespace-nowrap font-mono text-foreground">
											{trial[key] === null || trial[key] === undefined ? '--' : String(trial[key])}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if reactionTrialRows.length > 200}
					<div class="px-6 py-3 border-t border-border text-xs text-muted-foreground">
						Showing first 200 of {reactionTrialRows.length} trials. Use the analytics per-trial export
						for the full set.
					</div>
				{/if}
				<details class="border-t border-border">
					<summary class="px-6 py-3 text-sm text-muted-foreground cursor-pointer hover:text-foreground"
						>Timing provenance (raw)</summary
					>
					<pre
						class="px-6 pb-4 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">{JSON.stringify(
							reactionExportRows.filter((r) => hasReactionTrialData([r])).map((r) => r.value),
							null,
							2
						)}</pre>
				</details>
			</section>
		{/if}

		<!-- Variables -->
		<section class="bg-card shadow rounded-lg overflow-hidden">
			<div class="px-6 py-4 border-b border-border flex items-center gap-2">
				<VariableIcon class="h-5 w-5 text-muted-foreground" />
				<h2 class="text-lg font-medium text-foreground">Variables</h2>
				<span class="ml-auto text-sm text-muted-foreground">{data.variables.length}</span>
			</div>
			{#if data.variables.length === 0}
				<div class="text-center py-10">
					<p class="text-sm text-muted-foreground">No session variables recorded.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border">
						<thead class="bg-muted">
							<tr>
								<th
									scope="col"
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>Name</th
								>
								<th
									scope="col"
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>Value</th
								>
							</tr>
						</thead>
						<tbody class="bg-card divide-y divide-border">
							{#each data.variables as variable (variable.variable_name)}
								<tr class="hover:bg-accent">
									<td class="px-6 py-3 whitespace-nowrap text-sm text-foreground font-mono"
										>{variable.variable_name}</td
									>
									<td class="px-6 py-3 text-sm text-muted-foreground break-words"
										>{formatValue(variable.variable_value)}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- Events timeline -->
		<section class="bg-card shadow rounded-lg overflow-hidden">
			<div class="px-6 py-4 border-b border-border flex items-center gap-2">
				<Activity class="h-5 w-5 text-muted-foreground" />
				<h2 class="text-lg font-medium text-foreground">Events</h2>
				<span class="ml-auto text-sm text-muted-foreground">{data.events.length}</span>
			</div>
			{#if data.events.length === 0}
				<div class="text-center py-10">
					<p class="text-sm text-muted-foreground">No interaction events recorded.</p>
				</div>
			{:else}
				<ul class="divide-y divide-border">
					{#each data.events as event (event.id)}
						<li class="px-6 py-3 flex items-start gap-4">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="text-sm font-medium text-foreground">{event.event_type}</span>
									{#if event.question_id}
										<span class="text-xs text-muted-foreground font-mono">{event.question_id}</span>
									{/if}
								</div>
								<div class="text-xs text-muted-foreground">{formatDate(event.created_at)}</div>
								{#if event.metadata && Object.keys(event.metadata).length > 0}
									<details class="mt-1">
										<summary
											class="text-xs text-muted-foreground cursor-pointer hover:text-foreground"
											>payload</summary
										>
										<pre
											class="mt-1 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">{JSON.stringify(
												event.metadata,
												null,
												2
											)}</pre>
									</details>
								{/if}
							</div>
							<span class="text-xs text-muted-foreground font-mono whitespace-nowrap"
								>{event.timestamp_us}</span
							>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</main>
</div>
