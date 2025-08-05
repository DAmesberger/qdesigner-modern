<script lang="ts">
	import { page } from '$app/stores';
	import { fade, fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/common/Button.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { supabase } from '$lib/services/supabase';
	
	interface Props {
		scrollY?: number;
	}

	let { scrollY = 0 }: Props = $props();

	let isMenuOpen = $state(false);
	let showProductMenu = $state(false);
	let showResourcesMenu = $state(false);
	let showUserMenu = $state(false);
	let user = $state<any>(null);

	const isScrolled = $derived(scrollY > 20);
	
	onMount(() => {
		// Check for authenticated user
		supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
			user = currentUser;
		});
		
		// Listen for auth changes
		const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
			user = session?.user ?? null;
		});
		
		// Click outside handler
		const handleClickOutside = (event: MouseEvent) => {
			if (showUserMenu && !(event.target as Element).closest('[role="menu"]') && 
				!(event.target as Element).closest('button[aria-label="User menu"]')) {
				showUserMenu = false;
			}
			if (showProductMenu && !(event.target as Element).closest('.product-menu')) {
				showProductMenu = false;
			}
			if (showResourcesMenu && !(event.target as Element).closest('.resources-menu')) {
				showResourcesMenu = false;
			}
		};
		
		document.addEventListener('click', handleClickOutside);
		
		return () => {
			subscription.unsubscribe();
			document.removeEventListener('click', handleClickOutside);
		};
	});
	
	async function handleSignOut() {
		await supabase.auth.signOut();
		await goto('/');
	}

	const navigation = {
		product: [
			{ name: 'Features', href: '/features', description: 'Powerful tools for research' },
			{ name: 'Designer', href: '/features#designer', description: 'Visual questionnaire builder' },
			{ name: 'Analytics', href: '/features#analytics', description: 'Real-time insights' },
			{ name: 'Integrations', href: '/features#integrations', description: 'Connect your tools' }
		],
		solutions: [
			{ name: 'Research', href: '/solutions/research' },
			{ name: 'Education', href: '/solutions/education' },
			{ name: 'Healthcare', href: '/solutions/healthcare' }
		],
		resources: [
			{ name: 'Documentation', href: '/resources/docs' },
			{ name: 'API Reference', href: '/resources/api-docs' },
			{ name: 'Blog', href: '/resources/blog' },
			{ name: 'Templates', href: '/resources/templates' }
		],
		company: [
			{ name: 'About', href: '/company/about' },
			{ name: 'Careers', href: '/company/careers' },
			{ name: 'Contact', href: '/company/contact' }
		]
	};
</script>

<header
	class="fixed top-0 w-full z-40 transition-all duration-300 {isScrolled
		? 'bg-background/80 backdrop-blur-xl border-b border-border shadow-sm'
		: 'bg-transparent'}"
