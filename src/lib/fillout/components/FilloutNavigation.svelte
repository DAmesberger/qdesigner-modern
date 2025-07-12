<script lang="ts">
	import Button from '$lib/components/common/Button.svelte';
	import ProgressIndicator from './ProgressIndicator.svelte';

	interface Props {
		canGoNext: boolean;
		canGoPrevious: boolean;
		onNext: () => void;
		onPrevious: () => void;
		onExit?: () => void;
		currentPage?: number;
		totalPages?: number;
		nextLabel?: string;
		previousLabel?: string;
		showProgress?: boolean;
		variant?: 'bottom' | 'floating' | 'split';
	}

	let {
		canGoNext,
		canGoPrevious,
		onNext,
		onPrevious,
		onExit,
		currentPage = 1,
		totalPages = 1,
		nextLabel = 'Next',
		previousLabel = 'Back',
		showProgress = true,
		variant = 'bottom'
	}: Props = $props();

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight' && canGoNext) {
			onNext();
		} else if (event.key === 'ArrowLeft' && canGoPrevious) {
			onPrevious();
		}
	}
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="fillout-navigation {variant}">
	{#if showProgress && totalPages > 1}
		<div class="navigation-progress">
			<ProgressIndicator 
				current={currentPage} 
				total={totalPages} 
				variant="bar"
				showSteps={true}
				showPercentage={false}
			/>
		</div>
	{/if}

	<div class="navigation-controls">
		{#if variant === 'split'}
			<div class="nav-left">
				<Button
					variant="ghost"
					size="lg"
					onclick={onPrevious}
					disabled={!canGoPrevious}
					class="nav-button nav-previous"
				>
					<svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path d="M15 18l-6-6 6-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					{previousLabel}
				</Button>
			</div>

			<div class="nav-center">
				{#if onExit}
					<Button
						variant="ghost"
						size="sm"
						onclick={onExit}
						class="exit-button"
					>
						Save & Exit
					</Button>
				{/if}
			</div>

			<div class="nav-right">
				<Button
					variant="default"
					size="lg"
					onclick={onNext}
					disabled={!canGoNext}
					class="nav-button nav-next"
				>
					{nextLabel}
					<svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path d="M9 18l6-6-6-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</Button>
			</div>
		{:else}
			<Button
				variant="outline"
				size="lg"
				onclick={onPrevious}
				disabled={!canGoPrevious}
				class="nav-button nav-previous"
			>
				<svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path d="M15 18l-6-6 6-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				{previousLabel}
			</Button>

			{#if onExit && variant === 'bottom'}
				<Button
					variant="ghost"
					size="sm"
					onclick={onExit}
					class="exit-button"
				>
					Save & Exit
				</Button>
			{/if}

			<Button
				variant="default"
				size="lg"
				onclick={onNext}
				disabled={!canGoNext}
				class="nav-button nav-next"
			>
				{nextLabel}
				<svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path d="M9 18l6-6-6-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</Button>
		{/if}
	</div>
</div>

<style>
	.fillout-navigation {
		width: 100%;
		background: var(--background);
		border-top: 1px solid var(--border);
		z-index: 10;
	}

	/* Bottom variant */
	.fillout-navigation.bottom {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 1rem;
	}

	/* Floating variant */
	.fillout-navigation.floating {
		position: fixed;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		width: auto;
		max-width: 600px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 1rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
	}

	/* Split variant */
	.fillout-navigation.split {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 1rem 2rem;
	}

	.navigation-progress {
		margin-bottom: 1rem;
		max-width: 600px;
		margin-left: auto;
		margin-right: auto;
	}

	.navigation-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		max-width: 600px;
		margin: 0 auto;
	}

	.split .navigation-controls {
		max-width: none;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 2rem;
	}

	.nav-left {
		display: flex;
		justify-content: flex-start;
	}

	.nav-center {
		display: flex;
		justify-content: center;
	}

	.nav-right {
		display: flex;
		justify-content: flex-end;
	}

	.nav-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 120px;
	}

	.button-icon {
		width: 1.25rem;
		height: 1.25rem;
	}

	.nav-previous .button-icon {
		margin-right: 0.25rem;
	}

	.nav-next .button-icon {
		margin-left: 0.25rem;
	}

	.exit-button {
		opacity: 0.7;
		transition: opacity 0.2s;
	}

	.exit-button:hover {
		opacity: 1;
	}

	/* Mobile adjustments */
	@media (max-width: 640px) {
		.fillout-navigation.bottom,
		.fillout-navigation.split {
			padding: 0.75rem;
		}

		.navigation-controls {
			gap: 0.75rem;
		}

		.nav-button {
			min-width: 100px;
			font-size: 0.875rem;
		}

		.exit-button {
			display: none;
		}

		.split .navigation-controls {
			grid-template-columns: 1fr 1fr;
			gap: 0.75rem;
		}

		.split .nav-center {
			display: none;
		}
	}

	/* Prevent content overlap */
	:global(body) {
		padding-bottom: 120px;
	}
</style>