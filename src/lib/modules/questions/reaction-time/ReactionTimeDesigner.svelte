<script lang="ts">
  import type { Question } from '$lib/shared';
  import type { ReactionTrialConfig } from '$lib/runtime/reaction';
  import type { MediaAsset } from '$lib/shared/types/media';
  import MediaManagerModal from '$lib/components/designer/MediaManagerModal.svelte';
  import BlockEditor from './designer/BlockEditor.svelte';
  import { mediaService } from '$lib/services/mediaService';
  import { createLegacyStarterPayload } from './model/starter-templates';
  import { normalizeReactionQuestionConfig } from './model/reaction-normalize';
  import type { ReactionLegacyQuestionConfig, ReactionStudyConfig } from './model/reaction-schema';
  import Button from '$lib/components/common/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  type ReactionTaskType = 'standard' | 'n-back' | 'stroop' | 'flanker' | 'iat' | 'dot-probe' | 'custom';
  type StimulusType = 'text' | 'shape' | 'image' | 'video' | 'audio';

  interface MediaStimulusRef {
    mediaId: string;
    mediaUrl?: string;
    filename?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
  }

  interface ReactionTimeConfig {
    study?: ReactionStudyConfig;
    task: {
      type: ReactionTaskType;
      nBack: {
        n: number;
        sequenceLength: number;
        targetRate: number;
        stimulusSet: string[];
        targetKey: string;
        nonTargetKey: string;
        fixationMs: number;
        responseTimeoutMs: number;
      };
      stroop: {
        trialCount: number;
        colors: string[];
        congruentRatio: number;
        stimulusDuration: number;
        isi: number;
        fixationMs: number;
        responseTimeoutMs: number;
      };
      flanker: {
        trialCount: number;
        stimulusSet: [string, string];
        congruentRatio: number;
        includeNeutral: boolean;
        neutralRatio: number;
        flankerCount: number;
        stimulusDuration: number;
        isi: number;
        fixationMs: number;
        responseTimeoutMs: number;
      };
      iat: {
        category1Name: string;
        category1Items: string[];
        category2Name: string;
        category2Items: string[];
        attribute1Name: string;
        attribute1Items: string[];
        attribute2Name: string;
        attribute2Items: string[];
        trialsPerBlock: number;
        practiceTrialsPerBlock: number;
        fixationMs: number;
        responseTimeoutMs: number;
      };
      dotProbe: {
        trialCount: number;
        cueDuration: number;
        isi: number;
        congruentRatio: number;
        probeSymbol: string;
        stimulusPairs: Array<{ salient: string; neutral: string }>;
        fixationMs: number;
        responseTimeoutMs: number;
      };
      customTrials: Array<Partial<ReactionTrialConfig>>;
    };
    stimulus: {
      type: StimulusType;
      content: string;
      mediaRef?: MediaStimulusRef;
      fixation?: {
        type: 'cross' | 'dot';
        duration: number;
      };
    };
    response: {
      validKeys: string[];
      timeout: number;
      requireCorrect?: boolean;
    };
    correctKey?: string;
    feedback?: boolean;
    practice?: boolean;
    practiceTrials?: number;
    testTrials?: number;
    targetFPS?: number;
  }

  interface Props {
    question: Question & { config: ReactionTimeConfig };
    organizationId?: string;
    userId?: string;
  }

  let { question = $bindable(), organizationId = '', userId = '' }: Props = $props();

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
  let newNBackStimulus = $state('');
  let newStroopColor = $state('');
  let newIatItem = $state('');
  let iatItemTarget = $state<'cat1' | 'cat2' | 'attr1' | 'attr2'>('cat1');
  let newDotProbeSalient = $state('');
  let newDotProbeNeutral = $state('');
  let selectedKeyPreset = $state('');
  let selectedTimingPreset = $state('');
  let lastObservedTaskType = $state<ReactionTaskType | null>(null);

  // Media picker state
  let showMediaPicker = $state(false);
  let mediaThumbnailUrl = $state<string | null>(null);

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
    }).catch((error) => {
      console.error('Failed to get signed URL for media:', error);
    });
  }

  function removeMediaSelection() {
    question.config.stimulus.mediaRef = undefined;
    question.config.stimulus.content = '';
    mediaThumbnailUrl = null;
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
    } else if (type === 'shape') {
      question.config.stimulus.content = 'circle';
    } else if (!question.config.stimulus.mediaRef) {
      question.config.stimulus.content = '';
    }
  }

  function ensureTaskDefaults() {
    if (!question.config.task) {
      question.config.task = {
        type: 'standard',
        nBack: {
          n: 2, sequenceLength: 20, targetRate: 0.3,
          stimulusSet: ['A', 'B', 'C', 'D'],
          targetKey: 'j', nonTargetKey: 'f',
          fixationMs: 400, responseTimeoutMs: 1200,
        },
        stroop: {
          trialCount: 40, colors: ['red', 'blue', 'green', 'yellow'],
          congruentRatio: 0.5, stimulusDuration: 0, isi: 250,
          fixationMs: 500, responseTimeoutMs: 2000,
        },
        flanker: {
          trialCount: 40, stimulusSet: ['>', '<'],
          congruentRatio: 0.5, includeNeutral: false, neutralRatio: 0.2,
          flankerCount: 2, stimulusDuration: 0, isi: 250,
          fixationMs: 500, responseTimeoutMs: 1500,
        },
        iat: {
          category1Name: 'Flowers', category1Items: ['Rose', 'Lily', 'Tulip', 'Daisy'],
          category2Name: 'Insects', category2Items: ['Ant', 'Beetle', 'Wasp', 'Moth'],
          attribute1Name: 'Pleasant', attribute1Items: ['Happy', 'Joyful', 'Love', 'Peace'],
          attribute2Name: 'Unpleasant', attribute2Items: ['Ugly', 'Nasty', 'Evil', 'Hurt'],
          trialsPerBlock: 20, practiceTrialsPerBlock: 10,
          fixationMs: 400, responseTimeoutMs: 3000,
        },
        dotProbe: {
          trialCount: 40, cueDuration: 500, isi: 500,
          congruentRatio: 0.5, probeSymbol: '*',
          stimulusPairs: [{ salient: 'THREAT', neutral: 'NEUTRAL' }],
          fixationMs: 500, responseTimeoutMs: 2000,
        },
        customTrials: [],
      };
    }
    if (!question.config.task.nBack) {
      question.config.task.nBack = {
        n: 2, sequenceLength: 20, targetRate: 0.3,
        stimulusSet: ['A', 'B', 'C', 'D'],
        targetKey: 'j', nonTargetKey: 'f',
        fixationMs: 400, responseTimeoutMs: 1200,
      };
    }
    if (!question.config.task.stroop) {
      question.config.task.stroop = {
        trialCount: 40, colors: ['red', 'blue', 'green', 'yellow'],
        congruentRatio: 0.5, stimulusDuration: 0, isi: 250,
        fixationMs: 500, responseTimeoutMs: 2000,
      };
    }
    if (!question.config.task.flanker) {
      question.config.task.flanker = {
        trialCount: 40, stimulusSet: ['>', '<'],
        congruentRatio: 0.5, includeNeutral: false, neutralRatio: 0.2,
        flankerCount: 2, stimulusDuration: 0, isi: 250,
        fixationMs: 500, responseTimeoutMs: 1500,
      };
    }
    if (!question.config.task.iat) {
      question.config.task.iat = {
        category1Name: 'Flowers', category1Items: ['Rose', 'Lily', 'Tulip', 'Daisy'],
        category2Name: 'Insects', category2Items: ['Ant', 'Beetle', 'Wasp', 'Moth'],
        attribute1Name: 'Pleasant', attribute1Items: ['Happy', 'Joyful', 'Love', 'Peace'],
        attribute2Name: 'Unpleasant', attribute2Items: ['Ugly', 'Nasty', 'Evil', 'Hurt'],
        trialsPerBlock: 20, practiceTrialsPerBlock: 10,
        fixationMs: 400, responseTimeoutMs: 3000,
      };
    }
    if (!question.config.task.dotProbe) {
      question.config.task.dotProbe = {
        trialCount: 40, cueDuration: 500, isi: 500,
        congruentRatio: 0.5, probeSymbol: '*',
        stimulusPairs: [{ salient: 'THREAT', neutral: 'NEUTRAL' }],
        fixationMs: 500, responseTimeoutMs: 2000,
      };
    }
    if (!Array.isArray(question.config.task.customTrials)) {
      question.config.task.customTrials = [];
    }
  }

  ensureTaskDefaults();

  // Initialize config defaults
  $effect(() => {
    ensureTaskDefaults();
    if (!question.config.stimulus) {
      question.config.stimulus = {
        type: 'shape',
        content: 'circle',
        fixation: {
          type: 'cross',
          duration: 500,
        },
      };
    }
    if (!question.config.stimulus.fixation) {
      question.config.stimulus.fixation = {
        type: 'cross',
        duration: 500,
      };
    }
    if (!question.config.response) {
      question.config.response = {
        validKeys: ['f', 'j'],
        timeout: 2000,
        requireCorrect: false,
      };
    }
    if (question.config.feedback === undefined) question.config.feedback = true;
    if (question.config.practice === undefined) question.config.practice = false;
    if (!question.config.practiceTrials) question.config.practiceTrials = 3;
    if (!question.config.testTrials) question.config.testTrials = 10;
    if (!question.config.targetFPS) question.config.targetFPS = 120;
    ensureStudyBlocks();
  });

  $effect(() => {
    if ((question.config.study?.blocks || []).length > 0) {
      return;
    }

    // Keep canonical study config in sync with the designer's legacy task fields.
    const canonical = normalizeReactionQuestionConfig({ config: question.config });
    const currentSerialized = JSON.stringify(question.config.study ?? null);
    const nextSerialized = JSON.stringify(canonical);
    if (currentSerialized !== nextSerialized) {
      question.config.study = canonical;
    }
  });

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

  function addNBackStimulus() {
    const value = newNBackStimulus.trim();
    if (!value || !question.config.task?.nBack) return;

    const set = question.config.task.nBack.stimulusSet || [];
    if (!set.includes(value)) {
      question.config.task.nBack.stimulusSet = [...set, value];
    }
    newNBackStimulus = '';
  }

  function removeNBackStimulus(value: string) {
    const set = question.config.task?.nBack?.stimulusSet || [];
    question.config.task!.nBack!.stimulusSet = set.filter((entry) => entry !== value);
  }

  function addStroopColor() {
    const value = newStroopColor.trim().toLowerCase();
    if (!value || !question.config.task?.stroop) return;
    const colors = question.config.task.stroop.colors || [];
    if (!colors.includes(value)) {
      question.config.task.stroop.colors = [...colors, value];
    }
    newStroopColor = '';
  }

  function removeStroopColor(value: string) {
    const colors = question.config.task?.stroop?.colors || [];
    question.config.task!.stroop!.colors = colors.filter((c) => c !== value);
  }

  function addIatItem() {
    const value = newIatItem.trim();
    if (!value || !question.config.task?.iat) return;
    const iat = question.config.task.iat;
    const targetMap = {
      cat1: 'category1Items',
      cat2: 'category2Items',
      attr1: 'attribute1Items',
      attr2: 'attribute2Items',
    } as const;
    const key = targetMap[iatItemTarget];
    const items = iat[key] || [];
    if (!items.includes(value)) {
      iat[key] = [...items, value];
    }
    newIatItem = '';
  }

  function removeIatItem(target: 'category1Items' | 'category2Items' | 'attribute1Items' | 'attribute2Items', value: string) {
    if (!question.config.task?.iat) return;
    const items = question.config.task.iat[target] || [];
    question.config.task.iat[target] = items.filter((i) => i !== value);
  }

  function addDotProbePair() {
    const salient = newDotProbeSalient.trim();
    const neutral = newDotProbeNeutral.trim();
    if (!salient || !neutral || !question.config.task?.dotProbe) return;
    question.config.task.dotProbe.stimulusPairs = [
      ...question.config.task.dotProbe.stimulusPairs,
      { salient, neutral },
    ];
    newDotProbeSalient = '';
    newDotProbeNeutral = '';
  }

  function removeDotProbePair(index: number) {
    if (!question.config.task?.dotProbe) return;
    question.config.task.dotProbe.stimulusPairs = question.config.task.dotProbe.stimulusPairs.filter(
      (_, i) => i !== index
    );
  }

  function applyTaskStarter() {
    const taskType = question.config.task?.type || 'standard';
    const starter = createLegacyStarterPayload(taskType);
    if (starter.task) {
      question.config.task = starter.task as ReactionTimeConfig['task'];
    }
    question.config.study = starter.study as ReactionStudyConfig;
  }

  function ensureStudyBlocks() {
    if (question.config.study && Array.isArray(question.config.study.blocks) && question.config.study.blocks.length > 0) {
      return;
    }

    const taskType = question.config.task?.type || 'standard';
    const starter = createLegacyStarterPayload(
      taskType,
      question.config as unknown as Partial<ReactionLegacyQuestionConfig>
    );
    if (starter.task) {
      question.config.task = starter.task as ReactionTimeConfig['task'];
    }
    if (starter.study) {
      question.config.study = starter.study as ReactionStudyConfig;
    }
  }