>
	<nav class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-16 lg:h-20">
			<!-- Logo -->
			<div class="flex-shrink-0 flex items-center">
				<a href="/" class="flex items-center gap-2 group">
					<div class="relative">
						<div class="absolute inset-0 bg-gradient-to-r from-primary to-primary-foreground blur-lg opacity-75 group-hover:opacity-100 transition-opacity"></div>
						<svg
							class="relative w-8 h-8 text-primary"
							viewBox="0 0 32 32"
							fill="currentColor"
						>
							<path d="M16 2L2 9v14l14 7 14-7V9L16 2zm0 4l8 4v8l-8 4-8-4V10l8-4z" />
						</svg>
					</div>
					<span class="font-bold text-xl bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
						QDesigner
					</span>
				</a>
			</div>

			<!-- Desktop Navigation -->
			<div class="hidden lg:flex lg:items-center lg:gap-8">
				<!-- Product Dropdown -->
				<div class="relative">
					<button
						class="flex items-center gap-1 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors py-2"
						onmouseenter={() => (showProductMenu = true)}
						onmouseleave={() => (showProductMenu = false)}
					>
						Product
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					
					{#if showProductMenu}
						<div
							class="absolute top-full -left-4 pt-2 product-menu"
							onmouseenter={() => (showProductMenu = true)}
							onmouseleave={() => (showProductMenu = false)}
							transition:fly={{ y: -10, duration: 200 }}
							role="region"
						>
							<div class="bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-xl p-4 min-w-[280px]">
								{#each navigation.product as item}
									<a
										href={item.href}
										class="block px-4 py-3 rounded-lg hover:bg-muted transition-colors"
									>
										<div class="font-medium text-foreground">{item.name}</div>
										<div class="text-sm text-muted-foreground mt-1">{item.description}</div>
									</a>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Solutions -->
				<a href="/solutions" class="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
					Solutions
				</a>

				<!-- Pricing -->
				<a href="/pricing" class="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
					Pricing
				</a>

				<!-- Resources Dropdown -->
				<div class="relative">
					<button
						class="flex items-center gap-1 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors py-2"
						onmouseenter={() => (showResourcesMenu = true)}
						onmouseleave={() => (showResourcesMenu = false)}
					>
						Resources
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					
					{#if showResourcesMenu}
						<div
							class="absolute top-full -left-4 pt-2 resources-menu"
							onmouseenter={() => (showResourcesMenu = true)}
							onmouseleave={() => (showResourcesMenu = false)}
							transition:fly={{ y: -10, duration: 200 }}
							role="region"
						>
							<div class="bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-xl p-2 min-w-[200px]">
								{#each navigation.resources as item}
									<a
										href={item.href}
										class="block px-4 py-2 rounded-lg hover:bg-muted transition-colors text-sm"
									>
										{item.name}
									</a>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Company -->
				<a href="/company/about" class="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
					Company
				</a>
			</div>

			<!-- CTA Buttons -->
			<div class="hidden lg:flex lg:items-center lg:gap-4">
				<ThemeToggle />
				
				{#if user}
					<!-- User Menu -->
					<div class="relative">
						<button
							onclick={() => (showUserMenu = !showUserMenu)}
							class="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
							aria-label="User menu"
						>
							<div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
								<span class="text-primary font-semibold">
									{user.email?.[0].toUpperCase() || 'U'}
								</span>
							</div>
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						
						{#if showUserMenu}
							<div
								class="absolute right-0 mt-2 w-48 bg-background border border-border rounded-lg shadow-lg py-1 z-50"
								transition:fly={{ y: -10, duration: 200 }}
								role="menu"
								tabindex="-1"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => e.key === 'Escape' && (showUserMenu = false)}
							>
								<div class="px-4 py-2 border-b border-border">
									<p class="text-sm font-medium text-foreground">{user.email}</p>
								</div>
								<a
									href="/dashboard"
									class="block px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
								>
									Dashboard
								</a>
								<div class="border-t border-border mt-1 pt-1">
									<button
										onclick={handleSignOut}
										class="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
									>
										Sign out
									</button>
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<a
						href="/login"
						class="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
					>
						Sign in
					</a>
					<a
						href="/signup"
						class="relative inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5"
					>
						<span class="relative z-10">Start Free Trial</span>
						<div class="absolute inset-0 bg-gradient-to-r from-primary to-primary-foreground rounded-lg opacity-0 hover:opacity-100 transition-opacity"></div>
					</a>
				{/if}
			</div>

			<!-- Mobile menu button -->
			<button
				type="button"
				class="lg:hidden inline-flex items-center justify-center p-2 rounded-md text-foreground hover:bg-muted"
				onclick={() => (isMenuOpen = !isMenuOpen)}
			>
				<svg
					class="w-6 h-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					{#if isMenuOpen}
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					{:else}
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
					{/if}
				</svg>
			</button>
		</div>

		<!-- Mobile menu -->
		{#if isMenuOpen}
			<div
				class="lg:hidden bg-background/95 backdrop-blur-xl border-t border-border"
				transition:fly={{ y: -10, duration: 200 }}
			>
				<div class="px-2 pt-2 pb-3 space-y-1">
					<a href="/features" class="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md">
						Features
					</a>
					<a href="/solutions" class="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md">
						Solutions
					</a>
					<a href="/pricing" class="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md">
						Pricing
					</a>
					<a href="/resources" class="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md">
						Resources
					</a>
					<a href="/company/about" class="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md">
						Company
					</a>
				</div>
				<div class="pt-4 pb-3 border-t border-border">
					<div class="px-3 space-y-2">
						<div class="flex items-center justify-between px-3 py-2">
							<span class="text-sm font-medium text-foreground">Theme</span>
							<ThemeToggle />
						</div>
						
						{#if user}
							<div class="border-t border-border pt-2">
								<div class="px-3 py-2">
									<p class="text-sm font-medium text-foreground">{user.email}</p>
								</div>
								<a
									href="/dashboard"
									class="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
								>
									Dashboard
								</a>
								<button
									onclick={handleSignOut}
									class="block w-full text-left px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
								>
									Sign out
								</button>
							</div>
						{:else}
							<a
								href="/login"
								class="block w-full text-center px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
							>
								Sign in
							</a>
							<a
								href="/signup"
								class="block w-full text-center px-3 py-2 text-base font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md"
							>
								Start Free Trial
							</a>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</nav>
</header>