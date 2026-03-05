<script lang="ts">
	interface Props {
		featureKey: string;
		class?: string;
	}

	let { featureKey, class: className = '' }: Props = $props();

	let seen = $state(false);

	$effect(() => {
		try {
			seen = localStorage.getItem(`qd-seen:${featureKey}`) === 'true';
		} catch {
			seen = false;
		}
	});
</script>

{#if !seen}
	<span class="absolute {className}" aria-hidden="true">
		<span class="beacon-dot"></span>
		<span class="beacon-ring"></span>
	</span>
{/if}

<style>
	.beacon-dot {
		display: block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: hsl(var(--primary));
	}

	.beacon-ring {
		position: absolute;
		inset: -3px;
		border-radius: 50%;
		border: 1.5px solid hsl(var(--primary) / 0.5);
		animation: beacon-pulse 2s ease-in-out infinite;
	}

	@keyframes beacon-pulse {
		0%, 100% {
			transform: scale(1);
			opacity: 0.7;
		}
		50% {
			transform: scale(2);
			opacity: 0;
		}
	}
</style>
