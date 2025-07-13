<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import WelcomeScreen from '$lib/fillout/components/WelcomeScreen.svelte';
	import ConsentScreen from '$lib/fillout/components/ConsentScreen.svelte';
	import CompletionScreen from '$lib/fillout/components/CompletionScreen.svelte';
	import { FilloutRuntime } from '$lib/fillout/runtime/FilloutRuntime';
	import { WebGLRenderer } from '$lib/renderer/WebGLRenderer';
	import type { QuestionnaireDefinition } from '$lib/types/questionnaire';
	import { QuestionnaireAccessService } from '$lib/fillout/services/QuestionnaireAccessService';

	export let data: PageData;

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let runtime: FilloutRuntime | null = null;
	let renderer: WebGLRenderer | null = null;
	let loading = $state(false);
	let loadingMessage = $state('Loading questionnaire...');
	let loadingProgress = $state(0);
	let error = $state<string | null>(null);
	let currentScreen = $state<'welcome' | 'consent' | 'runtime' | 'complete'>('welcome');
	let session = $state<any>(null);
	let completedSession = $state<any>(null);

	// Initialize on mount
	onMount(async () => {
		// If we have an existing session, skip welcome/consent
		if (data.existingSession) {
			session = data.existingSession;
			if (session.status === 'in_progress') {
				currentScreen = 'runtime';
				await initializeRuntime();
			}
		} else if (data.questionnaire.definition.settings?.requireConsent === false) {
			// Skip consent if not required
			currentScreen = 'welcome';
		}

		// Cleanup on unmount
		return () => {
			runtime?.dispose();
			renderer?.dispose();
			document.body.classList.remove('fillout');
		};
	});

	async function handleStart() {
		if (data.questionnaire.definition.settings?.requireConsent) {
			currentScreen = 'consent';
		} else {
			await createSessionAndStart();
		}
	}

	async function handleConsent(consentData: any) {
		// Store consent data
		await createSessionAndStart(consentData);
	}

	async function handleDeclineConsent() {
		goto('/');
	}

	async function createSessionAndStart(consentData?: any) {
		try {
			loading = true;
			
			// Create or resume session
			const { session: newSession } = await QuestionnaireAccessService.createOrResumeSession(
				data.questionnaire.id,
				data.participantId || undefined,
				data.existingSession?.id
			);
			
			session = newSession;
			
			// TODO: Store consent if provided
			if (consentData) {
				// await storeConsent(session.id, consentData);
			}
			
			currentScreen = 'runtime';
			await initializeRuntime();
		} catch (err) {
			console.error('Failed to create session:', err);
			error = err instanceof Error ? err.message : 'Failed to start questionnaire';
		} finally {
			loading = false;
		}
	}

	async function initializeRuntime() {
		if (!canvas) return;
		
		try {
			loading = true;
			loadingMessage = 'Initializing WebGL...';
			
			// Initialize WebGL renderer
			renderer = new WebGLRenderer({ canvas });
			await renderer.initialize();

			loadingMessage = 'Loading questionnaire...';
			
			// Initialize runtime with persistence
			runtime = new FilloutRuntime({
				canvas,
				questionnaire: data.questionnaire.definition,
				sessionId: session.id,
				participantId: data.participantId || undefined,
				enableOfflineSync: true,
				onComplete: async (completed) => {
					completedSession = completed;
					currentScreen = 'complete';
				},
				onSessionUpdate: (progress) => {
					// First 50% is media loading, last 50% is questionnaire progress
					if (loading) {
						loadingProgress = progress;
						loadingMessage = `Loading media resources... ${Math.round(progress * 2)}%`;
					} else {
						console.log(`Progress: ${progress}%`);
					}
				}
			});
			
			loadingMessage = 'Starting questionnaire...';
			await runtime.start();
			loading = false;
		} catch (err) {
			console.error('Failed to initialize runtime:', err);
			loading = false;
			
			// Format error message for media loading failures
			let errorMessage = err instanceof Error ? err.message : 'Failed to start questionnaire';
			if (errorMessage.includes('Failed to preload')) {
				errorMessage = `Unable to load required media files:\n${errorMessage}`;
			}
			error = errorMessage;
		}
	}

	// Handle keyboard events
	function handleKeyDown(event: KeyboardEvent) {
		runtime?.handleKeyPress(event);
	}

	// Handle resize
	function handleResize() {
		if (renderer && canvas) {
			renderer.resize(window.innerWidth, window.innerHeight);
		}
	}
</script>

<svelte:window on:keydown={handleKeyDown} on:resize={handleResize} />

<div class="fillout-page" bind:this={container}>
	{#if error}
		<div class="error-container">
			<EmptyState 
				title="Unable to load questionnaire" 
				description={error}
				action={{
					label: 'Go back',
					onClick: () => goto('/')
				}}
			/>
		</div>
	{:else if loading}
		<div class="loading-container">
			<Spinner size="lg" />
			<p class="loading-text">{loadingMessage}</p>
			{#if loadingProgress > 0}
				<div class="loading-progress">
					<div class="progress-bar" style="width: {loadingProgress}%"></div>
				</div>
			{/if}
		</div>
	{:else if currentScreen === 'welcome'}
		<WelcomeScreen
			questionnaire={data.questionnaire.definition}
			projectName={data.questionnaire.projectName}
			onStart={handleStart}
		/>
	{:else if currentScreen === 'consent'}
		<ConsentScreen
			content={data.questionnaire.definition.consent?.content || ''}
			checkboxes={data.questionnaire.definition.consent?.checkboxes}
			requireSignature={data.questionnaire.definition.consent?.requireSignature}
			onAccept={handleConsent}
			onDecline={handleDeclineConsent}
		/>
	{:else if currentScreen === 'runtime'}
		<canvas
			bind:this={canvas}
			class="fillout-canvas"
			width={window.innerWidth}
			height={window.innerHeight}
		/>
		
		<!-- HTML overlay for form inputs -->
		<div class="html-overlay">
			<!-- Dynamic HTML content will be rendered here -->
		</div>
	{:else if currentScreen === 'complete'}
		<CompletionScreen
			session={completedSession}
			customMessage={data.questionnaire.definition.completionMessage}
			showStatistics={true}
			onClose={() => goto('/')}
		/>
	{/if}
</div>

<style>
	.fillout-page {
		width: 100vw;
		height: 100vh;
		position: relative;
		overflow: hidden;
		background: var(--background);
	}

	.loading-container,
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 1rem;
	}

	.loading-text {
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.loading-progress {
		width: 200px;
		height: 4px;
		background: var(--muted);
		border-radius: 2px;
		overflow: hidden;
		margin-top: 0.5rem;
	}

	.progress-bar {
		height: 100%;
		background: var(--primary);
		transition: width 0.3s ease;
	}

	.fillout-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		touch-action: none;
	}

	.html-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.html-overlay :global(*) {
		pointer-events: auto;
	}
</style>