</script>

<div class="p-6 flex flex-col gap-6">
  <!-- Task Selection -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Task Mode</h4>

    <div class="mb-4">
      <label for="task-type">Task Type</label>
      <Select id="task-type" bind:value={question.config.task.type}>
        <option value="standard">Standard Reaction Time</option>
        <option value="n-back">N-Back</option>
        <option value="stroop">Stroop</option>
        <option value="flanker">Flanker (Eriksen)</option>
        <option value="iat">Implicit Association Test (IAT)</option>
        <option value="dot-probe">Dot-Probe</option>
        <option value="custom">Custom Trial Plan</option>
      </Select>
      <Button variant="secondary" size="sm" class="mt-2" onclick={applyTaskStarter}>
        Reset Selected Task To Starter
      </Button>
    </div>

    {#if question.config.task.type === 'n-back'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">N-Back Configuration</h5>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="nback-n">N</label>
            <input
              id="nback-n"
              type="number"
              min="1"
              max="6"
              bind:value={question.config.task.nBack.n}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-sequence-length">Sequence Length</label>
            <input
              id="nback-sequence-length"
              type="number"
              min="3"
              max="500"
              bind:value={question.config.task.nBack.sequenceLength}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-target-rate">Target Rate</label>
            <input
              id="nback-target-rate"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.nBack.targetRate}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-target-key">Target Key</label>
            <input
              id="nback-target-key"
              type="text"
              bind:value={question.config.task.nBack.targetKey}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-non-target-key">Non-Target Key</label>
            <input
              id="nback-non-target-key"
              type="text"
              bind:value={question.config.task.nBack.nonTargetKey}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-fixation-ms">Fixation (ms)</label>
            <input
              id="nback-fixation-ms"
              type="number"
              min="0"
              max="5000"
              step="10"
              bind:value={question.config.task.nBack.fixationMs}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="nback-timeout-ms">Response Timeout (ms)</label>
            <input
              id="nback-timeout-ms"
              type="number"
              min="100"
              max="10000"
              step="10"
              bind:value={question.config.task.nBack.responseTimeoutMs}
              class="input"
            />
          </div>
        </div>

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Stimulus Set</span>
          <div class="flex gap-2 mb-2">
            <input
              type="text"
              bind:value={newNBackStimulus}
              placeholder="e.g., A"
              class="input"
              onkeydown={(e) => e.key === 'Enter' && addNBackStimulus()}
            />
            <Button variant="secondary" size="sm" onclick={addNBackStimulus} disabled={!newNBackStimulus}
              >Add</Button
            >
          </div>
          <div class="flex flex-wrap gap-2 mt-2">
            {#each question.config.task.nBack.stimulusSet || [] as item}
              <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
                <span class="font-mono text-sm font-medium text-foreground">{item}</span>
                <button class="remove-btn" onclick={() => removeNBackStimulus(item)}>✕</button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if question.config.task.type === 'stroop'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Stroop Configuration</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          Color words displayed in congruent or incongruent ink colors. Participants respond to the ink color, not the word.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="stroop-trial-count">Trial Count</label>
            <input
              id="stroop-trial-count"
              type="number"
              min="4"
              max="500"
              bind:value={question.config.task.stroop.trialCount}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="stroop-congruent-ratio">Congruent Ratio</label>
            <input
              id="stroop-congruent-ratio"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.stroop.congruentRatio}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="stroop-fixation-ms">Fixation (ms)</label>
            <input
              id="stroop-fixation-ms"
              type="number"
              min="0"
              max="5000"
              step="10"
              bind:value={question.config.task.stroop.fixationMs}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="stroop-timeout-ms">Response Timeout (ms)</label>
            <input
              id="stroop-timeout-ms"
              type="number"
              min="100"
              max="10000"
              step="10"
              bind:value={question.config.task.stroop.responseTimeoutMs}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="stroop-isi">Inter-Stimulus Interval (ms)</label>
            <input
              id="stroop-isi"
              type="number"
              min="0"
              max="5000"
              step="10"
              bind:value={question.config.task.stroop.isi}
              class="input"
            />
          </div>
        </div>

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Colors</span>
          <div class="flex gap-2 mb-2">
            <input
              type="text"
              bind:value={newStroopColor}
              placeholder="e.g., red"
              class="input"
              onkeydown={(e) => e.key === 'Enter' && addStroopColor()}
            />
            <Button variant="secondary" size="sm" onclick={addStroopColor} disabled={!newStroopColor}>Add</Button>
          </div>
          <div class="flex flex-wrap gap-2 mt-2">
            {#each question.config.task.stroop.colors || [] as color}
              <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
                <span class="inline-block w-3.5 h-3.5 rounded border border-foreground/15 shrink-0" style="background-color: {color};"></span>
                <span class="font-mono text-sm font-medium text-foreground">{color}</span>
                <button class="remove-btn" onclick={() => removeStroopColor(color)}>&#10005;</button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if question.config.task.type === 'flanker'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Flanker Configuration</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          A central target surrounded by flankers. Congruent: flankers match target. Incongruent: flankers differ.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="flanker-trial-count">Trial Count</label>
            <input
              id="flanker-trial-count"
              type="number"
              min="4"
              max="500"
              bind:value={question.config.task.flanker.trialCount}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="flanker-congruent-ratio">Congruent Ratio</label>
            <input
              id="flanker-congruent-ratio"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.flanker.congruentRatio}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="flanker-count">Flankers per Side</label>
            <input
              id="flanker-count"
              type="number"
              min="1"
              max="6"
              bind:value={question.config.task.flanker.flankerCount}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="flanker-fixation-ms">Fixation (ms)</label>
            <input
              id="flanker-fixation-ms"
              type="number"
              min="0"
              max="5000"
              step="10"
              bind:value={question.config.task.flanker.fixationMs}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="flanker-timeout-ms">Response Timeout (ms)</label>
            <input
              id="flanker-timeout-ms"
              type="number"
              min="100"
              max="10000"
              step="10"
              bind:value={question.config.task.flanker.responseTimeoutMs}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="flanker-isi">Inter-Stimulus Interval (ms)</label>
            <input
              id="flanker-isi"
              type="number"
              min="0"
              max="5000"
              step="10"
              bind:value={question.config.task.flanker.isi}
              class="input"
            />
          </div>
        </div>

        <div class="mb-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={question.config.task.flanker.includeNeutral}
              class="w-4 h-4 cursor-pointer"
            />
            <span>Include neutral condition (e.g., --&lt;--)</span>
          </label>
        </div>

        {#if question.config.task.flanker.includeNeutral}
          <div class="mb-4">
            <label for="flanker-neutral-ratio">Neutral Ratio</label>
            <input
              id="flanker-neutral-ratio"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.flanker.neutralRatio}
              class="input"
            />
          </div>
        {/if}

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Stimulus Characters</span>
          <div class="grid grid-cols-2 gap-3">
            <div class="mb-4">
              <label for="flanker-stim-0">Left Response</label>
              <input
                id="flanker-stim-0"
                type="text"
                maxlength="1"
                bind:value={question.config.task.flanker.stimulusSet[0]}
                class="input"
              />
            </div>
            <div class="mb-4">
              <label for="flanker-stim-1">Right Response</label>
              <input
                id="flanker-stim-1"
                type="text"
                maxlength="1"
                bind:value={question.config.task.flanker.stimulusSet[1]}
                class="input"
              />
            </div>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            Preview: {question.config.task.flanker.stimulusSet[0].repeat(question.config.task.flanker.flankerCount)}{question.config.task.flanker.stimulusSet[0]}{question.config.task.flanker.stimulusSet[0].repeat(question.config.task.flanker.flankerCount)} (congruent) |
            {question.config.task.flanker.stimulusSet[1].repeat(question.config.task.flanker.flankerCount)}{question.config.task.flanker.stimulusSet[0]}{question.config.task.flanker.stimulusSet[1].repeat(question.config.task.flanker.flankerCount)} (incongruent)
          </p>
        </div>
      </div>
    {/if}

    <!-- Stimulus Preview Panel -->
    {#if question.config.task.type === 'stroop' || question.config.task.type === 'flanker'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Stimulus Preview</h5>
        <div class="bg-foreground border border-foreground rounded-lg p-5 overflow-hidden">
          {#if question.config.task.type === 'stroop'}
            {@const colors = question.config.task.stroop.colors || []}
            {@const congruent = colors.length >= 1}
            <div class="flex items-center gap-4 justify-center">
              <div class="text-3xl font-bold text-muted-foreground font-mono shrink-0">+</div>
              <div class="text-xl text-muted-foreground shrink-0">&#x2192;</div>
              <div class="flex flex-col gap-3">
                {#if congruent && colors.length >= 2}
                  <div class="flex items-center gap-3">
                    <span class="stroop-flanker-label">Congruent:</span>
                    <span class="stroop-word" style="color: {colors[0]}; font-size: 1.5rem; font-weight: 700;">
                      {(colors[0] ?? 'RED').toUpperCase()}
                    </span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="stroop-flanker-label">Incongruent:</span>
                    <span class="stroop-word" style="color: {colors[1]}; font-size: 1.5rem; font-weight: 700;">
                      {(colors[0] ?? 'RED').toUpperCase()}
                    </span>
                  </div>
                {:else}
                  <span class="text-muted-foreground text-[0.8125rem] italic">Add at least 2 colors to see preview</span>
                {/if}
              </div>
            </div>
          {:else if question.config.task.type === 'flanker'}
            {@const stim = question.config.task.flanker.stimulusSet}
            {@const n = question.config.task.flanker.flankerCount}
            <div class="flex items-center gap-4 justify-center">
              <div class="text-3xl font-bold text-muted-foreground font-mono shrink-0">+</div>
              <div class="text-xl text-muted-foreground shrink-0">&#x2192;</div>
              <div class="flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <span class="stroop-flanker-label">Congruent:</span>
                  <span class="flanker-display">{stim[0].repeat(n)}{stim[0]}{stim[0].repeat(n)}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="stroop-flanker-label">Incongruent:</span>
                  <span class="flanker-display">{stim[1].repeat(n)}{stim[0]}{stim[1].repeat(n)}</span>
                </div>
                {#if question.config.task.flanker.includeNeutral}
                  <div class="flex items-center gap-3">
                    <span class="stroop-flanker-label">Neutral:</span>
                    <span class="flanker-display">{'-'.repeat(n)}{stim[0]}{'-'.repeat(n)}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if question.config.task.type === 'iat'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">IAT Configuration</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          Standard 7-block Implicit Association Test. Categories are sorted with E (left) and I (right) keys.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="iat-trials-per-block">Trials per Test Block</label>
            <input
              id="iat-trials-per-block"
              type="number"
              min="4"
              max="100"
              bind:value={question.config.task.iat.trialsPerBlock}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-practice-trials">Trials per Practice Block</label>
            <input
              id="iat-practice-trials"
              type="number"
              min="4"
              max="50"
              bind:value={question.config.task.iat.practiceTrialsPerBlock}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-fixation-ms">Fixation (ms)</label>
            <input
              id="iat-fixation-ms"
              type="number"
              min="0"
              max="5000"
              step="10"
              bind:value={question.config.task.iat.fixationMs}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-timeout-ms">Response Timeout (ms)</label>
            <input
              id="iat-timeout-ms"
              type="number"
              min="100"
              max="10000"
              step="10"
              bind:value={question.config.task.iat.responseTimeoutMs}
              class="input"
            />
          </div>
        </div>

        <h5 class="mb-2 text-sm font-medium text-muted-foreground" style="margin-top: 1rem;">Categories &amp; Attributes</h5>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="iat-cat1-name">Category 1 Name</label>
            <input
              id="iat-cat1-name"
              type="text"
              bind:value={question.config.task.iat.category1Name}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-cat2-name">Category 2 Name</label>
            <input
              id="iat-cat2-name"
              type="text"
              bind:value={question.config.task.iat.category2Name}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-attr1-name">Attribute 1 Name</label>
            <input
              id="iat-attr1-name"
              type="text"
              bind:value={question.config.task.iat.attribute1Name}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="iat-attr2-name">Attribute 2 Name</label>
            <input
              id="iat-attr2-name"
              type="text"
              bind:value={question.config.task.iat.attribute2Name}
              class="input"
            />
          </div>
        </div>

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Add Items</span>
          <div class="flex gap-2 mb-2">
            <Select bind:value={iatItemTarget} class="text-sm">
              <option value="cat1">{question.config.task.iat.category1Name}</option>
              <option value="cat2">{question.config.task.iat.category2Name}</option>
              <option value="attr1">{question.config.task.iat.attribute1Name}</option>
              <option value="attr2">{question.config.task.iat.attribute2Name}</option>
            </Select>
            <input
              type="text"
              bind:value={newIatItem}
              placeholder="Item text"
              class="input"
              onkeydown={(e) => e.key === 'Enter' && addIatItem()}
            />
            <Button variant="secondary" size="sm" onclick={addIatItem} disabled={!newIatItem}>Add</Button>
          </div>
        </div>

        {#each [
          { label: question.config.task.iat.category1Name, key: 'category1Items' as const, items: question.config.task.iat.category1Items },
          { label: question.config.task.iat.category2Name, key: 'category2Items' as const, items: question.config.task.iat.category2Items },
          { label: question.config.task.iat.attribute1Name, key: 'attribute1Items' as const, items: question.config.task.iat.attribute1Items },
          { label: question.config.task.iat.attribute2Name, key: 'attribute2Items' as const, items: question.config.task.iat.attribute2Items },
        ] as group}
          <div class="mb-4">
            <span class="block mb-1.5 text-sm font-medium text-foreground">{group.label}</span>
            <div class="flex flex-wrap gap-2 mt-2">
              {#each group.items as item}
                <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
                  <span class="font-mono text-sm font-medium text-foreground">{item}</span>
                  <button class="remove-btn" onclick={() => removeIatItem(group.key, item)}>&#10005;</button>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if question.config.task.type === 'dot-probe'}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Dot-Probe Configuration</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          Two stimuli are shown briefly, then a probe replaces one. Congruent = probe at salient location. Measures attentional bias.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="mb-4">
            <label for="dotprobe-trial-count">Trial Count</label>
            <input
              id="dotprobe-trial-count"
              type="number"
              min="4"
              max="500"
              bind:value={question.config.task.dotProbe.trialCount}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="dotprobe-congruent-ratio">Congruent Ratio</label>
            <input
              id="dotprobe-congruent-ratio"
              type="number"
              min="0"
              max="1"
              step="0.05"
              bind:value={question.config.task.dotProbe.congruentRatio}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="dotprobe-cue-duration">Cue Duration (ms)</label>
            <input
              id="dotprobe-cue-duration"
              type="number"
              min="50"
              max="5000"
              step="10"
              bind:value={question.config.task.dotProbe.cueDuration}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="dotprobe-probe-symbol">Probe Symbol</label>
            <input
              id="dotprobe-probe-symbol"
              type="text"
              maxlength="3"
              bind:value={question.config.task.dotProbe.probeSymbol}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="dotprobe-fixation-ms">Fixation (ms)</label>
            <input
              id="dotprobe-fixation-ms"
              type="number"
              min="0"
              max="5000"
              step="10"
              bind:value={question.config.task.dotProbe.fixationMs}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="dotprobe-timeout-ms">Response Timeout (ms)</label>
            <input
              id="dotprobe-timeout-ms"
              type="number"
              min="100"
              max="10000"
              step="10"
              bind:value={question.config.task.dotProbe.responseTimeoutMs}
              class="input"
            />
          </div>
          <div class="mb-4">
            <label for="dotprobe-isi">Inter-Trial Interval (ms)</label>
            <input
              id="dotprobe-isi"
              type="number"
              min="0"
              max="5000"
              step="10"
              bind:value={question.config.task.dotProbe.isi}
              class="input"
            />
          </div>
        </div>

        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Stimulus Pairs (Salient / Neutral)</span>
          <div class="flex gap-2 mb-2">
            <input
              type="text"
              bind:value={newDotProbeSalient}
              placeholder="Salient stimulus"
              class="input"
            />
            <input
              type="text"
              bind:value={newDotProbeNeutral}
              placeholder="Neutral stimulus"
              class="input"
            />
            <Button
              variant="secondary"
              size="sm"
              onclick={addDotProbePair}
              disabled={!newDotProbeSalient || !newDotProbeNeutral}
            >Add</Button>
          </div>
          <div class="flex flex-wrap gap-2 mt-2" style="flex-direction: column;">
            {#each question.config.task.dotProbe.stimulusPairs as pair, idx}
              <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md" style="width: 100%; justify-content: space-between;">
                <span class="font-mono text-sm font-medium text-foreground">{pair.salient} / {pair.neutral}</span>
                <button class="remove-btn" onclick={() => removeDotProbePair(idx)}>&#10005;</button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if question.config.study}
      <div class="mt-4 pl-4">
        <h5 class="mb-2 text-sm font-medium text-muted-foreground">Visual Trial Blocks</h5>
        <p class="mt-1 text-xs text-muted-foreground">
          Build fully programmable reaction tasks with visual blocks and trial templates. No JSON is
          required.
        </p>
        <BlockEditor bind:blocks={question.config.study.blocks} />
      </div>
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

            <button class="remove-media-btn" onclick={removeMediaSelection} aria-label="Remove media">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {:else}
          <!-- No media selected - show select button and manual URL option -->
          <div class="flex flex-col gap-3">
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
            <div class="media-url-divider">
              <span>or enter URL directly</span>
            </div>
            <input
              type="text"
              bind:value={question.config.stimulus.content}
              placeholder={question.config.stimulus.type === 'image'
                ? 'https://example.com/image.png'
                : question.config.stimulus.type === 'video'
                  ? 'https://example.com/video.mp4'
                  : 'https://example.com/audio.mp3'}
              class="input"
            />
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
  </div>

  <!-- Performance Settings -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Performance Settings</h4>

    <div class="mb-4">
      <label for="target-fps">Target FPS</label>
      <Select id="target-fps" bind:value={question.config.targetFPS}>
        <option value={30}>30 FPS</option>
        <option value={60}>60 FPS</option>
        <option value={120}>120 FPS</option>
        <option value={144}>144 FPS</option>
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
  title="Select {question.config.stimulus.type === 'image' ? 'Image' : question.config.stimulus.type === 'video' ? 'Video' : 'Audio'} Stimulus"
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

  .media-url-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: hsl(var(--muted-foreground));
    font-size: 0.75rem;
  }

  .media-url-divider::before,
  .media-url-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: hsl(var(--border));
  }

  .stroop-flanker-label {
    font-size: 0.6875rem;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    width: 5.5rem;
    flex-shrink: 0;
  }

  .stroop-word {
    text-shadow: 0 1px 3px hsl(var(--foreground) / 0.3);
  }

  .flanker-display {
    font-family: monospace;
    font-size: 1.75rem;
    font-weight: 700;
    color: hsl(var(--background));
    letter-spacing: 0.15em;
  }
</style>
