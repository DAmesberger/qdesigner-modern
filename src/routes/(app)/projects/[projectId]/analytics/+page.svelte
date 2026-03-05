<script lang="ts">
	import { appPaths } from '$lib/routing/paths';
	import { api } from '$lib/services/api';
	import StatisticsCard from '$lib/analytics/components/StatisticsCard.svelte';
	import {
		exportToExcel,
		exportWithScript,
		type ResponseExportFormat,
		type ScriptFormat,
	} from '$lib/analytics/ResponseExportService';
	import type { QuestionnaireDefinition, SessionData, ExportRow } from '$lib/types/api';
	import type { PageData } from './$types';
	import {
		ArrowLeft,
		BarChart3,
		ChevronDown,
		Download,
		FileJson,
		FileSpreadsheet,
		MessageSquare,
		PieChart,
		Timer,
	} from 'lucide-svelte';
	import { StatisticalEngine } from '$lib/analytics/StatisticalEngine';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let selectedQuestionnaireId = $state<string>('');
	let sessions = $state<SessionData[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let exportLoading = $state<string | null>(null);
	let exportMenuOpen = $state(false);

	let selectedQuestionnaire = $derived(
		data.questionnaires.find((q: QuestionnaireDefinition) => q.id === selectedQuestionnaireId) ||
			null
	);

	let completedSessions = $derived(sessions.filter((s) => s.status === 'completed'));
	let activeSessions = $derived(sessions.filter((s) => s.status === 'active'));
	let abandonedSessions = $derived(sessions.filter((s) => s.status === 'abandoned'));

	let completionRate = $derived(
		sessions.length > 0
			? Math.round((completedSessions.length / sessions.length) * 100)
			: 0
	);

	let analyticsTab = $state<'overview' | 'per-question'>('overview');
	let exportData = $state<ExportRow[]>([]);

	// Per-question analytics derived data
	let questionAnalytics = $derived.by(() => {
		if (exportData.length === 0) return [];

		const byQuestion = new Map<string, { values: unknown[]; reactionTimes: number[]; responseCount: number }>();
		for (const row of exportData) {
			if (!byQuestion.has(row.question_id)) {
				byQuestion.set(row.question_id, { values: [], reactionTimes: [], responseCount: 0 });
			}
			const entry = byQuestion.get(row.question_id)!;
			entry.values.push(row.value);
			entry.responseCount++;
			if (row.reaction_time_us != null) {
				entry.reactionTimes.push(row.reaction_time_us / 1000); // Convert to ms
			}
		}

		const engine = StatisticalEngine.getInstance();
		const results: Array<{
			questionId: string;
			responseCount: number;
			distribution: Map<string, number>;
			rtStats: { mean: number; median: number; sd: number } | null;
		}> = [];

		for (const [questionId, entry] of byQuestion) {
			// Build value distribution
			const distribution = new Map<string, number>();
			for (const val of entry.values) {
				const key = val == null ? '(no answer)' : String(val);
				distribution.set(key, (distribution.get(key) || 0) + 1);
			}

			// RT stats
			let rtStats: { mean: number; median: number; sd: number } | null = null;
			if (entry.reactionTimes.length >= 2) {
				try {
					const stats = engine.calculateDescriptiveStats(entry.reactionTimes);
					rtStats = { mean: stats.mean, median: stats.median, sd: stats.standardDeviation };
				} catch {
					// Not enough valid data
				}
			}

			results.push({ questionId, responseCount: entry.responseCount, distribution, rtStats });
		}

		return results;
	});

	// Auto-select first questionnaire on load
	$effect(() => {
		if (data.questionnaires.length > 0 && !selectedQuestionnaireId) {
			selectedQuestionnaireId = data.questionnaires[0]!.id;
		}
	});

	// Load sessions when questionnaire changes
	$effect(() => {
		if (selectedQuestionnaireId) {
			loadSessions(selectedQuestionnaireId);
		}
	});

	// Load export data for per-question analytics when tab switches
	$effect(() => {
		if (analyticsTab === 'per-question' && selectedQuestionnaireId && sessions.length > 0) {
			loadExportData();
		}
	});

	async function loadExportData() {
		try {
			exportData = await fetchExportData();
		} catch {
			exportData = [];
		}
	}

	async function loadSessions(questionnaireId: string) {
		loading = true;
		error = null;

		try {
			sessions = await api.sessions.list({ questionnaireId });
		} catch (err) {
			console.error('Error loading sessions:', err);
			error = err instanceof Error ? err.message : 'Failed to load session data';
			sessions = [];
		} finally {
			loading = false;
		}
	}

	async function fetchExportData(): Promise<ExportRow[]> {
		return api.questionnaires.export(data.project.id, selectedQuestionnaireId, 'json');
	}

	async function handleExport(format: 'json' | 'csv') {
		if (!selectedQuestionnaireId) return;

		exportLoading = format;
		exportMenuOpen = false;

		try {
			const exportData = await fetchExportData();

			const content =
				format === 'json'
					? JSON.stringify(exportData, null, 2)
					: convertToCSV(exportData);

			const mimeType = format === 'json' ? 'application/json' : 'text/csv';
			const blob = new Blob([content], { type: mimeType });
			const url = URL.createObjectURL(blob);

			const link = document.createElement('a');
			link.href = url;
			const questionnaireName = selectedQuestionnaire?.name || 'export';
			link.download = `${questionnaireName.replace(/\s+/g, '_')}_${format}_${new Date().toISOString().slice(0, 10)}.${format}`;
			link.click();

			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Export failed:', err);
			error = err instanceof Error ? err.message : 'Export failed';
		} finally {
			exportLoading = null;
		}
	}

	async function handleAdvancedExport(format: ResponseExportFormat) {
		if (!selectedQuestionnaireId) return;

		exportLoading = format;
		exportMenuOpen = false;

		try {
			const exportData = await fetchExportData();
			const name = selectedQuestionnaire?.name || 'export';

			if (format === 'xlsx') {
				await exportToExcel(exportData, name);
			} else {
				await exportWithScript(exportData, name, format as ScriptFormat);
			}
		} catch (err) {
			console.error('Export failed:', err);
			error = err instanceof Error ? err.message : 'Export failed';
		} finally {
			exportLoading = null;
		}
	}

	function convertToCSV(rows: ExportRow[]): string {
		if (rows.length === 0) return '';

		const headers = [
			'session_id',
			'participant_id',
			'session_status',
			'started_at',
			'completed_at',
			'question_id',
			'value',
			'reaction_time_us',
			'presented_at',
			'answered_at',
		];

		const csvRows = [headers.join(',')];

		for (const row of rows) {
			const values = headers.map((header) => {
				const val = row[header as keyof ExportRow];
				if (val === null || val === undefined) return '';
				const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
				return str.includes(',') || str.includes('"') || str.includes('\n')
					? `"${str.replace(/"/g, '""')}"`
					: str;
			});
			csvRows.push(values.join(','));
		}

		return csvRows.join('\n');
	}

	function formatDate(date: string | null): string {
		if (!date) return '--';
		return new Date(date).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function getStatusBadge(status: string): string {
		const classes: Record<string, string> = {
			completed: 'bg-success/10 text-success',
			active: 'bg-info/10 text-info',
			abandoned: 'bg-destructive/10 text-destructive',
		};
		return classes[status] || 'bg-muted text-muted-foreground';
	}

	function getDistributionEntries(distribution: Map<string, number>) {
		const entries = [...distribution.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
		const maxCount = entries.length > 0 ? Math.max(...entries.map(e => e[1])) : 0;
		return entries.map(([label, count]) => ({
			label,
			count,
			pct: maxCount > 0 ? (count / maxCount) * 100 : 0,
		}));
	}

	const EXPORT_FORMATS = [
		{ id: 'csv' as const, label: 'CSV', description: 'Comma-separated values', group: 'data' },
		{ id: 'json' as const, label: 'JSON', description: 'JavaScript Object Notation', group: 'data' },
		{ id: 'xlsx' as const, label: 'Excel (.xlsx)', description: 'Multi-sheet workbook', group: 'data' },
		{ id: 'spss' as const, label: 'SPSS', description: 'CSV + .sps syntax file', group: 'stats' },
		{ id: 'r' as const, label: 'R', description: 'CSV + .R analysis script', group: 'stats' },
		{ id: 'stata' as const, label: 'Stata', description: 'CSV + .do file', group: 'stats' },
		{ id: 'sas' as const, label: 'SAS', description: 'CSV + .sas program', group: 'stats' },
		{ id: 'python' as const, label: 'Python', description: 'CSV + pandas script', group: 'stats' },
	] as const;
</script>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<div class="bg-card shadow">
		<div class="px-4 sm:px-6 lg:px-8">
			<div class="py-6">
				<!-- Breadcrumb -->
				<nav class="flex mb-4" aria-label="Breadcrumb">
					<ol class="flex items-center space-x-4">
						<li>
							<a
								href={appPaths.projects()}
								class="text-muted-foreground hover:text-foreground"
								>Projects</a
							>
						</li>
						<li class="flex items-center">
							<svg
								class="flex-shrink-0 h-5 w-5 text-muted-foreground"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
							<a
								href={appPaths.project(data.project.id)}
								class="ml-4 text-muted-foreground hover:text-foreground"
								>{data.project.name}</a
							>
						</li>
						<li class="flex items-center">
							<svg
								class="flex-shrink-0 h-5 w-5 text-muted-foreground"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
							<span class="ml-4 text-foreground font-medium"
								>Analytics</span
							>
						</li>
					</ol>
				</nav>

				<!-- Title row -->
				<div class="md:flex md:items-center md:justify-between">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-3">
							<a
								href={appPaths.project(data.project.id)}
								class="text-muted-foreground hover:text-foreground"
								aria-label="Back to project"
							>
								<ArrowLeft class="h-5 w-5" />
							</a>
							<div>
								<h1
									class="text-2xl font-bold leading-7 text-foreground sm:text-3xl sm:truncate"
								>
									Analytics
								</h1>
								<p class="mt-1 text-sm text-muted-foreground">
									{data.project.name} &mdash; Response data and statistics
								</p>
							</div>
						</div>
					</div>

					<!-- Questionnaire selector + Export -->
					<div class="mt-4 flex items-center gap-3 md:mt-0 md:ml-4">
						{#if data.questionnaires.length > 0}
							<select
								bind:value={selectedQuestionnaireId}
								class="block rounded-md border border-border bg-card py-2 pl-3 pr-10 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
							>
								{#each data.questionnaires as q (q.id)}
									<option value={q.id}>{q.name}</option>
								{/each}
							</select>

							<!-- Export dropdown -->
							<div class="relative">
								<button
									onclick={() => { exportMenuOpen = !exportMenuOpen; }}
									disabled={exportLoading !== null || sessions.length === 0}
									class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{#if exportLoading}
										<div class="animate-spin h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full"></div>
										Exporting...
									{:else}
										<Download class="h-4 w-4" />
										Export
										<ChevronDown class="h-3 w-3" />
									{/if}
								</button>

								{#if exportMenuOpen}
									<!-- Backdrop to close menu -->
									<button
										class="fixed inset-0 z-40"
										onclick={() => { exportMenuOpen = false; }}
										aria-label="Close menu"
									></button>

									<div class="absolute right-0 z-50 mt-2 w-64 rounded-md bg-card shadow-lg ring-1 ring-black/5">
										<div class="py-1">
											<div class="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
												Data Formats
											</div>
											{#each EXPORT_FORMATS.filter(f => f.group === 'data') as fmt (fmt.id)}
												<button
													onclick={() => {
														if (fmt.id === 'csv' || fmt.id === 'json') {
															handleExport(fmt.id);
														} else {
															handleAdvancedExport(fmt.id);
														}
													}}
													class="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between"
												>
													<div>
														<span class="text-sm font-medium text-foreground">{fmt.label}</span>
														<p class="text-xs text-muted-foreground">{fmt.description}</p>
													</div>
												</button>
											{/each}

											<div class="my-1 border-t border-border"></div>

											<div class="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
												Statistical Software
											</div>
											{#each EXPORT_FORMATS.filter(f => f.group === 'stats') as fmt (fmt.id)}
												<button
													onclick={() => handleAdvancedExport(fmt.id)}
													class="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between"
												>
													<div>
														<span class="text-sm font-medium text-foreground">{fmt.label}</span>
														<p class="text-xs text-muted-foreground">{fmt.description}</p>
													</div>
													<span class="text-xs text-muted-foreground">.zip</span>
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<main class="px-4 sm:px-6 lg:px-8 py-8">
		{#if data.questionnaires.length === 0}
			<!-- No questionnaires state -->
			<div class="text-center py-16">
				<BarChart3 class="mx-auto h-12 w-12 text-muted-foreground" />
				<h3 class="mt-4 text-lg font-medium text-foreground">
					No questionnaires yet
				</h3>
				<p class="mt-2 text-sm text-muted-foreground">
					Create a questionnaire and collect responses to see analytics here.
				</p>
				<div class="mt-6">
					<a
						href={appPaths.project(data.project.id)}
						class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
					>
						Go to Project
					</a>
				</div>
			</div>
		{:else if loading}
			<!-- Loading state -->
			<div class="flex items-center justify-center py-16">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
				<span class="ml-3 text-muted-foreground">Loading analytics data...</span>
			</div>
		{:else if error}
			<!-- Error state -->
			<div
				class="bg-destructive/10 border border-destructive/30 rounded-lg p-4"
			>
				<div class="flex">
					<div class="flex-shrink-0">
						<svg
							class="h-5 w-5 text-destructive"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="ml-3">
						<h3 class="text-sm font-medium text-destructive">
							Error Loading Data
						</h3>
						<div class="mt-2 text-sm text-destructive">{error}</div>
						<div class="mt-4">
							<button
								onclick={() => {
									error = null;
									if (selectedQuestionnaireId) loadSessions(selectedQuestionnaireId);
								}}
								class="bg-destructive/10 px-3 py-2 rounded-md text-sm font-medium text-destructive hover:bg-destructive/20"
							>
								Try Again
							</button>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<!-- Tab Switcher -->
			<div class="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
				<button
					onclick={() => { analyticsTab = 'overview'; }}
					class="px-4 py-2 text-sm font-medium rounded-md transition-colors {analyticsTab === 'overview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
				>
					Overview
				</button>
				<button
					onclick={() => { analyticsTab = 'per-question'; }}
					class="px-4 py-2 text-sm font-medium rounded-md transition-colors {analyticsTab === 'per-question' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
				>
					Per Question
				</button>
			</div>

			{#if analyticsTab === 'per-question'}
				<!-- Per-Question Analytics -->
				{#if questionAnalytics.length === 0}
					<div class="text-center py-12 bg-card shadow rounded-lg">
						<PieChart class="mx-auto h-10 w-10 text-muted-foreground" />
						<h4 class="mt-2 text-sm font-medium text-foreground">No response data</h4>
						<p class="mt-1 text-sm text-muted-foreground">
							Response data will appear once participants complete the questionnaire.
						</p>
					</div>
				{:else}
					<div class="space-y-6">
						{#each questionAnalytics as qa (qa.questionId)}
							<div class="bg-card shadow rounded-lg overflow-hidden">
								<div class="px-6 py-4 border-b border-border flex items-center justify-between">
									<h3 class="text-sm font-semibold text-foreground font-mono">
										{qa.questionId}
									</h3>
									<span class="text-xs text-muted-foreground">
										{qa.responseCount} responses
									</span>
								</div>

								<div class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
									<!-- Distribution Chart -->
									<div>
										<h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Response Distribution</h4>
										<div class="space-y-2">
											{#each getDistributionEntries(qa.distribution) as { label, count, pct }}
												<div class="flex items-center gap-3">
													<span class="text-xs text-foreground w-24 truncate flex-shrink-0" title={label}>{label}</span>
													<div class="flex-1 h-5 bg-muted rounded overflow-hidden">
														<div
															class="h-full bg-primary rounded transition-all"
															style="width: {pct}%"
														></div>
													</div>
													<span class="text-xs text-muted-foreground w-8 text-right flex-shrink-0">{count}</span>
												</div>
											{/each}
										</div>
										{#if qa.distribution.size > 10}
											<p class="text-xs text-muted-foreground mt-2">Showing top 10 of {qa.distribution.size} values</p>
										{/if}
									</div>

									<!-- Reaction Time Stats -->
									<div>
										<h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Reaction Time</h4>
										{#if qa.rtStats}
											<div class="grid grid-cols-3 gap-4">
												<div class="bg-muted rounded-lg p-3 text-center">
													<div class="text-lg font-semibold text-foreground">
														{Math.round(qa.rtStats.mean)}
													</div>
													<div class="text-xs text-muted-foreground">Mean (ms)</div>
												</div>
												<div class="bg-muted rounded-lg p-3 text-center">
													<div class="text-lg font-semibold text-foreground">
														{Math.round(qa.rtStats.median)}
													</div>
													<div class="text-xs text-muted-foreground">Median (ms)</div>
												</div>
												<div class="bg-muted rounded-lg p-3 text-center">
													<div class="text-lg font-semibold text-foreground">
														{Math.round(qa.rtStats.sd)}
													</div>
													<div class="text-xs text-muted-foreground">SD (ms)</div>
												</div>
											</div>
										{:else}
											<div class="flex items-center gap-2 text-sm text-muted-foreground py-4">
												<Timer class="h-4 w-4" />
												<span>No reaction time data for this question</span>
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>

					<!-- Completion rates per page -->
					<div class="mt-6 bg-card shadow rounded-lg overflow-hidden">
						<div class="px-6 py-4 border-b border-border">
							<h3 class="text-sm font-semibold text-foreground">Completion Summary</h3>
						</div>
						<div class="p-6">
							<div class="flex items-center gap-4">
								<div class="flex-1 h-4 bg-muted rounded-full overflow-hidden">
									<div
										class="h-full bg-success rounded-full transition-all"
										style="width: {completionRate}%"
									></div>
								</div>
								<span class="text-sm font-medium text-foreground whitespace-nowrap">
									{completedSessions.length} / {sessions.length} completed ({completionRate}%)
								</span>
							</div>
						</div>
					</div>
				{/if}
			{:else}

			<!-- Summary Cards -->
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<StatisticsCard
					title="Total Sessions"
					value={sessions.length}
					subtitle="{completedSessions.length} completed, {activeSessions.length} active"
					trend={null}
					icon="users"
					color="blue"
				/>

				<StatisticsCard
					title="Completion Rate"
					value="{completionRate}%"
					subtitle="{completedSessions.length} / {sessions.length} sessions"
					trend={null}
					icon="check-circle"
					color="green"
				/>

				<StatisticsCard
					title="Abandoned"
					value={abandonedSessions.length}
					subtitle={abandonedSessions.length > 0
						? `${Math.round((abandonedSessions.length / sessions.length) * 100)}% drop-off`
						: 'No abandoned sessions'}
					trend={null}
					icon="chart-bar"
					color={abandonedSessions.length > 0 ? 'red' : 'gray'}
				/>

				<StatisticsCard
					title="Questionnaire Status"
					value={selectedQuestionnaire?.status || '--'}
					subtitle="v{selectedQuestionnaire?.version || 1}"
					trend={null}
					icon="eye"
					color="purple"
				/>
			</div>

			<!-- Sessions Table -->
			<div class="bg-card shadow rounded-lg overflow-hidden">
				<div
					class="px-6 py-4 border-b border-border flex items-center justify-between"
				>
					<h3 class="text-lg font-medium text-foreground">
						Sessions
					</h3>
					<span class="text-sm text-muted-foreground">
						{sessions.length} total
					</span>
				</div>

				{#if sessions.length === 0}
					<div class="text-center py-12">
						<MessageSquare class="mx-auto h-10 w-10 text-muted-foreground" />
						<h4 class="mt-2 text-sm font-medium text-foreground">
							No sessions yet
						</h4>
						<p class="mt-1 text-sm text-muted-foreground">
							Sessions will appear here once participants start the questionnaire.
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-border">
							<thead class="bg-muted">
								<tr>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>
										Session ID
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>
										Participant
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>
										Status
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>
										Started
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
									>
										Completed
									</th>
								</tr>
							</thead>
							<tbody
								class="bg-card divide-y divide-border"
							>
								{#each sessions as session (session.id)}
									<tr class="hover:bg-accent">
										<td
											class="px-6 py-4 whitespace-nowrap text-sm font-mono text-foreground"
										>
											{session.id.slice(0, 8)}...
										</td>
										<td
											class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
										>
											{session.participantId || 'Anonymous'}
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<span
												class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {getStatusBadge(
													session.status
												)}"
											>
												{session.status}
											</span>
										</td>
										<td
											class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
										>
											{formatDate(session.startedAt)}
										</td>
										<td
											class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
										>
											{formatDate(session.completedAt)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			{/if}
			<!-- end analyticsTab -->
		{/if}
	</main>
</div>
