<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import '$lib/styles/themes/variables.css';

	let { children } = $props();

	// Prevent right-click and text selection during runtime
	onMount(() => {
		if (browser) {
			const handleContextMenu = (e: Event) => e.preventDefault();
			const handleSelectStart = (e: Event) => e.preventDefault();

			document.addEventListener('contextmenu', handleContextMenu);
			document.addEventListener('selectstart', handleSelectStart);

			return () => {
				document.removeEventListener('contextmenu', handleContextMenu);
				document.removeEventListener('selectstart', handleSelectStart);
			};
		}
	});
</script>

<div class="fillout-container">
	{@render children?.()}
</div>

<style>
	.fillout-container {
		min-height: 100vh;
		background: var(--background);
		color: var(--foreground);
		overflow: hidden;
		position: relative;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	:global(body.fillout) {
		overflow: hidden;
	}

	:global(.fillout-container *) {
		-webkit-tap-highlight-color: transparent;
	}
</style>