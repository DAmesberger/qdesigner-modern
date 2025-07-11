<script lang="ts">
	import { onMount } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	
	let visible = $state(false);
	
	const stats = [
		{ value: 120, suffix: '+', label: 'FPS Support', duration: 2000 },
		{ value: 1, suffix: 'μs', label: 'Time Accuracy', duration: 2500 },
		{ value: 99.9, suffix: '%', label: 'Uptime SLA', duration: 3000 },
		{ value: 500, suffix: 'k+', label: 'Data Points/Sec', duration: 3500 }
	];
	
	const counters = stats.map(stat => tweened(0, {
		duration: stat.duration,
		easing: cubicOut
	}));
	
	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !visible) {
					visible = true;
					stats.forEach((stat, i) => {
						counters[i].set(stat.value);
					});
				}
			},
			{ threshold: 0.5 }
		);
		
		const element = document.getElementById('animated-stats');
		if (element) observer.observe(element);
		
		return () => observer.disconnect();
	});
</script>

<div id="animated-stats" class="mt-8 sm:mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
	{#each stats as stat, i}
		<div class="text-center lg:text-left">
			<div class="flex items-baseline justify-center lg:justify-start gap-0.5 sm:gap-1">
				<span class="text-2xl sm:text-3xl font-bold text-foreground">
					{Math.floor($counters[i])}
				</span>
				<span class="text-lg sm:text-xl font-semibold text-primary">
					{stat.suffix}
				</span>
			</div>
			<p class="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">{stat.label}</p>
		</div>
	{/each}
</div>