<script lang="ts">
	import { onDestroy } from 'svelte';
	import { computePosition, flip, shift, offset, autoUpdate } from '@floating-ui/dom';
	import { tourEngine } from '../tours/TourEngine.svelte';
	import TourStepComponent from './TourStep.svelte';
	import { X } from 'lucide-svelte';

	let tooltipEl = $state<HTMLDivElement | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let autoUpdateCleanup: (() => void) | null = null;

	const PAD = 8;
	const CORNER_R = 8;

	$effect(() => {
		const el = tourEngine.targetElement;
		const tooltip = tooltipEl;

		// Clean up previous auto-update
		autoUpdateCleanup?.();
		autoUpdateCleanup = null;

		if (!el || !tooltip || !tourEngine.isActive) return;

		const placement = tourEngine.currentStep?.placement ?? 'bottom';

		autoUpdateCleanup = autoUpdate(el, tooltip, () => {
			tourEngine.highlightRect = el.getBoundingClientRect();
			computePosition(el, tooltip, {
				placement,
				middleware: [offset(12), flip(), shift({ padding: 8 })],
			}).then(({ x, y }) => {
				tooltipX = x;
				tooltipY = y;
			});
		});
	});

	onDestroy(() => {
		autoUpdateCleanup?.();
	});

	function handleKeydown(event: KeyboardEvent) {
		if (!tourEngine.isActive) return;

		switch (event.key) {
			case 'ArrowRight':
			case 'Enter':
				event.preventDefault();
				tourEngine.next();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				tourEngine.previous();
				break;
			case 'Escape':
				event.preventDefault();
				tourEngine.end();
				break;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		// If the step is interactive, allow clicks through to the target
		if (tourEngine.currentStep?.interactive && tourEngine.targetElement) {
			const rect = tourEngine.targetElement.getBoundingClientRect();
			const x = event.clientX;
			const y = event.clientY;
			if (
				x >= rect.left - PAD &&
				x <= rect.right + PAD &&
				y >= rect.top - PAD &&
				y <= rect.bottom + PAD
			) {
				return;
			}
		}
		// Otherwise clicking backdrop does nothing (user must use buttons)
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if tourEngine.isActive && tourEngine.currentStep}
	{@const rect = tourEngine.highlightRect}

	<button
		type="button"
		class="fixed right-4 top-4 z-[62] inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white backdrop-blur"
		onclick={() => tourEngine.end()}
		aria-label="End tour"
	>
		<X class="h-4 w-4" />
		Skip Tour
	</button>

	<!-- Full-screen overlay -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[60]"
		onclick={handleBackdropClick}
		onkeydown={(e) => { if (e.key === 'Escape') tourEngine.end(); }}
		role="presentation"
	>
		<!-- SVG mask overlay -->
		<svg class="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<mask id="tour-spotlight-mask">
					<rect width="100%" height="100%" fill="white" />
					{#if rect}
						<rect
							x={rect.left - PAD}
							y={rect.top - PAD}
							width={rect.width + PAD * 2}
							height={rect.height + PAD * 2}
							rx={CORNER_R}
							ry={CORNER_R}
							fill="black"
						/>
					{/if}
				</mask>
			</defs>
			<rect
				width="100%"
				height="100%"
				fill="rgba(0,0,0,0.5)"
				mask="url(#tour-spotlight-mask)"
				style="backdrop-filter: blur(2px)"
			/>
		</svg>

		<!-- Spotlight ring (visual highlight around cutout) -->
		{#if rect}
			<div
				class="absolute border-2 border-primary/50 rounded-lg pointer-events-none"
				style="
					left: {rect.left - PAD}px;
					top: {rect.top - PAD}px;
					width: {rect.width + PAD * 2}px;
					height: {rect.height + PAD * 2}px;
				"
			></div>
		{/if}
	</div>

	<!-- Tooltip (outside overlay for proper z-stacking) -->
	<div
		bind:this={tooltipEl}
		class="fixed z-[61] pointer-events-auto"
		style="left: {tooltipX}px; top: {tooltipY}px;"
	>
		<TourStepComponent
			step={tourEngine.currentStep}
			stepIndex={tourEngine.currentStepIndex}
			totalSteps={tourEngine.totalSteps}
			onNext={() => tourEngine.next()}
			onPrevious={() => tourEngine.previous()}
			onEnd={() => tourEngine.end()}
		/>
	</div>
{/if}
