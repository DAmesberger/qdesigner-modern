<script lang="ts">
  import type { Question } from '$lib/shared';
  import Select from '$lib/components/ui/forms/Select.svelte';

  type RecordingMode = 'audio' | 'video-audio' | 'video-only';
  type AudioQuality = 'low' | 'medium' | 'high';
  type VideoQuality = 'low' | 'medium' | 'high';

  interface MediaResponseConfig {
    recordingMode?: RecordingMode;
    maxDuration?: number;
    maxFileSize?: number;
    audioQuality?: AudioQuality;
    videoQuality?: VideoQuality;
    allowRerecord?: boolean;
    countdown?: number;
  }

  interface Props {
    question: Question & { config: MediaResponseConfig };
  }

  let { question = $bindable() }: Props = $props();

  // Duration presets (seconds)
  const durationPresets = [
    { label: '15 seconds', value: 15 },
    { label: '30 seconds', value: 30 },
    { label: '1 minute', value: 60 },
    { label: '2 minutes', value: 120 },
    { label: '5 minutes', value: 300 },
    { label: '10 minutes', value: 600 },
  ];

  // File size presets
  const fileSizePresets = [
    { label: '10 MB', value: 10 * 1024 * 1024 },
    { label: '25 MB', value: 25 * 1024 * 1024 },
    { label: '50 MB', value: 50 * 1024 * 1024 },
    { label: '100 MB', value: 100 * 1024 * 1024 },
    { label: '250 MB', value: 250 * 1024 * 1024 },
  ];

  // Countdown presets
  const countdownPresets = [
    { label: 'None', value: 0 },
    { label: '3 seconds', value: 3 },
    { label: '5 seconds', value: 5 },
    { label: '10 seconds', value: 10 },
  ];

  // Initialize config defaults
  $effect(() => {
    if (!question.config.recordingMode) question.config.recordingMode = 'audio';
    if (!question.config.maxDuration) question.config.maxDuration = 120;
    if (!question.config.maxFileSize) question.config.maxFileSize = 50 * 1024 * 1024;
    if (!question.config.audioQuality) question.config.audioQuality = 'medium';
    if (!question.config.videoQuality) question.config.videoQuality = 'medium';
    if (question.config.allowRerecord === undefined) question.config.allowRerecord = true;
    if (question.config.countdown === undefined) question.config.countdown = 3;
  });

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getAudioQualityLabel(quality: AudioQuality): string {
    switch (quality) {
      case 'low': return '64 kbps';
      case 'medium': return '128 kbps';
      case 'high': return '256 kbps';
    }
  }

  function getVideoQualityLabel(quality: VideoQuality): string {
    switch (quality) {
      case 'low': return '480p';
      case 'medium': return '720p';
      case 'high': return '1080p';
    }
  }

  const hasVideo = $derived(
    question.config.recordingMode === 'video-audio' || question.config.recordingMode === 'video-only'
  );
  const hasAudio = $derived(
    question.config.recordingMode === 'audio' || question.config.recordingMode === 'video-audio'
  );
</script>

