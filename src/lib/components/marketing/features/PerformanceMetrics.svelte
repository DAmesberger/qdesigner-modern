<script lang="ts">
	import { onMount } from 'svelte';
	
	let visible = $state(false);
	let progressValues = $state([0, 0, 0, 0]);
	
	const metrics = [
		{
			label: 'Response Time',
			value: 99.9,
			unit: '%',
			description: 'Under 1ms latency',
			color: 'from-green-500 to-emerald-600'
		},
		{
			label: 'Frame Rate',
			value: 120,
			unit: 'FPS',
			description: 'Smooth animations',
			color: 'from-blue-500 to-cyan-600'
		},
		{
			label: 'Data Accuracy',
			value: 100,
			unit: '%',
			description: 'Microsecond precision',
			color: 'from-purple-500 to-pink-600'
		},
		{
			label: 'Uptime SLA',
			value: 99.99,
			unit: '%',
			description: 'Enterprise reliability',
			color: 'from-orange-500 to-red-600'
		}
	];
	
	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !visible) {
					visible = true;
					// Animate progress values
					metrics.forEach((metric, i) => {
						const duration = 2000;
						const start = performance.now();
						const animate = () => {
							const elapsed = performance.now() - start;
							const progress = Math.min(elapsed / duration, 1);
							// Cubic easing out
							const eased = 1 - Math.pow(1 - progress, 3);
							progressValues[i] = metric.value * eased;
							
							if (progress < 1) {
								requestAnimationFrame(animate);
							}
						};
						requestAnimationFrame(animate);
					});
				}
			},
			{ threshold: 0.3 }
		);
		
		const element = document.getElementById('performance-metrics');
		if (element) observer.observe(element);
		
		return () => observer.disconnect();
	});
</script>

<section id="performance-metrics" class="py-24 bg-muted/30 relative overflow-hidden">
	<!-- Background Pattern -->
	<div class="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-5" />
	
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 relative">
		<!-- Section Header -->
		<div class="text-center mb-8 sm:mb-12 lg:mb-16">
			<div class="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 backdrop-blur-sm border border-primary/20 rounded-full text-xs sm:text-sm font-medium text-primary mb-3 sm:mb-4">
				<svg class="w-3 sm:w-4 h-3 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
				</svg>
				Performance First
			</div>
			<h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
				Built for
				<span class="bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
					extreme performance
				</span>
			</h2>
			<p class="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
				Every millisecond counts in research. Our platform is optimized for speed and accuracy at every level.
			</p>
		</div>
		
		<!-- Metrics Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
			{#each metrics as metric, i}
				<div class="bg-card border border-border rounded-xl p-6 relative overflow-hidden group hover:shadow-lg transition-all">
					<!-- Background Gradient -->
					<div class="absolute inset-0 bg-gradient-to-br {metric.color} opacity-5 group-hover:opacity-10 transition-opacity" />
					
					<!-- Circular Progress -->
					<div class="relative mb-4">
						<svg class="w-32 h-32 mx-auto transform -rotate-90">
							<!-- Background Circle -->
							<circle
								cx="64"
								cy="64"
								r="56"
								stroke="currentColor"
								stroke-width="8"
								fill="none"
								class="text-muted"
							/>
							<!-- Progress Circle -->
							<circle
								cx="64"
								cy="64"
								r="56"
								stroke="url(#gradient-{i})"
								stroke-width="8"
								fill="none"
								stroke-linecap="round"
								stroke-dasharray={`${2 * Math.PI * 56}`}
								stroke-dashoffset={`${2 * Math.PI * 56 * (1 - (progressValues[i] ?? 0) / 100)}`}
								class="transition-all duration-1000"
							/>
							<!-- Gradient Definition -->
							<defs>
								<linearGradient id="gradient-{i}" x1="0%" y1="0%" x2="100%" y2="100%">
									<stop offset="0%" class="text-primary" stop-color="currentColor" />
									<stop offset="100%" class="text-primary-foreground" stop-color="currentColor" />
								</linearGradient>
							</defs>
						</svg>
						
						<!-- Value Display -->
						<div class="absolute inset-0 flex items-center justify-center">
							<div class="text-center">
								<span class="text-3xl font-bold text-foreground">
									{Math.floor(progressValues[i] ?? 0)}
								</span>
								<span class="text-lg font-semibold text-primary">
									{metric.unit}
								</span>
							</div>
						</div>
					</div>
					
					<!-- Label and Description -->
					<h3 class="text-lg font-semibold text-center mb-1">{metric.label}</h3>
					<p class="text-sm text-muted-foreground text-center">{metric.description}</p>
				</div>
			{/each}
		</div>
		
		<!-- Technical Details -->
		<div class="mt-16 bg-card border border-border rounded-xl p-8 max-w-4xl mx-auto">
			<h3 class="text-xl font-semibold mb-6 text-center">Under the Hood</h3>
			<div class="grid md:grid-cols-3 gap-6 text-center">
				<div>
					<div class="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-3">
						<svg class="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
						</svg>
					</div>
					<h4 class="font-medium mb-1">WebGL 2.0 Rendering</h4>
					<p class="text-sm text-muted-foreground">GPU-accelerated graphics for complex stimuli</p>
				</div>
				<div>
					<div class="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-3">
						<svg class="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h4 class="font-medium mb-1">High-Resolution Timer</h4>
					<p class="text-sm text-muted-foreground">Sub-millisecond accuracy using performance.now()</p>
				</div>
				<div>
					<div class="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-3">
						<svg class="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<h4 class="font-medium mb-1">Edge Computing</h4>
					<p class="text-sm text-muted-foreground">Global CDN with 50+ edge locations</p>
				</div>
			</div>
		</div>
	</div>
</section>