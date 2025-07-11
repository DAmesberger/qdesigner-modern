<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	
	let visible = $state(false);
	let hoveredCard = $state<string | null>(null);
	
	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					visible = true;
				}
			},
			{ threshold: 0.1 }
		);
		
		const element = document.getElementById('feature-bento');
		if (element) observer.observe(element);
		
		return () => observer.disconnect();
	});
	
	const features = [
		{
			id: 'designer',
			title: 'Visual Designer',
			description: 'Intuitive drag-and-drop interface with real-time preview. Build complex questionnaires without coding.',
			icon: '🎨',
			gradient: 'from-blue-500 to-purple-600',
			size: 'large',
			demo: true
		},
		{
			id: 'timing',
			title: 'Microsecond Timing',
			description: 'Research-grade precision with WebGL 2.0 rendering at 120+ FPS.',
			icon: '⚡',
			gradient: 'from-yellow-500 to-orange-600',
			size: 'medium'
		},
		{
			id: 'scripting',
			title: 'Advanced Scripting',
			description: 'Powerful formula engine for dynamic questionnaires and complex logic.',
			icon: '🧮',
			gradient: 'from-green-500 to-teal-600',
			size: 'medium'
		},
		{
			id: 'analytics',
			title: 'Real-time Analytics',
			description: 'Live dashboards with instant insights and exportable reports.',
			icon: '📊',
			gradient: 'from-purple-500 to-pink-600',
			size: 'medium'
		},
		{
			id: 'collaboration',
			title: 'Team Collaboration',
			description: 'Work together in real-time with version control and comments.',
			icon: '👥',
			gradient: 'from-indigo-500 to-blue-600',
			size: 'small'
		},
		{
			id: 'security',
			title: 'Enterprise Security',
			description: 'HIPAA compliant with end-to-end encryption.',
			icon: '🔒',
			gradient: 'from-red-500 to-rose-600',
			size: 'small'
		}
	];
</script>

<section id="feature-bento" class="py-24 relative">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Section Header -->
		<div class="text-center mb-8 sm:mb-12 lg:mb-16">
			<h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
				Everything you need for
				<span class="bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
					modern research
				</span>
			</h2>
			<p class="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
				Powerful features designed for researchers, by researchers. Built for speed, accuracy, and scale.
			</p>
		</div>
		
		<!-- Bento Grid -->
		{#if visible}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 max-w-7xl mx-auto">
				{#each features as feature, i}
					<div
						class="feature-card relative group {feature.size === 'large' ? 'md:col-span-2 lg:row-span-2' : ''} 
							{feature.size === 'medium' ? 'lg:col-span-2' : ''}"
						transition:fly={{ y: 20, duration: 500, delay: i * 100 }}
						onmouseenter={() => (hoveredCard = feature.id)}
						onmouseleave={() => (hoveredCard = null)}
					>
						<!-- Card Background -->
						<div class="absolute inset-0 bg-gradient-to-br {feature.gradient} opacity-5 group-hover:opacity-10 transition-opacity rounded-2xl"></div>
						
						<!-- Card Border with Gradient -->
						<div class="absolute inset-0 rounded-2xl overflow-hidden">
							<div class="absolute inset-0 bg-gradient-to-br {feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity"></div>
							<div class="absolute inset-[1px] bg-background rounded-2xl"></div>
						</div>
						
						<!-- Card Content -->
						<div class="relative h-full p-6 lg:p-8">
							<!-- Icon -->
							<div class="text-4xl mb-4">{feature.icon}</div>
							
							<!-- Title -->
							<h3 class="text-xl font-semibold mb-2">{feature.title}</h3>
							
							<!-- Description -->
							<p class="text-muted-foreground mb-4">{feature.description}</p>
							
							<!-- Demo Content for Large Card -->
							{#if feature.demo && feature.size === 'large'}
								<div class="mt-6 relative">
									<div class="bg-muted/50 rounded-lg p-4 border border-border">
										<!-- Mini Designer Preview -->
										<div class="space-y-3">
											<div class="flex items-center gap-2">
												<div class="w-2 h-2 bg-primary rounded-full"></div>
												<div class="h-2 bg-muted rounded flex-1 max-w-[100px]"></div>
											</div>
											<div class="bg-background/50 rounded p-3 border border-border">
												<div class="h-2 bg-muted rounded w-3/4 mb-2"></div>
												<div class="h-2 bg-muted rounded w-1/2"></div>
											</div>
											<div class="flex gap-2">
												<div class="h-8 bg-primary/20 rounded px-3 flex items-center justify-center">
													<div class="h-2 bg-primary rounded w-12"></div>
												</div>
												<div class="h-8 bg-muted rounded px-3 flex items-center justify-center">
													<div class="h-2 bg-muted-foreground/50 rounded w-12"></div>
												</div>
											</div>
										</div>
									</div>
									
									<!-- Floating Elements -->
									{#if hoveredCard === feature.id}
										<div class="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full" 
											transition:fly={{ y: -10, duration: 300 }}>
											Live Preview
										</div>
									{/if}
								</div>
							{/if}
							
							<!-- Stats for Medium Cards -->
							{#if feature.size === 'medium' && hoveredCard === feature.id}
								<div class="mt-4 grid grid-cols-2 gap-4" transition:fade={{ duration: 200 }}>
									<div>
										<p class="text-2xl font-bold text-foreground">
											{feature.id === 'timing' ? '<1μs' : feature.id === 'analytics' ? '100ms' : '99.9%'}
										</p>
										<p class="text-xs text-muted-foreground">
											{feature.id === 'timing' ? 'Precision' : feature.id === 'analytics' ? 'Latency' : 'Uptime'}
										</p>
									</div>
									<div>
										<p class="text-2xl font-bold text-foreground">
											{feature.id === 'timing' ? '120+' : feature.id === 'analytics' ? '50+' : '256-bit'}
										</p>
										<p class="text-xs text-muted-foreground">
											{feature.id === 'timing' ? 'FPS' : feature.id === 'analytics' ? 'Metrics' : 'Encryption'}
										</p>
									</div>
								</div>
							{/if}
							
							<!-- Learn More Link -->
							<div class="absolute bottom-6 right-6">
								<a href="/features#{feature.id}" class="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
									Learn more
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
									</svg>
								</a>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>

<style>
	.feature-card {
		position: relative;
		overflow: hidden;
		border-radius: 1rem;
		border: 1px solid hsl(var(--border));
		background-color: hsl(var(--card));
		transition: all 300ms;
	}
	
	.feature-card:hover {
		box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
		transform: translateY(-0.25rem);
	}
</style>