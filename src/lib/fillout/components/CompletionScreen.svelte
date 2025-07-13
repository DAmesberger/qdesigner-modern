<script lang="ts">
	import Button from '$lib/components/common/Button.svelte';
	import Card from '$lib/components/common/Card.svelte';
	import type { QuestionnaireSession } from '$lib/shared';

	interface Props {
		session?: QuestionnaireSession;
		customMessage?: string;
		showStatistics?: boolean;
		showDownload?: boolean;
		onClose?: () => void;
		onDownload?: () => void;
	}

	let { 
		session,
		customMessage,
		showStatistics = true,
		showDownload = false,
		onClose,
		onDownload
	}: Props = $props();

	// Calculate statistics
	const duration = $derived(() => {
		if (!session?.startTime || !session?.endTime) return null;
		const ms = session.endTime - session.startTime;
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	});

	const completionCode = $derived(() => {
		// Generate a completion code from session ID
		return session?.id.slice(-8).toUpperCase() || 'COMPLETE';
	});

	function handleClose() {
		if (onClose) {
			onClose();
		} else {
			// Default to going home
			window.location.href = '/';
		}
	}
</script>

<div class="completion-screen">
	<Card class="completion-card">
		<div class="completion-content">
			<!-- Success icon -->
			<div class="success-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<circle cx="12" cy="12" r="10" stroke-width="2"/>
					<path d="M8 12l3 3 5-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</div>

			<h1 class="completion-title">Thank You!</h1>
			
			<p class="completion-message">
				{customMessage || 'Your responses have been successfully recorded.'}
			</p>

			{#if showStatistics && session}
				<div class="statistics">
					{#if duration()}
						<div class="stat-item">
							<span class="stat-label">Time taken</span>
							<span class="stat-value">{duration()}</span>
						</div>
					{/if}
					
					{#if session.responses?.length}
						<div class="stat-item">
							<span class="stat-label">Questions answered</span>
							<span class="stat-value">{session.responses.length}</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Completion code -->
			<div class="completion-code">
				<p class="code-label">Your completion code:</p>
				<div class="code-display">
					<code>{completionCode()}</code>
					<button 
						class="copy-button"
						on:click={() => navigator.clipboard.writeText(completionCode())}
						title="Copy to clipboard"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<rect x="9" y="9" width="13" height="13" rx="2" stroke-width="2"/>
							<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-width="2"/>
						</svg>
					</button>
				</div>
				<p class="code-note">Please save this code for your records.</p>
			</div>

			<div class="actions">
				{#if showDownload && onDownload}
					<Button 
						variant="outline" 
						size="lg"
						on:click={onDownload}
					>
						Download Responses
					</Button>
				{/if}
				
				<Button 
					variant="default" 
					size="lg"
					on:click={handleClose}
				>
					{onClose ? 'Close' : 'Return Home'}
				</Button>
			</div>

			<p class="footer-note">
				If you have any questions about this study, please contact the research team.
			</p>
		</div>
	</Card>
</div>

<style>
	.completion-screen {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: var(--background);
	}

	.completion-card {
		width: 100%;
		max-width: 600px;
	}

	.completion-content {
		padding: 2rem;
		text-align: center;
	}

	.success-icon {
		width: 4rem;
		height: 4rem;
		margin: 0 auto 1.5rem;
		color: var(--success, #22c55e);
	}

	.success-icon svg {
		width: 100%;
		height: 100%;
	}

	.completion-title {
		font-size: 2rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: var(--foreground);
	}

	.completion-message {
		font-size: 1.125rem;
		color: var(--muted-foreground);
		margin-bottom: 2rem;
		line-height: 1.6;
	}

	.statistics {
		display: flex;
		gap: 2rem;
		justify-content: center;
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: var(--muted);
		border-radius: 0.5rem;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--foreground);
	}

	.completion-code {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: var(--muted);
		border-radius: 0.5rem;
	}

	.code-label {
		font-size: 0.875rem;
		color: var(--muted-foreground);
		margin-bottom: 0.5rem;
	}

	.code-display {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.code-display code {
		font-size: 1.5rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: var(--primary);
		font-family: monospace;
	}

	.copy-button {
		width: 2rem;
		height: 2rem;
		padding: 0.375rem;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s;
		color: var(--muted-foreground);
	}

	.copy-button:hover {
		background: var(--muted);
		color: var(--foreground);
	}

	.copy-button:active {
		transform: scale(0.95);
	}

	.copy-button svg {
		width: 100%;
		height: 100%;
	}

	.code-note {
		font-size: 0.75rem;
		color: var(--muted-foreground);
		opacity: 0.8;
	}

	.actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-bottom: 1.5rem;
	}

	.footer-note {
		font-size: 0.75rem;
		color: var(--muted-foreground);
		opacity: 0.8;
	}

	@media (max-width: 640px) {
		.completion-content {
			padding: 1.5rem;
		}

		.completion-title {
			font-size: 1.5rem;
		}

		.statistics {
			flex-direction: column;
			gap: 1rem;
		}

		.actions {
			flex-direction: column;
		}
	}
</style>