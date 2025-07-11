<script lang="ts">
	// Universities and institutions using QDesigner
	const organizations = [
		{ name: 'MIT', logo: '🎓' },
		{ name: 'Stanford', logo: '🏛️' },
		{ name: 'Harvard Medical', logo: '🏥' },
		{ name: 'Oxford Psychology', logo: '🧠' },
		{ name: 'Max Planck Institute', logo: '🔬' },
		{ name: 'Johns Hopkins', logo: '⚕️' },
		{ name: 'ETH Zurich', logo: '🎯' },
		{ name: 'Cambridge', logo: '📚' }
	];
	
	// Duplicate for seamless loop
	const duplicatedOrgs = [...organizations, ...organizations];
</script>

<section class="relative py-12 overflow-hidden border-y border-border bg-muted/30">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<p class="text-center text-sm font-medium text-muted-foreground mb-8">
			TRUSTED BY LEADING RESEARCH INSTITUTIONS WORLDWIDE
		</p>
		
		<!-- Marquee Container -->
		<div class="relative">
			<!-- Gradient Masks -->
			<div class="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10"></div>
			<div class="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10"></div>
			
			<!-- Scrolling Logos -->
			<div class="flex overflow-hidden">
				<div class="flex animate-marquee">
					{#each duplicatedOrgs as org}
						<div class="flex items-center justify-center px-8 py-4 mx-4 min-w-[200px]">
							<div class="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
								<span class="text-3xl">{org.logo}</span>
								<span class="text-lg font-semibold text-foreground/80">{org.name}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
		
		<!-- Stats -->
		<div class="mt-6 sm:mt-8 flex flex-wrap justify-center items-center gap-4 sm:gap-6 lg:gap-8 text-center">
			<div class="min-w-[80px]">
				<p class="text-xl sm:text-2xl font-bold text-foreground">500+</p>
				<p class="text-xs sm:text-sm text-muted-foreground">Research Teams</p>
			</div>
			<div class="hidden sm:block w-px h-8 sm:h-12 bg-border"></div>
			<div class="min-w-[80px]">
				<p class="text-xl sm:text-2xl font-bold text-foreground">2M+</p>
				<p class="text-xs sm:text-sm text-muted-foreground">Responses Collected</p>
			</div>
			<div class="hidden sm:block w-px h-8 sm:h-12 bg-border"></div>
			<div class="min-w-[80px]">
				<p class="text-xl sm:text-2xl font-bold text-foreground">50+</p>
				<p class="text-xs sm:text-sm text-muted-foreground">Countries</p>
			</div>
		</div>
	</div>
</section>

<style>
	@keyframes marquee {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-50%);
		}
	}
	
	.animate-marquee {
		animation: marquee 30s linear infinite;
	}
	
	.animate-marquee:hover {
		animation-play-state: paused;
	}
</style>