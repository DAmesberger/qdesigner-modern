<script lang="ts">
	import { onMount } from 'svelte';
	
	let mouseX = $state(0);
	let mouseY = $state(0);
	
	onMount(() => {
		const handleMouseMove = (e: MouseEvent) => {
			const rect = document.getElementById('cta-section')?.getBoundingClientRect();
			if (rect) {
				mouseX = (e.clientX - rect.left) / rect.width;
				mouseY = (e.clientY - rect.top) / rect.height;
			}
		};
		
		window.addEventListener('mousemove', handleMouseMove);
		return () => window.removeEventListener('mousemove', handleMouseMove);
	});
</script>

<section id="cta-section" class="py-24 relative overflow-hidden">
	<!-- Animated Background -->
	<div class="absolute inset-0">
		<div class="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/10"></div>
		<div
			class="absolute w-[500px] h-[500px] bg-primary/20 rounded-full blur-3xl"
			style="left: {mouseX * 100}%; top: {mouseY * 100}%; transform: translate(-50%, -50%);"
		></div>
	</div>
	
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 relative">
		<div class="max-w-4xl mx-auto text-center">
			<!-- Badge -->
			<div class="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 backdrop-blur-sm border border-primary/20 rounded-full text-xs sm:text-sm font-medium text-primary mb-4 sm:mb-6">
				<svg class="w-3 sm:w-4 h-3 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
				</svg>
				No credit card required
			</div>
			
			<!-- Headline -->
			<h2 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4">
				Ready to transform your
				<span class="bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
					research workflow?
				</span>
			</h2>
			
			<!-- Subheadline -->
			<p class="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto px-4">
				Join thousands of researchers who are already using QDesigner to conduct better experiments, 
				collect cleaner data, and publish faster.
			</p>
			
			<!-- CTA Buttons -->
			<div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
				<a
					href="/signup"
					class="group relative inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-medium text-primary-foreground bg-primary rounded-lg overflow-hidden transition-all hover:scale-105"
				>
					<span class="absolute inset-0 bg-gradient-to-r from-primary to-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity"></span>
					<span class="relative z-10">Start Free 14-Day Trial</span>
				</a>
				<a
					href="/demo"
					class="inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
				>
					Schedule a Demo
				</a>
			</div>
			
			<!-- Trust Indicators -->
			<div class="mt-8 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
				<div class="flex items-center gap-2">
					<svg class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					14-day free trial
				</div>
				<div class="flex items-center gap-2">
					<svg class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					No credit card required
				</div>
				<div class="flex items-center gap-2">
					<svg class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					Cancel anytime
				</div>
			</div>
		</div>
	</div>
</section>