<div class="designer-panel">
  <!-- Recording Mode -->
  <div class="form-group">
    <label for="recording-mode">Recording Mode</label>
    <Select id="recording-mode" bind:value={question.config.recordingMode}>
      <option value="audio">Audio Only</option>
      <option value="video-audio">Video + Audio</option>
      <option value="video-only">Video Only</option>
    </Select>
    <p class="help-text">
      {#if question.config.recordingMode === 'audio'}
        Participant records audio using their microphone.
      {:else if question.config.recordingMode === 'video-audio'}
        Participant records video and audio using their camera and microphone.
      {:else}
        Participant records video only using their camera (no audio).
      {/if}
    </p>
  </div>

  <!-- Max Duration -->
  <div class="form-group">
    <label for="max-duration">Maximum Duration</label>
    <Select id="max-duration" bind:value={question.config.maxDuration}>
      {#each durationPresets as preset}
        <option value={preset.value}>{preset.label}</option>
      {/each}
    </Select>
    <p class="help-text">Recording will automatically stop after this duration.</p>
  </div>

  <!-- Max File Size -->
  <div class="form-group">
    <label for="max-file-size">Maximum File Size</label>
    <Select id="max-file-size" bind:value={question.config.maxFileSize}>
      {#each fileSizePresets as preset}
        <option value={preset.value}>{preset.label}</option>
      {/each}
    </Select>
    <p class="help-text">Current: {formatFileSize(question.config.maxFileSize || 0)}</p>
  </div>

  <!-- Audio Quality (only when audio is enabled) -->
  {#if hasAudio}
    <div class="section">
      <h4 class="section-title">Audio Settings</h4>

      <div class="form-group">
        <label for="audio-quality">Audio Quality</label>
        <Select id="audio-quality" bind:value={question.config.audioQuality}>
          <option value="low">Low (64 kbps)</option>
          <option value="medium">Medium (128 kbps)</option>
          <option value="high">High (256 kbps)</option>
        </Select>
        <p class="help-text">
          Higher quality results in larger file sizes.
        </p>
      </div>
    </div>
  {/if}

  <!-- Video Quality (only when video is enabled) -->
  {#if hasVideo}
    <div class="section">
      <h4 class="section-title">Video Settings</h4>

      <div class="form-group">
        <label for="video-quality">Video Quality</label>
        <Select id="video-quality" bind:value={question.config.videoQuality}>
          <option value="low">Low (480p)</option>
          <option value="medium">Medium (720p)</option>
          <option value="high">High (1080p)</option>
        </Select>
        <p class="help-text">
          Higher quality requires more bandwidth and storage.
        </p>
      </div>
    </div>
  {/if}

  <!-- Recording Options -->
  <div class="section">
    <h4 class="section-title">Recording Options</h4>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.allowRerecord} class="checkbox" />
        <span>Allow re-recording</span>
      </label>
      <p class="help-text">
        When enabled, participants can discard their recording and try again.
      </p>
    </div>

    <div class="form-group">
      <label for="countdown">Countdown Before Recording</label>
      <Select id="countdown" bind:value={question.config.countdown}>
        {#each countdownPresets as preset}
          <option value={preset.value}>{preset.label}</option>
        {/each}
      </Select>
      <p class="help-text">
        A countdown gives participants time to prepare before recording starts.
      </p>
    </div>
  </div>

  <!-- Preview Summary -->
  <div class="section">
    <h4 class="section-title">Configuration Summary</h4>
    <div class="preview-box">
      <div class="preview-content">
        <div class="preview-stats">
          <div class="stat">
            <span class="stat-label">Mode:</span>
            <span class="stat-value">
              {#if question.config.recordingMode === 'audio'}
                Audio Only
              {:else if question.config.recordingMode === 'video-audio'}
                Video + Audio
              {:else}
                Video Only
              {/if}
            </span>
          </div>
          <div class="stat">
            <span class="stat-label">Max duration:</span>
            <span class="stat-value">{formatDuration(question.config.maxDuration || 120)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Max file size:</span>
            <span class="stat-value">{formatFileSize(question.config.maxFileSize || 0)}</span>
          </div>
          {#if hasAudio}
            <div class="stat">
              <span class="stat-label">Audio quality:</span>
              <span class="stat-value">{getAudioQualityLabel(question.config.audioQuality || 'medium')}</span>
            </div>
          {/if}
          {#if hasVideo}
            <div class="stat">
              <span class="stat-label">Video quality:</span>
              <span class="stat-value">{getVideoQualityLabel(question.config.videoQuality || 'medium')}</span>
            </div>
          {/if}
          <div class="stat">
            <span class="stat-label">Features:</span>
            <span class="stat-value">
              {[
                question.config.allowRerecord && 'Re-record',
                question.config.countdown && question.config.countdown > 0 && `${question.config.countdown}s countdown`,
              ]
                .filter(Boolean)
                .join(', ') || 'Basic recording'}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  /* Preview */
  .preview-box {
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .preview-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-stats {
    display: grid;
    gap: 0.5rem;
  }

  .stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }

  .stat-label {
    color: hsl(var(--muted-foreground));
  }

  .stat-value {
    font-weight: 500;
    color: hsl(var(--foreground));
    text-align: right;
  }
</style>
