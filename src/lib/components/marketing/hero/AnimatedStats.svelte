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
	] as const;
	
	// Create individual counter stores
	const counter0 = tweened(0, { duration: stats[0].duration, easing: cubicOut });
	const counter1 = tweened(0, { duration: stats[1].duration, easing: cubicOut });
	const counter2 = tweened(0, { duration: stats[2].duration, easing: cubicOut });
	const counter3 = tweened(0, { duration: stats[3].duration, easing: cubicOut });
	
	const counters = [counter0, counter1, counter2, counter3];
	
	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !visible) {
					visible = true;
					stats.forEach((stat, i) => {
						if (counters[i]) {
							counters[i].set(stat.value);
						}
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
					{#if i === 0}{Math.floor($counter0)}
					{:else if i === 1}{Math.floor($counter1)}
					{:else if i === 2}{Math.floor($counter2)}
					{:else if i === 3}{Math.floor($counter3)}
					{/if}
				</span>
				<span class="text-lg sm:text-xl font-semibold text-primary">
					{stat.suffix}
				</span>
			</div>
			<p class="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">{stat.label}</p>
		</div>
	{/each}
</div>