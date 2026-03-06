<script lang="ts">
	import type { TourStep } from '../tours/types';
	import { X } from 'lucide-svelte';

	interface Props {
		step: TourStep;
		stepIndex: number;
		totalSteps: number;
		onNext: () => void;
		onPrevious: () => void;
		onEnd: () => void;
	}

	let { step, stepIndex, totalSteps, onNext, onPrevious, onEnd }: Props = $props();

	let isFirst = $derived(stepIndex === 0);
	let isLast = $derived(stepIndex === totalSteps - 1);

	function renderDescription(text: string): string {
		return text
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs font-mono">$1</code>')
			.replace(/\n/g, '<br>');
	}
</script>

<div class="w-72 rounded-xl bg-[hsl(var(--layer-surface))] border border-[hsl(var(--glass-border))] shadow-xl">
	<!-- Header -->
	<div class="flex items-start justify-between p-4 pb-2">
		<h3 class="text-sm font-semibold text-foreground pr-4">{step.title}</h3>
		<button
			type="button"
			class="shrink-0 p-1 -mt-1 -mr-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
			onclick={onEnd}
			aria-label="Close tour"
		>
			<X size={16} />
		</button>
	</div>

	<!-- Description -->
	<div class="px-4 pb-3">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<p class="text-sm text-muted-foreground leading-relaxed">{@html renderDescription(step.description)}</p>
	</div>

	<!-- Footer -->
	<div class="flex items-center justify-between px-4 py-3 border-t border-[hsl(var(--glass-border))] bg-muted/30 rounded-b-xl">
		<span class="text-xs text-muted-foreground">
			Step {stepIndex + 1} of {totalSteps}
		</span>
		<div class="flex items-center gap-2">
			{#if !isFirst}
				<button
					type="button"
					class="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
					onclick={onPrevious}
				>
					Previous
				</button>
			{/if}
			<button
				type="button"
				class="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
				onclick={isLast ? onEnd : onNext}
			>
				{isLast ? 'Finish' : 'Next'}
			</button>
		</div>
	</div>
</div>
