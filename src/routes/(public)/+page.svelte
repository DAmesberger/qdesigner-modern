<script lang="ts">
	import HeroSection from '$lib/components/marketing/hero/HeroSection.svelte';
	import SocialProofBar from '$lib/components/marketing/social-proof/SocialProofBar.svelte';
	import FeatureBento from '$lib/components/marketing/features/FeatureBento.svelte';
	import PerformanceMetrics from '$lib/components/marketing/features/PerformanceMetrics.svelte';
	import InteractiveDemo from '$lib/components/marketing/demo/InteractiveDemo.svelte';
	import IntegrationEcosystem from '$lib/components/marketing/features/IntegrationEcosystem.svelte';
	import TestimonialSection from '$lib/components/marketing/social-proof/TestimonialSection.svelte';
	import PricingSection from '$lib/components/marketing/pricing/PricingSection.svelte';
	import CTASection from '$lib/components/marketing/cta/CTASection.svelte';
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