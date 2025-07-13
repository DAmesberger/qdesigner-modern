<script lang="ts">
	import Button from '$lib/components/common/Button.svelte';
	import Card from '$lib/components/common/Card.svelte';
	import type { Questionnaire } from '$lib/shared/types/questionnaire';

	interface Props {
		questionnaire: Questionnaire;
		projectName?: string;
		onStart: () => void;
		estimatedDuration?: number;
	}

	let { questionnaire, projectName, onStart, estimatedDuration }: Props = $props();

	// Calculate estimated duration from questions if not provided
	const calculatedDuration = $derived(() => {
		if (estimatedDuration) return estimatedDuration;
		
		const questionCount = questionnaire.pages?.reduce(
			(total: number, page: any) => total + (page.questions?.length || 0), 
			0
		) || 0;
		
		// Rough estimate: 30 seconds per question
		return Math.ceil(questionCount * 0.5);
	});
</script>

<div class="welcome-screen">
	<Card class="welcome-card">
		<div class="welcome-content">
			{#if projectName}
				<p class="project-name">{projectName}</p>
			{/if}
			
			<h1 class="welcome-title">{questionnaire.name || 'Welcome'}</h1>
			
			{#if questionnaire.description}
				<p class="welcome-description">{questionnaire.description}</p>
			{/if}
			
			<div class="info-grid">
				{#if calculatedDuration() > 0}
					<div class="info-item">
						<svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<circle cx="12" cy="12" r="10" stroke-width="2"/>
							<path d="M12 6v6l4 2" stroke-width="2" stroke-linecap="round"/>
						</svg>
						<span>About {calculatedDuration()} minutes</span>
					</div>
				{/if}
				
				{#if questionnaire.pages?.length}
					<div class="info-item">
						<svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<rect x="5" y="3" width="14" height="18" rx="2" stroke-width="2"/>
							<line x1="9" y1="7" x2="15" y2="7" stroke-width="2" stroke-linecap="round"/>
							<line x1="9" y1="11" x2="15" y2="11" stroke-width="2" stroke-linecap="round"/>
							<line x1="9" y1="15" x2="13" y2="15" stroke-width="2" stroke-linecap="round"/>
						</svg>
						<span>{questionnaire.pages.length} sections</span>
					</div>
				{/if}
			</div>
			
			{#if questionnaire.settings?.requireConsent}
				<div class="instructions">
					<h3>Before you begin:</h3>
					<div class="instructions-content">
						<p>This questionnaire requires your consent to participate. Your responses will be used for research purposes.</p>
					</div>
				</div>
			{/if}
			
			<div class="actions">
				<Button 
					variant="default" 
					size="lg" 
					on:click={onStart}
					class="start-button"
				>
					Start Questionnaire
				</Button>
			</div>
			
			{#if questionnaire.settings?.requireAuthentication || questionnaire.settings?.requireConsent}
				<p class="privacy-notice">
					Your responses will be stored securely and used only for research purposes.
				</p>
			{/if}
		</div>
	</Card>
</div>

<style>
	.welcome-screen {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: var(--background);
	}

	.welcome-card {
		width: 100%;
		max-width: 600px;
	}

	.welcome-content {
		padding: 2rem;
		text-align: center;
	}

	.project-name {
		font-size: 0.875rem;
		color: var(--muted-foreground);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.welcome-title {
		font-size: 2rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: var(--foreground);
	}

	.welcome-description {
		font-size: 1.125rem;
		color: var(--muted-foreground);
		margin-bottom: 2rem;
		line-height: 1.6;
	}

	.info-grid {
		display: flex;
		gap: 2rem;
		justify-content: center;
		margin-bottom: 2rem;
	}

	.info-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.info-icon {
		width: 1.25rem;
		height: 1.25rem;
		opacity: 0.7;
	}

	.instructions {
		background: var(--muted);
		border-radius: 0.5rem;
		padding: 1.5rem;
		margin-bottom: 2rem;
		text-align: left;
	}

	.instructions h3 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		color: var(--foreground);
	}

	.instructions-content {
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--muted-foreground);
	}

	.instructions-content :global(ul) {
		list-style: disc;
		margin-left: 1.5rem;
		margin-top: 0.5rem;
	}

	.instructions-content :global(li) {
		margin-bottom: 0.25rem;
	}

	.actions {
		margin-bottom: 1.5rem;
	}

	.start-button {
		min-width: 200px;
	}

	.privacy-notice {
		font-size: 0.75rem;
		color: var(--muted-foreground);
		opacity: 0.8;
	}

	@media (max-width: 640px) {
		.welcome-content {
			padding: 1.5rem;
		}

		.welcome-title {
			font-size: 1.5rem;
		}

		.info-grid {
			flex-direction: column;
			gap: 1rem;
		}
	}
</style>