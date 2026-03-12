<script lang="ts">
  import type {
    ReactionExperimentConfig,
    ReactionExperimentTrial,
  } from './model/reaction-experiment';
  import type { ReactionStimulusConfig } from '$lib/runtime/reaction';

  interface Props {
    config: ReactionExperimentConfig;
    trial: ReactionExperimentTrial | null;
    phaseLabel?: string;
  }

  let { config, trial, phaseLabel = 'stimulus' }: Props = $props();

  function getStimulus(): ReactionStimulusConfig | null {
    if (!trial || typeof trial.stimulus === 'string') {
      return null;
    }
    return trial.stimulus || null;
  }

  function getStageLabel() {
    if (!trial) return 'No trial selected';
    return `${trial.name || trial.id} · ${phaseLabel}`;
  }

  function getPreviewStyle() {
    const ratio = config.stage.width / Math.max(1, config.stage.height);
    return `aspect-ratio:${ratio}; background:${config.stage.background};`;
  }

  function getStimulusStyle() {
    return buildStimulusStyle(getStimulus());
  }
</script>

<div class="stage-shell">
  <div class="stage-header">
    <div>
      <p class="eyebrow">Stage Preview</p>
      <h3>{config.metadata.prompt}</h3>
    </div>
    <div class="stage-chip">{getStageLabel()}</div>
  </div>

  <div class="stage-board" style={getPreviewStyle()}>
    {#if config.stage.showGrid}
      <div class="stage-grid"></div>
    {/if}

    {#if trial?.fixationMs && phaseLabel === 'fixation'}
      <div class="fixation">
        <div class="fixation-cross"></div>
      </div>
    {/if}

    {#if getStimulus()}
      {@const currentStimulus = getStimulus()!}
      {#if currentStimulus.kind === 'text'}
        <div class="stimulus-layer text-stimulus" style={getStimulusStyle()}>
          {currentStimulus.text}
        </div>
      {:else if currentStimulus.kind === 'shape'}
        <div class="stimulus-layer" style={getStimulusStyle()}>
          <div
            class={`shape shape-${currentStimulus.shape}`}
            style={buildShapeStyle(currentStimulus)}
          ></div>
        </div>
      {:else if currentStimulus.kind === 'image'}
        <div class="stimulus-layer" style={getStimulusStyle()}>
          {#if currentStimulus.src}
            <img
              src={currentStimulus.src}
              alt="Stimulus"
              class="media"
              style={buildMediaStyle(currentStimulus)}
            />
          {:else}
            <div class="media-placeholder">Image Asset</div>
          {/if}
        </div>
      {:else if currentStimulus.kind === 'video'}
        <div class="stimulus-layer" style={getStimulusStyle()}>
          {#if currentStimulus.src}
            <video
              src={currentStimulus.src}
              muted
              autoplay
              loop
              playsinline
              class="media"
              style={buildMediaStyle(currentStimulus)}
            ></video>
          {:else}
            <div class="media-placeholder">Video Asset</div>
          {/if}
        </div>
      {:else if currentStimulus.kind === 'audio'}
        <div class="stimulus-layer" style={getStimulusStyle()}>
          <div class="audio-card">
            <span class="audio-icon">♪</span>
            <span>{currentStimulus.src ? 'Audio Ready' : 'Audio Asset'}</span>
          </div>
        </div>
      {:else if currentStimulus.kind === 'custom'}
        <div class="stimulus-layer" style={getStimulusStyle()}>
          <div class="shader-card">
            <span class="shader-label">Custom Shader</span>
            <span class="shader-meta">{currentStimulus.vertices.length} vertices</span>
          </div>
        </div>
      {/if}
    {:else}
      <div class="empty-preview">
        <p>Select a trial to preview the stage.</p>
      </div>
    {/if}
  </div>

  <div class="stage-footer">
    <span>{config.stage.width}×{config.stage.height}</span>
    <span>{config.stage.targetFPS} FPS</span>
    <span>{config.assets.length} asset{config.assets.length !== 1 ? 's' : ''}</span>
  </div>
</div>

<script module lang="ts">
  function buildStimulusStyle(stimulus: ReactionStimulusConfig | null) {
    const x = stimulus?.position?.x ?? 0;
    const y = stimulus?.position?.y ?? 0;
    const left = 50 + x * 30;
    const top = 50 + y * 30;
    return `left:${left}%; top:${top}%;`;
  }

  function buildMediaStyle(
    stimulus: Extract<ReactionStimulusConfig, { kind: 'image' | 'video' }>
  ) {
    const width = stimulus.widthPx || 240;
    const height = stimulus.heightPx || 180;
    return `width:${width}px; height:${height}px;`;
  }

  function buildShapeStyle(stimulus: Extract<ReactionStimulusConfig, { kind: 'shape' }>) {
    const width = stimulus.widthPx || stimulus.radiusPx || 120;
    const height = stimulus.heightPx || stimulus.radiusPx || 120;
    const color = stimulus.color
      ? `rgba(${Math.round((stimulus.color[0] || 1) * 255)}, ${Math.round((stimulus.color[1] || 1) * 255)}, ${Math.round((stimulus.color[2] || 1) * 255)}, ${stimulus.color[3] || 1})`
      : 'rgba(125, 211, 252, 0.95)';

    return `width:${width}px; height:${height}px; background:${color};`;
  }
</script>

<style>
  .stage-shell {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    height: 100%;
    min-width: 0;
  }

  .stage-header,
  .stage-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .stage-header h3 {
    margin: 0.2rem 0 0;
    font-size: 1.1rem;
    color: hsl(var(--foreground));
  }

  .eyebrow {
    margin: 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: hsl(var(--muted-foreground));
  }

  .stage-chip {
    border: 1px solid hsl(var(--border));
    border-radius: 999px;
    padding: 0.35rem 0.8rem;
    font-size: 0.78rem;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--background) / 0.72);
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .stage-board {
    position: relative;
    overflow: hidden;
    border-radius: 1.4rem;
    border: 1px solid hsl(var(--border) / 0.8);
    box-shadow: var(--shadow-md);
  }

  .stage-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    background-size: 10% 10%;
  }

  .stimulus-layer,
  .fixation {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .text-stimulus {
    color: white;
    font-weight: 700;
    font-size: 4rem;
  }

  .shape {
    box-shadow: 0 18px 30px rgba(15, 23, 42, 0.28);
  }

  .shape-circle {
    border-radius: 999px;
  }

  .shape-square,
  .shape-rectangle {
    border-radius: 1rem;
  }

  .shape-triangle {
    width: 0 !important;
    height: 0 !important;
    border-left: 60px solid transparent;
    border-right: 60px solid transparent;
    border-bottom: 110px solid rgba(125, 211, 252, 0.95);
    background: transparent !important;
  }

  .media {
    display: block;
    object-fit: contain;
    border-radius: 1rem;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.32);
  }

  .media-placeholder,
  .shader-card,
  .audio-card {
    min-width: 120px;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    border-radius: 1rem;
    background: rgba(15, 23, 42, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: white;
    backdrop-filter: blur(12px);
  }

  .shader-card,
  .audio-card {
    flex-direction: column;
    padding: 1rem;
  }

  .shader-label {
    font-weight: 700;
  }

  .shader-meta,
  .audio-icon {
    color: rgba(125, 211, 252, 0.94);
  }

  .fixation-cross {
    position: relative;
    width: 72px;
    height: 72px;
  }

  .fixation-cross::before,
  .fixation-cross::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    background: rgba(255, 255, 255, 0.96);
    transform: translate(-50%, -50%);
  }

  .fixation-cross::before {
    width: 8px;
    height: 72px;
  }

  .fixation-cross::after {
    width: 72px;
    height: 8px;
  }

  .empty-preview {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.72);
  }

  .stage-footer {
    color: hsl(var(--muted-foreground));
    font-size: 0.82rem;
  }

  @media (max-width: 900px) {
    .stage-header,
    .stage-footer {
      flex-direction: column;
      align-items: flex-start;
    }

    .text-stimulus {
      font-size: 2.5rem;
    }
  }
</style>
