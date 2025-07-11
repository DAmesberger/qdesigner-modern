<script lang="ts">
	import HeroSection from '$lib/features/marketing/components/hero/HeroSection.svelte';
	import SocialProofBar from '$lib/features/marketing/components/social-proof/SocialProofBar.svelte';
	import FeatureBento from '$lib/features/marketing/components/features/FeatureBento.svelte';
	import PerformanceMetrics from '$lib/features/marketing/components/features/PerformanceMetrics.svelte';
	import InteractiveDemo from '$lib/features/marketing/components/demo/InteractiveDemo.svelte';
	import IntegrationEcosystem from '$lib/features/marketing/components/features/IntegrationEcosystem.svelte';
	import TestimonialSection from '$lib/features/marketing/components/social-proof/TestimonialSection.svelte';
	import PricingSection from '$lib/features/marketing/components/pricing/PricingSection.svelte';
	import CTASection from '$lib/features/marketing/components/cta/CTASection.svelte';
</script>

<svelte:head>
	<title>QDesigner - Modern Questionnaire Platform for Research</title>
	<meta name="description" content="High-performance questionnaire platform with microsecond-accurate reaction time measurements and WebGL 2.0 rendering for psychological and behavioral research." />
</svelte:head>

<div class="relative">
	<!-- Hero Section -->
	<HeroSection />

	<!-- Social Proof Bar -->
	<SocialProofBar />

	<!-- Feature Showcase -->
	<FeatureBento />

	<!-- Performance Metrics -->
	<PerformanceMetrics />

	<!-- Interactive Demo -->
	<InteractiveDemo />

	<!-- Integration Ecosystem -->
	<IntegrationEcosystem />

	<!-- Testimonials -->
	<TestimonialSection />

	<!-- Pricing -->
	<PricingSection />

	<!-- CTA Section -->
	<CTASection />
</div>