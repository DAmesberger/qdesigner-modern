<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import AnimatedStats from './AnimatedStats.svelte';
	import HeroVideo from './HeroVideo.svelte';
	
	let mounted = $state(false);
	let mouseX = $state(0);
	let mouseY = $state(0);

	onMount(() => {
		mounted = true;
		const handleMouseMove = (e: MouseEvent) => {
			mouseX = (e.clientX / window.innerWidth - 0.5) * 20;
			mouseY = (e.clientY / window.innerHeight - 0.5) * 20;
		};
		
		window.addEventListener('mousemove', handleMouseMove);
		return () => window.removeEventListener('mousemove', handleMouseMove);
	});
</script>

<section class="relative min-h-screen flex items-center justify-center overflow-hidden">
	<!-- Animated Background -->
	<div class="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5">
		<!-- Grid Pattern -->
		<div class="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
		
		<!-- Floating Particles -->
		<div class="absolute inset-0">
			{#each Array(20) as _, i}
				<div
					class="absolute w-2 h-2 bg-primary/20 rounded-full animate-float"
					style="
						left: {Math.random() * 100}%;
						top: {Math.random() * 100}%;
						animation-delay: {Math.random() * 5}s;
						animation-duration: {10 + Math.random() * 10}s;
					"
				/>
			{/each}
		</div>

		<!-- Gradient Orbs -->
		<div
			class="absolute top-1/4 -left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-3xl animate-pulse-light"
			style="transform: translate({mouseX}px, {mouseY}px)"
		/>
		<div
			class="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-light"
			style="transform: translate({-mouseX}px, {-mouseY}px)"
		/>
	</div>

	<!-- Content -->
	<div class="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
		<div class="max-w-7xl mx-auto">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
				<!-- Left Column - Text Content -->
				<div class="text-center lg:text-left order-2 lg:order-1">
					{#if mounted}
						<div transition:fly={{ y: 20, duration: 600 }}>
							<!-- Badge -->
							<div class="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 backdrop-blur-sm border border-primary/20 rounded-full text-xs sm:text-sm font-medium text-primary mb-4 sm:mb-6">
								<span class="relative flex h-2 w-2">
									<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
									<span class="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
								</span>
								New: WebGL 2.0 Rendering Engine
							</div>

							<!-- Headline -->
							<h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6">
								<span class="block text-foreground">Research-Grade</span>
								<span class="block bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
									Questionnaire Platform
								</span>
							</h1>

							<!-- Subheadline -->
							<p class="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto lg:mx-0">
								Build and deploy sophisticated psychological experiments with microsecond-accurate timing, 
								120+ FPS rendering, and enterprise-grade security.
							</p>

							<!-- CTA Buttons -->
							<div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start">
								<a
									href="/signup"
									class="group relative inline-flex items-center justify-center px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base font-medium text-primary-foreground bg-primary rounded-lg overflow-hidden transition-all hover:scale-105"
								>
									<span class="absolute inset-0 bg-gradient-to-r from-primary to-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
									<span class="relative z-10 flex items-center gap-2">
										Start Free Trial
										<svg class="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
										</svg>
									</span>
								</a>
								<a
									href="#demo"
									class="inline-flex items-center justify-center px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
								>
									<svg class="w-4 sm:w-5 h-4 sm:h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
									Watch Demo
								</a>
							</div>

							<!-- Stats -->
							<AnimatedStats />
						</div>
					{/if}
				</div>

				<!-- Right Column - Visual -->
				<div class="relative order-1 lg:order-2">
					{#if mounted}
						<div transition:fade={{ duration: 800, delay: 200 }}>
							<HeroVideo />
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Scroll Indicator -->
	<div class="absolute bottom-8 left-1/2 -translate-x-1/2">
		<div class="flex flex-col items-center gap-2 text-muted-foreground">
			<span class="text-sm">Scroll to explore</span>
			<svg class="w-6 h-6 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
			</svg>
		</div>
	</div>
</section>

<style>
	@keyframes float {
		0%, 100% {
			transform: translateY(0) translateX(0);
		}
		25% {
			transform: translateY(-20px) translateX(10px);
		}
		50% {
			transform: translateY(-10px) translateX(-10px);
		}
		75% {
			transform: translateY(-30px) translateX(5px);
		}
	}
</style>