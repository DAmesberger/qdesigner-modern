<script lang="ts">
	import { page } from '$app/stores';
	import Navbar from '$lib/components/marketing/navigation/Navbar.svelte';
	import Footer from '$lib/components/marketing/navigation/Footer.svelte';
	import { fade } from 'svelte/transition';
	import '$lib/styles/themes/variables.css';

	let { children } = $props();
	let scrollY = $state(0);
	let showScrollProgress = $state(false);

	$effect(() => {
		const handleScroll = () => {
			scrollY = window.scrollY;
			showScrollProgress = scrollY > 100;
		};

		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<svelte:window bind:scrollY />

<div class="min-h-screen flex flex-col bg-background text-foreground">
	<!-- Scroll Progress Indicator -->
	{#if showScrollProgress && typeof window !== 'undefined' && document.body}
		<div
			class="fixed top-0 left-0 h-1 bg-gradient-to-r from-primary to-primary-foreground z-50 transition-all duration-300"
			style="width: {(scrollY / (document.body.scrollHeight - window.innerHeight)) * 100}%"
			transition:fade={{ duration: 200 }}
		></div>
	{/if}

	<!-- Navigation -->
	<Navbar {scrollY} />

	<!-- Main Content -->
	<main class="flex-1">
		{@render children?.()}
	</main>

	<!-- Footer -->
	<Footer />
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	:global(body) {
		overflow-x: hidden;
	}
</style>