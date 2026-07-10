<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Question } from '$lib/shared';
  import type { MediaAsset } from '$lib/shared/types/media';
  import MediaManagerModal from '$lib/components/designer/MediaManagerModal.svelte';
  import BlockEditor from '$lib/components/designer/reaction/BlockEditor.svelte';
  import TaskPresetFields from './designer/TaskPresetFields.svelte';
  import StandardParadigmFields from './designer/StandardParadigmFields.svelte';
  import CounterbalancingFields from './designer/CounterbalancingFields.svelte';
  import ResponseSetEditor from './designer/ResponseSetEditor.svelte';
  import { mediaService } from '$lib/services/mediaService';
  import { createLegacyStarterPayload } from './model/starter-templates';
  import { normalizeReactionQuestionConfig } from './model/reaction-normalize';
  import { isTimingSpec, type TimingSpec } from '$lib/runtime/reaction';

  // Compact one-line summary of an authored phase duration (ADR 0025): a fixed
  // ms value, or a jittered "lo–hi" range.
  function formatTiming(spec: TimingSpec): string {
    return isTimingSpec(spec) ? `${spec.min}–${spec.max}` : `${spec}`;
  }
  import type { ReactionFeedbackSettings } from './model/reaction-schema';
  import type {
    ReactionTaskType,
    ResponseMode,
    ReactionTimeConfig,
  } from './model/designer-config';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    question: Question & { config: ReactionTimeConfig };
    organizationId?: string;
    userId?: string;
    /**
     * F-51(A) / F-52: notify the designer store of a config edit. The `question`
     * prop is a one-way `$derived` value from the store; mutating it directly
     * triggers `ownership_invalid_mutation`. This component instead OWNS a local
     * `$state` working copy (seeded from the prop), binds every sub-editor into
     * THAT, and reflects each settled edit through this callback so the store
     * marks the questionnaire dirty and schedules the save.
     */
    onUpdate?: (updates: { config: ReactionTimeConfig }) => void;
  }

  let {
    question: incomingQuestion,
    organizationId = '',
    userId = '',
    onUpdate,
  }: Props = $props();

  // F-52 (ownership): this component OWNS its editing state. `incomingQuestion` is
  // a one-way value from the designer store — mutating it directly would trip
  // `ownership_invalid_mutation` throughout the sub-editor subtree. We seed a
  // local `$state` working copy from it and bind every sub-editor into this
  // (owned) object; settled changes flow back to the store via `onUpdate` only.
  // `{#key questionItem.id}` in the properties panel remounts this component per
  // question, so one instance only ever edits one question.
  let question = $state<Question & { config: ReactionTimeConfig }>(
    createWorkingQuestion(incomingQuestion)
  );

  function createWorkingQuestion(
    src: Question & { config?: unknown }
  ): Question & { config: ReactionTimeConfig } {
    const snapshot = $state.snapshot(src) as Question;
    return { ...snapshot, config: createDesignerConfig(src?.config) } as Question & {
      config: ReactionTimeConfig;
    };
  }

  // E-REACT-4: feedback-shape editor state, mirrored back into the (owned)
  // question config. `question.config` is always fully-formed here
  // (createDesignerConfig normalizes it), so reading `feedbackSettings` off it is
  // guarded — fixes the `feedbackSettings of undefined` TypeError (F-52 E).
  let feedbackSettings = $state<ReactionFeedbackSettings>(
    question.config.feedbackSettings ?? { mode: 'accuracy', durationMs: 800 }
  );
  $effect(() => {
    question.config.feedbackSettings = feedbackSettings;
  });

  // Key presets
  const keyPresets = [
    { name: 'F/J', keys: ['f', 'j'] },
    { name: 'Left/Right', keys: ['ArrowLeft', 'ArrowRight'] },
    { name: 'A/L', keys: ['a', 'l'] },
    { name: 'Z/X', keys: ['z', 'x'] },
    { name: 'Space', keys: [' '] },
    { name: '1/2', keys: ['1', '2'] },
  ];

  // Timing presets
  const timingPresets = [
    { name: 'Fast', fixation: 300, timeout: 1500 },
    { name: 'Standard', fixation: 500, timeout: 2000 },
    { name: 'Slow', fixation: 1000, timeout: 3000 },
    { name: 'Very Slow', fixation: 1500, timeout: 5000 },
  ];

  let newKey = $state('');
  let selectedKeyPreset = $state('');
  let selectedTimingPreset = $state('');
  let lastObservedTaskType = $state<ReactionTaskType | null>(null);

  // Media picker state
  let showMediaPicker = $state(false);
  let showExternalMediaUrl = $state(false);
  let mediaThumbnailUrl = $state<string | null>(null);

  // Response-mode + gamepad press-to-bind state (E-REACT-1).
  let gamepadBindValue = $state('');
  let gamepadListening = $state(false);
  let gamepadListenError = $state<string | null>(null);
  let gamepadRafHandle: number | null = null;

  const responseModes: Array<{ value: ResponseMode; label: string }> = [
    { value: 'keyboard', label: 'Keyboard (key press)' },
    { value: 'mouse', label: 'Mouse (spatial click)' },
    { value: 'touch', label: 'Touch (spatial tap)' },
    { value: 'gamepad', label: 'Gamepad (button box)' },
  ];

  function stopGamepadListening() {
    gamepadListening = false;
    if (gamepadRafHandle != null) {
      cancelAnimationFrame(gamepadRafHandle);
      gamepadRafHandle = null;
    }
  }

  function bindGamepadButton(index: number, value: string) {
    const map = { ...(question.config.response.gamepadButtonMap ?? {}) };
    map[index] = value;
    question.config.response.gamepadButtonMap = map;
  }

  function removeGamepadBinding(index: number) {
    const map = { ...(question.config.response.gamepadButtonMap ?? {}) };
    delete map[index];
    question.config.response.gamepadButtonMap = Object.keys(map).length > 0 ? map : undefined;
  }

  function startGamepadListening() {
    const value = gamepadBindValue.trim();
    if (!value) {
      gamepadListenError = 'Enter a response value first (e.g. "go").';
      return;
    }
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      gamepadListenError = 'Gamepad API is unavailable in this browser.';
      return;
    }
    gamepadListenError = null;
    gamepadListening = true;

    const poll = () => {
      if (!gamepadListening) return;
      for (const gamepad of navigator.getGamepads()) {
        if (!gamepad) continue;
        for (let index = 0; index < gamepad.buttons.length; index++) {
          if (gamepad.buttons[index]?.pressed) {
            bindGamepadButton(index, value);
            gamepadBindValue = '';
            stopGamepadListening();
            return;
          }
        }
      }
      gamepadRafHandle = requestAnimationFrame(poll);
    };
    gamepadRafHandle = requestAnimationFrame(poll);
  }

  // Tear down any in-flight gamepad listen loop on unmount.
  $effect(() => () => stopGamepadListening());

  function toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  function createDesignerConfig(source: unknown): ReactionTimeConfig {
    const sourceRecord = toRecord(source);
    const normalized = normalizeReactionQuestionConfig({ config: sourceRecord });
    const prompt =
      typeof sourceRecord.prompt === 'string' && sourceRecord.prompt.trim().length > 0
        ? sourceRecord.prompt
        : 'Reaction Time Task';

    const config: ReactionTimeConfig = {
      task: normalized.task as ReactionTimeConfig['task'],
      stimulus: normalized.stimulus as ReactionTimeConfig['stimulus'],
      response: normalized.response,
      correctKey: normalized.correctKey,
      feedback: normalized.feedback,
      feedbackSettings: normalized.feedbackSettings,
      practice: normalized.practice,
      practiceTrials: normalized.practiceTrials,
      testTrials: normalized.testTrials,
      targetFPS: normalized.targetFPS,
      prompt,
    };

    // F-52 (single source of truth): the visual `study` (block plan) is authored
    // ONLY for the custom paradigm, where block editing IS the authoring. Every
    // procedural paradigm has NO `study` — its trials materialize from the
    // top-level config at compile/run time. This is also the migration path: a
    // procedural config loaded with a stale compiled `study` drops it here, so the
    // next save persists the single-source shape.
    if (normalized.task.type === 'custom') {
      config.study = normalized;
    }

    return config;
  }

  // Whether the current stimulus type uses media files
  let stimulusUsesMedia = $derived(
    question.config.stimulus?.type === 'image' ||
    question.config.stimulus?.type === 'video' ||
    question.config.stimulus?.type === 'audio'
  );

  // Load thumbnail URL for existing media reference
  $effect(() => {
    const mediaRef = question.config.stimulus?.mediaRef;
    if (mediaRef?.mediaId) {
      mediaService.getSignedUrl(mediaRef.mediaId).then((url) => {
        mediaThumbnailUrl = url;
        // Also keep the mediaUrl fresh in case it expired
        if (question.config.stimulus.mediaRef) {
          question.config.stimulus.mediaRef.mediaUrl = url;
        }
      }).catch(() => {
        mediaThumbnailUrl = null;
      });
    } else {
      mediaThumbnailUrl = null;
    }
  });

  function handleMediaSelected(event: { media: MediaAsset[]; asset: MediaAsset }) {
    const asset = event.asset;
    if (!asset) return;

    // Get signed URL for the media
    mediaService.getSignedUrl(asset.id).then((url) => {
      // Store the media reference in the stimulus config
      question.config.stimulus.mediaRef = {
        mediaId: asset.id,
        mediaUrl: url,
        filename: asset.originalFilename,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        durationSeconds: asset.durationSeconds,
      };
      // Set the content to the URL for runtime consumption
      question.config.stimulus.content = url;
      mediaThumbnailUrl = url;
      showExternalMediaUrl = false;
    }).catch((error) => {
      console.error('Failed to get signed URL for media:', error);
    });
  }

  function removeMediaSelection() {
    question.config.stimulus.mediaRef = undefined;
    question.config.stimulus.content = '';
    mediaThumbnailUrl = null;
    showExternalMediaUrl = false;
  }

  function handleStimulusTypeChange() {
    // Clear media ref when switching stimulus types
    const type = question.config.stimulus.type;
    if (type !== 'image' && type !== 'video' && type !== 'audio') {
      question.config.stimulus.mediaRef = undefined;
      mediaThumbnailUrl = null;
    }
    // Reset content for non-media types
    if (type === 'text') {
      question.config.stimulus.content = question.config.stimulus.content || 'GO!';
      showExternalMediaUrl = false;
    } else if (type === 'shape') {
      question.config.stimulus.content = 'circle';
      showExternalMediaUrl = false;
    } else if (!question.config.stimulus.mediaRef) {
      question.config.stimulus.content = '';
      showExternalMediaUrl = false;
    }
  }

  // F-52: no `ensureStudyBlocks` / study-sync / feedback-into-study effects. Those
  // eagerly compiled and persisted a frozen `study` snapshot for procedural
  // paradigms — the root of F-49/F-51/F-52. `study` now exists only for the custom
  // paradigm and is produced by `createDesignerConfig` (on mount and on paradigm
  // switch); procedural trials materialize from the top-level config at compile
  // time, so there is nothing to keep in sync.

  $effect(() => {
    const currentTaskType = question.config.task?.type || 'standard';

    if (lastObservedTaskType === null) {
      lastObservedTaskType = currentTaskType;
      return;
    }

    if (currentTaskType !== lastObservedTaskType) {
      applyTaskStarter();
      lastObservedTaskType = currentTaskType;
    }
  });

  function addKey() {
    if (!newKey) return;

    const key = newKey.toLowerCase();
    if (!question.config.response.validKeys.includes(key)) {
      question.config.response.validKeys = [...question.config.response.validKeys, key];
    }

    newKey = '';
  }

  function removeKey(key: string) {
    question.config.response.validKeys = question.config.response.validKeys.filter(
      (k) => k !== key
    );
  }

  function applyKeyPreset() {
    if (!selectedKeyPreset) return;

    const preset = keyPresets.find((p) => p.name === selectedKeyPreset);
    if (preset) {
      question.config.response.validKeys = [...preset.keys];
    }

    selectedKeyPreset = '';
  }

  function applyTimingPreset() {
    if (!selectedTimingPreset) return;

    const preset = timingPresets.find((p) => p.name === selectedTimingPreset);
    if (preset && question.config.stimulus.fixation) {
      question.config.stimulus.fixation.duration = preset.fixation;
      question.config.response.timeout = preset.timeout;
    }

    selectedTimingPreset = '';
  }


  function applyTaskStarter() {
    const taskType = question.config.task?.type || 'standard';
    const starter = createLegacyStarterPayload(taskType);
    question.config = createDesignerConfig({
      ...question.config,
      ...starter,
      prompt: question.config.prompt,
    });
  }

  // F-51(A): reflect every reaction-editor edit into the designer store so it
  // marks the questionnaire dirty and schedules autosave. The mount-time seed
  // + feedback effect mutate the owned config before the author touches anything,
  // so we arm the watcher only after mount has settled (onMount + a tick past the
  // initial effect flush) and capture that settled serialization as the baseline.
  // `{#key questionItem.id}` in the properties panel remounts this component per
  // question, so one instance only ever observes one question's edits.
  let syncBaseline: string | null = null;
  let syncArmed = $state(false);
  onMount(() => {
    void tick().then(() => {
      syncArmed = true;
    });
  });
  $effect(() => {
    const serialized = JSON.stringify(question.config);
    if (!syncArmed) {
      syncBaseline = serialized;
      return;
    }
    if (serialized === syncBaseline) return;
    syncBaseline = serialized;
    // F-52 (DataCloneError): send a plain, structured-cloneable clone — never a
    // $state proxy or a nested closure. The store persists the whole questionnaire
    // to IndexedDB via `structuredClone`, which throws `DataCloneError` on a
    // reactive proxy or function; `JSON.parse(JSON.stringify(...))` (reusing the
    // serialization we just computed) yields pure JSON data, which is exactly the
    // shape the config is stored as anyway.
    onUpdate?.({ config: JSON.parse(serialized) as ReactionTimeConfig });
  });
