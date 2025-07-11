<script lang="ts">
	import { onMount } from 'svelte';
	
	let showVideo = $state(false);
	let videoRef: HTMLVideoElement;
	
	onMount(() => {
		// Preload video
		if (videoRef) {
			videoRef.load();
		}
	});
	
	function handlePlayVideo() {
		showVideo = true;
		if (videoRef) {
			videoRef.play();
		}
	}
</script>

<div class="relative">
	<!-- Browser Mockup -->
	<div class="relative mx-auto max-w-2xl">
		<div class="relative overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
			<!-- Browser Chrome -->
			<div class="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
				<div class="flex gap-2">
					<div class="h-3 w-3 rounded-full bg-red-500" />
					<div class="h-3 w-3 rounded-full bg-yellow-500" />
					<div class="h-3 w-3 rounded-full bg-green-500" />
				</div>
				<div class="flex-1 mx-4">
					<div class="bg-background/50 rounded-md px-3 py-1 text-xs text-muted-foreground">
						app.qdesigner.com/designer
					</div>
				</div>
			</div>
			
			<!-- Content Area -->
			<div class="relative aspect-video bg-gradient-to-br from-muted/20 to-muted/10">
				{#if !showVideo}
					<!-- Placeholder with Play Button -->
					<div class="absolute inset-0 flex items-center justify-center">
						<button
							onclick={handlePlayVideo}
							class="group relative"
							aria-label="Play demo video"
						>
							<div class="absolute inset-0 bg-primary/20 rounded-full blur-xl group-hover:bg-primary/30 transition-colors" />
							<div class="relative flex items-center justify-center w-20 h-20 bg-primary rounded-full shadow-lg group-hover:scale-110 transition-transform">
								<svg class="w-8 h-8 text-primary-foreground ml-1" fill="currentColor" viewBox="0 0 24 24">
									<path d="M8 5v14l11-7z" />
								</svg>
							</div>
						</button>
					</div>
					
					<!-- Preview Image -->
					<div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10">
						<div class="absolute inset-0 flex items-center justify-center p-8">
							<div class="text-center">
								<div class="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
									<svg class="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
									</svg>
								</div>
								<h3 class="text-lg font-semibold mb-2">Visual Questionnaire Designer</h3>
								<p class="text-sm text-muted-foreground max-w-sm">
									Drag-and-drop interface with real-time preview and advanced scripting
								</p>
							</div>
						</div>
					</div>
				{:else}
					<!-- Video Player -->
					<video
						bind:this={videoRef}
						class="absolute inset-0 w-full h-full object-cover"
						controls
						playsinline
						poster="/demo-poster.jpg"
					>
						<source src="/demo-video.mp4" type="video/mp4" />
						<source src="/demo-video.webm" type="video/webm" />
						Your browser does not support the video tag.
					</video>
				{/if}
			</div>
		</div>
		
		<!-- Decorative Elements -->
		<div class="absolute -top-4 -right-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
		<div class="absolute -bottom-4 -left-4 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />
	</div>
	
	<!-- Feature Pills -->
	<div class="mt-8 flex flex-wrap justify-center gap-3">
		{#each ['WYSIWYG Editor', 'Real-time Preview', 'Version Control', 'Collaboration'] as feature}
			<span class="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 backdrop-blur-sm border border-border rounded-full text-sm">
				<svg class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				{feature}
			</span>
		{/each}
	</div>
</div>