</script>

<div class="p-6 flex flex-col gap-6">
  <!-- Task Selection -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Paradigm</h4>

    <div class="mb-4">
      <label for="task-type">Paradigm</label>
      <Select id="task-type" bind:value={question.config.task.type}>
        <option value="standard">Standard Reaction Time</option>
        <option value="n-back">N-Back</option>
        <option value="stroop">Stroop</option>
        <option value="flanker">Flanker (Eriksen)</option>
        <option value="iat">Implicit Association Test (IAT)</option>
        <option value="dot-probe">Dot-Probe</option>
        <option value="go-nogo">Go / No-Go</option>
        <option value="sart">SART</option>
        <option value="simon">Simon</option>
        <option value="posner">Posner Cueing</option>
        <option value="visual-search">Visual Search</option>
        <option value="sternberg">Sternberg Memory Search</option>
        <option value="pvt">PVT (Psychomotor Vigilance)</option>
        <option value="temporal-order">Temporal-Order Judgment</option>
        <option value="rsvp">RSVP</option>
        <option value="custom">Custom Trial Plan</option>
      </Select>
      <Button variant="secondary" size="sm" class="mt-2" onclick={applyTaskStarter}>
        Reset Selected Paradigm To Starter
      </Button>
    </div>

    <TaskPresetFields bind:question />
    <StandardParadigmFields bind:question />


    {#if question.config.study}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Visual Trial Blocks</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          Build fully programmable reaction tasks with visual blocks and trial templates. No JSON is
          required.
        </p>
        <BlockEditor bind:blocks={question.config.study.blocks} />
      </div>

      <CounterbalancingFields bind:schemes={question.config.study.counterbalance} />
    {/if}
  </div>

  <!-- Stimulus Configuration -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Stimulus Settings</h4>

    <div class="mb-4">
      <label for="stimulus-type">Stimulus Type</label>
      <Select
        id="stimulus-type"
        bind:value={question.config.stimulus.type}
        onchange={handleStimulusTypeChange}
      >
        <option value="text">Text</option>
        <option value="shape">Shape</option>
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="audio">Audio</option>
      </Select>
    </div>

    {#if question.config.stimulus.type === 'shape'}
      <div class="mb-4">
        <label for="stimulus-content">Shape Type</label>
        <Select id="stimulus-content" bind:value={question.config.stimulus.content}>
          <option value="circle">Circle</option>
          <option value="square">Square</option>
        </Select>
      </div>
    {:else if question.config.stimulus.type === 'text'}
      <div class="mb-4">
        <label for="stimulus-content">Text to Display</label>
        <input
          id="stimulus-content"
          type="text"
          bind:value={question.config.stimulus.content}
          placeholder="GO!"
          class="input"
        />
      </div>
    {:else if stimulusUsesMedia}
      <!-- Media stimulus: Image, Video, or Audio -->
      <div class="mb-4">
        <span class="block mb-1.5 text-sm font-medium text-foreground">
          {question.config.stimulus.type === 'image' ? 'Image' : question.config.stimulus.type === 'video' ? 'Video' : 'Audio'} Stimulus
        </span>

        {#if question.config.stimulus.mediaRef}
          <!-- Media preview card -->
          <div class="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
            {#if question.config.stimulus.type === 'image' && mediaThumbnailUrl}
              <div class="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-border">
                <img
                  src={mediaThumbnailUrl}
                  alt={question.config.stimulus.mediaRef.filename || 'Stimulus image'}
                  class="w-full h-full object-cover"
                />
              </div>
            {:else if question.config.stimulus.type === 'video'}
              <div class="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-border flex items-center justify-center">
                <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            {:else if question.config.stimulus.type === 'audio'}
              <div class="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-border flex items-center justify-center">
                <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            {/if}

            <div class="flex-1 min-w-0 flex flex-col gap-0.5">
              <span class="text-sm font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">{question.config.stimulus.mediaRef.filename || 'Media file'}</span>
              {#if question.config.stimulus.mediaRef.mimeType}
                <span class="text-xs text-muted-foreground">{question.config.stimulus.mediaRef.mimeType}</span>
              {/if}
              {#if question.config.stimulus.mediaRef.width && question.config.stimulus.mediaRef.height}
                <span class="text-xs text-muted-foreground">{question.config.stimulus.mediaRef.width} x {question.config.stimulus.mediaRef.height}</span>
              {/if}
              {#if question.config.stimulus.mediaRef.durationSeconds}
                <span class="text-xs text-muted-foreground">{question.config.stimulus.mediaRef.durationSeconds.toFixed(1)}s</span>
              {/if}
            </div>

            <div class="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                onclick={() => (showMediaPicker = true)}
              >
                Replace
              </Button>
              <button class="remove-media-btn" onclick={removeMediaSelection} aria-label="Remove media">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        {:else}
          <!-- No media selected - show select button and explicit remote URL fallback -->
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onclick={() => (showMediaPicker = true)}
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Select from Media Library</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => (showExternalMediaUrl = !showExternalMediaUrl)}
              >
                {showExternalMediaUrl || question.config.stimulus.content ? 'Hide Remote URL' : 'Use Remote URL'}
              </Button>
            </div>

            {#if showExternalMediaUrl || question.config.stimulus.content}
              <div class="rounded-lg border border-dashed border-border bg-muted/40 p-3">
                <label for="stimulus-remote-url">Remote Asset URL</label>
                <input
                  id="stimulus-remote-url"
                  type="url"
                  bind:value={question.config.stimulus.content}
                  placeholder={question.config.stimulus.type === 'image'
                    ? 'https://example.com/image.png'
                    : question.config.stimulus.type === 'video'
                      ? 'https://example.com/video.mp4'
                      : 'https://example.com/audio.mp3'}
                  class="input mt-2"
                />
                <p class="mt-2 text-xs text-muted-foreground">
                  Use this only for externally hosted assets. Library media is preferred because
                  the signed source URL is managed for you.
                </p>
              </div>
            {:else}
              <p class="text-xs text-muted-foreground">
                Choose a file from the media library or provide a direct asset URL.
              </p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <div class="mt-4 pl-4">
      <h5 class="mb-2 text-sm font-medium text-muted-foreground">Fixation Settings</h5>

      {#if question.config.stimulus.fixation}
        <div class="mb-4">
          <label for="fixation-type">Fixation Type</label>
          <Select
            id="fixation-type"
            bind:value={question.config.stimulus.fixation.type}
          >
            <option value="cross">Cross (+)</option>
            <option value="dot">Dot (•)</option>
          </Select>
        </div>

        <div class="mb-4">
          <label for="fixation-duration">Fixation Duration (ms)</label>
          <input
            id="fixation-duration"
            type="number"
            bind:value={question.config.stimulus.fixation.duration}
            min="100"
            max="5000"
            step="100"
            class="input"
          />
        </div>
      {/if}
    </div>
  </div>

  <!-- Response Configuration -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Response Settings</h4>

    <div class="mb-4">
      <label for="response-mode">Response Device</label>
      <Select id="response-mode" bind:value={question.config.response.mode}>
        {#each responseModes as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </Select>
      <p class="mt-1 text-xs text-muted-foreground">
        Keyboard captures key presses; mouse/touch score a spatial click against a target region;
        gamepad captures button-box presses with frame-accurate timing.
      </p>
    </div>

    {#if question.config.response.mode === 'keyboard' || !question.config.response.mode}
    <div class="mb-4">
      <span class="block mb-1.5 text-sm font-medium text-foreground">Valid Response Keys</span>

      <!-- Key input -->
      <div class="flex gap-2 mb-2">
        <input
          type="text"
          bind:value={newKey}
          placeholder="Enter key (e.g., 'a', 'Enter')"
          class="input"
          onkeydown={(e) => e.key === 'Enter' && addKey()}
        />
        <Button variant="secondary" size="sm" onclick={addKey} disabled={!newKey}> Add Key </Button>
      </div>

      <!-- Key presets -->
      <div class="flex gap-2 mb-2">
        <Select bind:value={selectedKeyPreset} class="text-sm">
          <option value="">Select preset...</option>
          {#each keyPresets as preset}
            <option value={preset.name}>{preset.name}</option>
          {/each}
        </Select>
        <Button
          variant="secondary"
          size="xs"
          onclick={applyKeyPreset}
          disabled={!selectedKeyPreset}
        >
          Apply
        </Button>
      </div>

      <!-- Key list -->
      {#if question.config.response.validKeys.length}
        <div class="flex flex-wrap gap-2 mt-2">
          {#each question.config.response.validKeys as key}
            <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
              <span class="font-mono text-sm font-medium text-foreground">{key === ' ' ? 'SPACE' : key.toUpperCase()}</span>
              <button class="remove-btn" onclick={() => removeKey(key)} aria-label="Remove key">
                ✕
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="mb-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={question.config.response.captureKeyUp}
          class="w-4 h-4 cursor-pointer"
        />
        <span>Capture key release (records hold duration)</span>
      </label>
      <p class="mt-1 text-xs text-muted-foreground">
        For hold/release paradigms: the reaction time is measured from key-down, and the hold
        duration (down → up) is recorded alongside it.
      </p>
    </div>
    {/if}

    {#if question.config.response.mode === 'gamepad'}
    <div class="mb-4">
      <span class="block mb-1.5 text-sm font-medium text-foreground">Gamepad Button Mapping</span>
      <p class="mb-2 text-xs text-muted-foreground">
        Enter a response value, then press the physical button you want to bind. Connect a gamepad
        and press any button so the browser reports it.
      </p>
      <div class="flex gap-2 mb-2">
        <input
          type="text"
          bind:value={gamepadBindValue}
          placeholder="Response value (e.g. go)"
          class="input"
          disabled={gamepadListening}
        />
        {#if gamepadListening}
          <Button variant="secondary" size="sm" onclick={stopGamepadListening}>Cancel</Button>
        {:else}
          <Button variant="secondary" size="sm" onclick={startGamepadListening} disabled={!gamepadBindValue.trim()}>
            Press to Bind
          </Button>
        {/if}
      </div>
      {#if gamepadListening}
        <p class="text-xs text-primary">Listening… press a gamepad button now.</p>
      {/if}
      {#if gamepadListenError}
        <p class="text-xs text-destructive">{gamepadListenError}</p>
      {/if}
      <div class="flex flex-wrap gap-2 mt-2">
        {#each Object.entries(question.config.response.gamepadButtonMap ?? {}) as [index, value]}
          <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
            <span class="font-mono text-sm font-medium text-foreground">Button {index} → {value}</span>
            <button class="remove-btn" onclick={() => removeGamepadBinding(Number(index))} aria-label="Remove binding">✕</button>
          </div>
        {/each}
        {#if Object.keys(question.config.response.gamepadButtonMap ?? {}).length === 0}
          <span class="text-xs text-muted-foreground italic">No buttons mapped yet.</span>
        {/if}
      </div>
    </div>
    {/if}

    {#if question.config.response.mode === 'mouse' || question.config.response.mode === 'touch'}
    <div class="mb-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(question.config.response.targetRegion)}
          onchange={(e) => {
            question.config.response.targetRegion = e.currentTarget.checked
              ? (question.config.response.targetRegion ?? { x: 0.5, y: 0.5, radius: 0.15 })
              : undefined;
          }}
          class="w-4 h-4 cursor-pointer"
        />
        <span>Score clicks against a target region</span>
      </label>
      {#if question.config.response.targetRegion}
        <div class="grid grid-cols-3 gap-3 mt-2">
          <div>
            <label for="target-region-x">Center X (0–1)</label>
            <input
              id="target-region-x"
              type="number"
              min="0"
              max="1"
              step="0.01"
              bind:value={question.config.response.targetRegion.x}
              class="input"
            />
          </div>
          <div>
            <label for="target-region-y">Center Y (0–1)</label>
            <input
              id="target-region-y"
              type="number"
              min="0"
              max="1"
              step="0.01"
              bind:value={question.config.response.targetRegion.y}
              class="input"
            />
          </div>
          <div>
            <label for="target-region-radius">Radius (0–1)</label>
            <input
              id="target-region-radius"
              type="number"
              min="0.01"
              max="1"
              step="0.01"
              bind:value={question.config.response.targetRegion.radius}
              class="input"
            />
          </div>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">
          Coordinates are normalized to the stimulus canvas (0,0 = top-left, 1,1 = bottom-right), so
          scoring is viewport-independent.
        </p>
      {/if}
    </div>
    {/if}

    <div class="mb-4">
      <label for="response-timeout">Response Timeout (ms)</label>
      <input
        id="response-timeout"
        type="number"
        bind:value={question.config.response.timeout}
        min="500"
        max="10000"
        step="100"
        class="input"
      />
      <p class="mt-1 text-xs text-muted-foreground">Time allowed for participant to respond (0 = no timeout)</p>
    </div>

    <div class="mb-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={question.config.response.requireCorrect}
          class="w-4 h-4 cursor-pointer"
        />
        <span>Require correct response</span>
      </label>
    </div>

    {#if question.config.response.requireCorrect}
      <div class="mb-4">
        <label for="correct-key">Correct Response Key</label>
        <Select id="correct-key" bind:value={question.config.correctKey}>
          <option value="">Select correct key...</option>
          {#each question.config.response.validKeys as key}
            <option value={key}>{key === ' ' ? 'SPACE' : key.toUpperCase()}</option>
          {/each}
        </Select>
      </div>
    {/if}

    <ResponseSetEditor bind:question />
  </div>

  <!-- Trial Configuration -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Trial Configuration</h4>

    <div class="mb-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={question.config.practice} class="w-4 h-4 cursor-pointer" />
        <span>Include practice trials</span>
      </label>
    </div>

    {#if question.config.practice}
      <div class="mb-4">
        <label for="practice-trials">Number of Practice Trials</label>
        <input
          id="practice-trials"
          type="number"
          bind:value={question.config.practiceTrials}
          min="1"
          max="10"
          class="input"
        />
      </div>
    {/if}

    {#if question.config.task.type === 'standard' || question.config.task.type === 'custom'}
      <div class="mb-4">
        <label for="test-trials">Number of Test Trials</label>
        <input
          id="test-trials"
          type="number"
          bind:value={question.config.testTrials}
          min="1"
          max="100"
          class="input"
        />
      </div>
    {/if}

    <div class="mb-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={question.config.feedback} class="w-4 h-4 cursor-pointer" />
        <span>Show feedback after each response</span>
      </label>
    </div>

    {#if question.config.feedback}
      <div class="mb-4 rounded-lg border border-border bg-muted/40 p-3 space-y-3">
        <p class="text-xs text-muted-foreground">
          Feedback is shown briefly after each trial's response window. It is display-only and never
          contributes to scored reaction-time averages.
        </p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label for="feedback-mode">Feedback mode</label>
            <Select id="feedback-mode" bind:value={feedbackSettings.mode}>
              <option value="accuracy">Accuracy (Correct / Incorrect / Too slow)</option>
              <option value="rt">Reaction time (ms)</option>
              <option value="both">Both</option>
            </Select>
          </div>
          <div>
            <label for="feedback-duration">Feedback duration (ms)</label>
            <input
              id="feedback-duration"
              type="number"
              min="0"
              max="10000"
              step="50"
              bind:value={feedbackSettings.durationMs}
              class="input"
            />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label for="feedback-correct">Correct text</label>
            <input
              id="feedback-correct"
              type="text"
              placeholder="Correct"
              bind:value={feedbackSettings.correctText}
              class="input"
            />
          </div>
          <div>
            <label for="feedback-incorrect">Incorrect text</label>
            <input
              id="feedback-incorrect"
              type="text"
              placeholder="Incorrect"
              bind:value={feedbackSettings.incorrectText}
              class="input"
            />
          </div>
          <div>
            <label for="feedback-tooslow">Too-slow text</label>
            <input
              id="feedback-tooslow"
              type="text"
              placeholder="Too slow"
              bind:value={feedbackSettings.tooSlowText}
              class="input"
            />
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Performance Settings -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Performance Settings</h4>

    <div class="mb-4 rounded-lg border border-border bg-muted/40 p-3">
      <p class="text-sm font-medium text-foreground">Renderer</p>
      <p class="mt-1 text-xs text-muted-foreground">
        Stimuli render in the WebGL canvas runtime with explicit frame pacing. Use the target FPS
        control below to match the experiment device.
      </p>
    </div>

    <div class="mb-4">
      <label for="target-fps">Target FPS</label>
      <Select id="target-fps" bind:value={question.config.targetFPS}>
        <option value={30}>30 FPS</option>
        <option value={60}>60 FPS</option>
        <option value={120}>120 FPS</option>
        <option value={144}>144 FPS</option>
        <option value={240}>240 FPS</option>
      </Select>
      <p class="mt-1 text-xs text-muted-foreground">Higher FPS provides more precise timing measurements</p>
    </div>

    <!-- Timing presets -->
    <div class="mb-4">
      <span class="block mb-1.5 text-sm font-medium text-foreground">Timing Presets</span>
      <div class="flex gap-2 mb-2">
        <Select bind:value={selectedTimingPreset}>
          <option value="">Select preset...</option>
          {#each timingPresets as preset}
            <option value={preset.name}>
              {preset.name} (fixation: {preset.fixation}ms, timeout: {preset.timeout}ms)
            </option>
          {/each}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          onclick={applyTimingPreset}
          disabled={!selectedTimingPreset}
        >
          Apply
        </Button>
      </div>
    </div>
  </div>

  <!-- Preview -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Configuration Summary</h4>
    <div class="bg-muted border border-border rounded-lg p-4">
      <div class="grid gap-2">
        <div class="flex justify-between items-center text-sm">
          <span class="text-muted-foreground">Task:</span>
          <span class="font-medium text-foreground text-right">{question.config.task.type}</span>
        </div>

        <div class="flex justify-between items-center text-sm">
          <span class="text-muted-foreground">Stimulus:</span>
          <span class="font-medium text-foreground text-right">
            {question.config.stimulus.type}
            {#if question.config.stimulus.type === 'shape'}
              ({question.config.stimulus.content})
            {:else if question.config.stimulus.mediaRef?.filename}
              ({question.config.stimulus.mediaRef.filename})
            {:else if question.config.stimulus.content}
              (custom)
            {/if}
          </span>
        </div>

        <div class="flex justify-between items-center text-sm">
          <span class="text-muted-foreground">Fixation:</span>
          <span class="font-medium text-foreground text-right">
            {question.config.stimulus.fixation?.type} for {question.config.stimulus.fixation
              ?.duration}ms
          </span>
        </div>

        <div class="flex justify-between items-center text-sm">
          <span class="text-muted-foreground">Valid Keys:</span>
          <span class="font-medium text-foreground text-right">
            {question.config.response.validKeys
              .map((k) => (k === ' ' ? 'SPACE' : k.toUpperCase()))
              .join(', ')}
          </span>
        </div>

        <div class="flex justify-between items-center text-sm">
          <span class="text-muted-foreground">Timeout:</span>
          <span class="font-medium text-foreground text-right">{question.config.response.timeout}ms</span>
        </div>

        <div class="flex justify-between items-center text-sm">
          <span class="text-muted-foreground">Trials:</span>
          <span class="font-medium text-foreground text-right">
            {#if question.config.task.type === 'n-back'}
              {question.config.practice ? `${question.config.practiceTrials} practice + ` : ''}
              {question.config.task.nBack.sequenceLength} n-back
            {:else if question.config.task.type === 'stroop'}
              {question.config.task.stroop.trialCount} stroop ({Math.round(question.config.task.stroop.congruentRatio * 100)}% congruent)
            {:else if question.config.task.type === 'flanker'}
              {question.config.task.flanker.trialCount} flanker ({Math.round(question.config.task.flanker.congruentRatio * 100)}% congruent)
            {:else if question.config.task.type === 'iat'}
              7-block IAT ({question.config.task.iat.trialsPerBlock}/block)
            {:else if question.config.task.type === 'dot-probe'}
              {question.config.task.dotProbe.trialCount} dot-probe ({Math.round(question.config.task.dotProbe.congruentRatio * 100)}% congruent)
            {:else if question.config.task.type === 'go-nogo'}
              {question.config.task.goNoGo.trialCount} go/no-go ({Math.round(question.config.task.goNoGo.goRatio * 100)}% go)
            {:else if question.config.task.type === 'sart'}
              {question.config.task.sart.trialCount} SART (target {question.config.task.sart.targetDigit})
            {:else if question.config.task.type === 'simon'}
              {question.config.task.simon.trialCount} Simon ({Math.round(question.config.task.simon.congruentRatio * 100)}% congruent)
            {:else if question.config.task.type === 'posner'}
              {question.config.task.posner.trialCount} Posner ({Math.round(question.config.task.posner.validRatio * 100)}% valid)
            {:else if question.config.task.type === 'visual-search'}
              {question.config.task.visualSearch.trialCount} search (sizes {question.config.task.visualSearch.setSizes.join('/')})
            {:else if question.config.task.type === 'sternberg'}
              {question.config.task.sternberg.trialCount} Sternberg (sizes {question.config.task.sternberg.setSizes.join('/')})
            {:else if question.config.task.type === 'pvt'}
              {question.config.task.pvt.trialCount} PVT ({formatTiming(question.config.task.pvt.isi)}ms ISI)
            {:else if question.config.task.type === 'temporal-order'}
              {question.config.task.temporalOrder.trialCount} TOJ ({question.config.task.temporalOrder.soaSetMs.length} SOAs)
            {:else if question.config.task.type === 'rsvp'}
              {question.config.task.rsvp.trialCount} RSVP ({formatTiming(question.config.task.rsvp.itemDurationMs)}ms/item)
            {:else if question.config.task.type === 'custom'}
              {(question.config.study?.blocks || []).reduce(
                (blockTotal, block) =>
                  blockTotal +
                  Math.max(1, block.repetitions || 1) *
                    (block.trials || []).reduce(
                      (trialTotal, trial) => trialTotal + Math.max(1, trial.repeat || 1),
                      0
                    ),
                0
              )} visual trials
            {:else}
              {question.config.practice ? `${question.config.practiceTrials} practice + ` : ''}
              {question.config.testTrials} test
            {/if}
          </span>
        </div>

        <div class="flex justify-between items-center text-sm">
          <span class="text-muted-foreground">Features:</span>
          <span class="font-medium text-foreground text-right">
            {[
              question.config.feedback && 'Feedback',
              question.config.response.requireCorrect && 'Accuracy tracking',
              `${question.config.targetFPS} FPS`,
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        </div>
      </div>
    </div>
  </div>
</div>

<MediaManagerModal
  bind:isOpen={showMediaPicker}
  {organizationId}
  {userId}
  allowMultiple={false}
  title={`Select ${question.config.stimulus.type === 'image' ? 'Image' : question.config.stimulus.type === 'video' ? 'Video' : 'Audio'} Stimulus`}
  onselect={handleMediaSelected}
/>

<style>
  .input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .input:hover {
    border-color: hsl(var(--border));
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .section:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }

  .remove-btn {
    padding: 0.125rem;
    border: none;
    background: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: hsl(var(--destructive));
  }

  .remove-media-btn {
    flex-shrink: 0;
    padding: 0.375rem;
    border: none;
    background: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.15s;
  }

  .remove-media-btn:hover {
    color: hsl(var(--destructive));
    background: hsl(var(--destructive) / 0.1);
  }
</style>
