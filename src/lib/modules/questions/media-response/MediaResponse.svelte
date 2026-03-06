<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { onMount } from 'svelte';
  import { api } from '$lib/services/api';
  import Button from '$lib/components/common/Button.svelte';

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

  interface MediaResponseValue {
    mediaUrl: string;
    mimeType: string;
    duration: number;
    fileSize: number;
    recordedAt: number;
  }

  interface Props extends QuestionProps {
    question: Question & { config: MediaResponseConfig };
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable(null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  // Configuration
  const config = $derived(question.config);
  const recordingMode = $derived<RecordingMode>(config.recordingMode || 'audio');
  const maxDuration = $derived(config.maxDuration || 120);
  const maxFileSize = $derived(config.maxFileSize || 50 * 1024 * 1024);
  const audioQuality = $derived<AudioQuality>(config.audioQuality || 'medium');
  const videoQuality = $derived<VideoQuality>(config.videoQuality || 'medium');
  const allowRerecord = $derived(config.allowRerecord !== false);
  const countdownDuration = $derived(config.countdown || 0);

  const isAudioOnly = $derived(recordingMode === 'audio');
  const hasVideo = $derived(recordingMode === 'video-audio' || recordingMode === 'video-only');
  const hasAudio = $derived(recordingMode === 'audio' || recordingMode === 'video-audio');

  const BLOB_SIZE_WARNING_BYTES = 5 * 1024 * 1024; // 5 MB

  // State
  let blobSizeWarning = $state('');
  let phase = $state<'idle' | 'requesting' | 'countdown' | 'recording' | 'recorded' | 'error'>('idle');
  let errorMessage = $state('');
  let stream = $state<MediaStream | null>(null);
  let mediaRecorder = $state<MediaRecorder | null>(null);
  let recordedChunks = $state<Blob[]>([]);
  let recordedBlob = $state<Blob | null>(null);
  let recordedUrl = $state('');
  let elapsedTime = $state(0);
  let countdownValue = $state(0);

  // DOM refs
  let videoPreviewEl = $state<HTMLVideoElement>(undefined!);
  let videoPlaybackEl = $state<HTMLVideoElement>(undefined!);
  let audioPlaybackEl = $state<HTMLAudioElement>(undefined!);
  let waveformCanvas = $state<HTMLCanvasElement>(undefined!);

  // Internals
  let timerInterval: ReturnType<typeof setInterval> | undefined;
  let countdownInterval: ReturnType<typeof setInterval> | undefined;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let animationFrameId: number | undefined;

  // Derived display values
  const formattedTime = $derived(() => {
    const mins = Math.floor(elapsedTime / 60);
    const secs = elapsedTime % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  });

  const formattedMaxDuration = $derived(() => {
    const mins = Math.floor(maxDuration / 60);
    const secs = maxDuration % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  });

  const progressPercent = $derived(maxDuration > 0 ? (elapsedTime / maxDuration) * 100 : 0);

  // Audio bitrate mapping
  function getAudioBitsPerSecond(quality: AudioQuality): number {
    switch (quality) {
      case 'low': return 64000;
      case 'medium': return 128000;
      case 'high': return 256000;
    }
  }

  // Video constraints
  function getVideoConstraints(quality: VideoQuality): MediaTrackConstraints {
    switch (quality) {
      case 'low': return { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };
      case 'medium': return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
      case 'high': return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    }
  }

  // Pick a supported mimeType
  function getSupportedMimeType(): string {
    const candidates = hasVideo
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];

    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return hasVideo ? 'video/webm' : 'audio/webm';
  }

  // Validation
  $effect(() => {
    const errors: string[] = [];
    let isValid = true;

    if (question.required && !value) {
      errors.push('A recording is required');
      isValid = false;
    }

    onValidation?.({ valid: isValid, errors });
  });

  // =========================================================================
  // Recording lifecycle
  // =========================================================================

  async function requestPermissions(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {};

    if (hasAudio) {
      constraints.audio = true;
    }
    if (hasVideo) {
      constraints.video = getVideoConstraints(videoQuality);
    }

    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async function startRecording() {
    if (disabled) return;

    phase = 'requesting';
    errorMessage = '';

    try {
      const mediaStream = await requestPermissions();
      stream = mediaStream;

      // Attach video preview
      if (hasVideo && videoPreviewEl) {
        videoPreviewEl.srcObject = mediaStream;
        videoPreviewEl.muted = true;
        await videoPreviewEl.play();
      }

      // Set up audio analyser for waveform
      if (hasAudio && isAudioOnly) {
        setupWaveformAnalyser(mediaStream);
      }

      // If countdown is configured, run it first
      if (countdownDuration > 0) {
        phase = 'countdown';
        await runCountdown();
      }

      beginRecording(mediaStream);
    } catch (err: unknown) {
      phase = 'error';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Permission denied. Please allow access to your microphone' + (hasVideo ? ' and camera' : '') + '.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No ' + (hasVideo ? 'camera' : 'microphone') + ' found. Please check your device.';
        } else {
          errorMessage = `Device error: ${err.message}`;
        }
      } else {
        errorMessage = 'Failed to access media devices.';
      }
    }
  }

  function runCountdown(): Promise<void> {
    return new Promise((resolve) => {
      countdownValue = countdownDuration;
      countdownInterval = setInterval(() => {
        countdownValue--;
        if (countdownValue <= 0) {
          clearInterval(countdownInterval);
          countdownInterval = undefined;
          resolve();
        }
      }, 1000);
    });
  }

  function beginRecording(mediaStream: MediaStream) {
    recordedChunks = [];
    elapsedTime = 0;
    phase = 'recording';

    const mimeType = getSupportedMimeType();
    const options: MediaRecorderOptions = { mimeType };

    if (hasAudio) {
      options.audioBitsPerSecond = getAudioBitsPerSecond(audioQuality);
    }

    const recorder = new MediaRecorder(mediaStream, options);
    mediaRecorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks = [...recordedChunks, event.data];
      }
    };

    recorder.onstop = () => {
      finalizeRecording();
    };

    recorder.start(1000); // Collect data every second

    // Start timer
    timerInterval = setInterval(() => {
      elapsedTime++;

      // Enforce max duration
      if (elapsedTime >= maxDuration) {
        stopRecording();
      }
    }, 1000);

    onInteraction?.({
      type: 'change' as any,
      timestamp: Date.now(),
      data: { action: 'recording-started', mode: recordingMode },
    });
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = undefined;
    }

    // Stop waveform animation
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    }

    // Stop stream tracks
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    // Close audio context
    if (audioContext) {
      audioContext.close();
      audioContext = null;
      analyserNode = null;
    }
  }

  function finalizeRecording() {
    if (recordedChunks.length === 0) {
      phase = 'idle';
      return;
    }

    const mimeType = getSupportedMimeType();
    const blob = new Blob(recordedChunks, { type: mimeType });

    // Check file size
    if (blob.size > maxFileSize) {
      phase = 'error';
      errorMessage = `Recording exceeds maximum file size of ${formatBytes(maxFileSize)}.`;
      return;
    }

    // Warn if blob is large (> 5 MB) but still allow it
    if (blob.size > BLOB_SIZE_WARNING_BYTES) {
      blobSizeWarning = `Recording is ${formatBytes(blob.size)}. Large files may take longer to upload. Consider using lower quality settings for smaller files.`;
    } else {
      blobSizeWarning = '';
    }

    recordedBlob = blob;
    recordedUrl = URL.createObjectURL(blob);
    phase = 'recorded';

    // Build response value
    const responseValue: MediaResponseValue = {
      mediaUrl: recordedUrl,
      mimeType,
      duration: elapsedTime,
      fileSize: blob.size,
      recordedAt: Date.now(),
    };

    value = responseValue;
    onResponse?.(responseValue);

    onInteraction?.({
      type: 'change' as any,
      timestamp: Date.now(),
      data: { action: 'recording-complete', duration: elapsedTime, size: blob.size },
    });

    // Upload to server in background if a session is active
    uploadMediaToServer(blob, mimeType);
  }

  async function uploadMediaToServer(blob: Blob, mimeType: string) {
    const sessionId = sessionStorage.getItem('qd_api_session_id');
    if (!sessionId) return;

    const ext = mimeType.includes('video') ? 'webm' : mimeType.includes('audio') ? 'webm' : 'bin';
    const filename = `recording_${Date.now()}.${ext}`;

    try {
      const result = await api.sessions.uploadMedia(sessionId, blob, filename);

      // Replace blob URL with server URL in response value
      if (value && typeof value === 'object' && 'mediaUrl' in value) {
        const updated: MediaResponseValue = {
          ...(value as MediaResponseValue),
          mediaUrl: result.url,
        };
        value = updated;
        onResponse?.(updated);
      }
    } catch (err) {
      // Upload failure is non-critical; the blob URL still works locally
      console.warn('Media upload failed, keeping local blob URL:', err);
    }
  }

  function reRecord() {
    // Clean up old recording URL
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = '';
    }
    recordedBlob = null;
    recordedChunks = [];
    blobSizeWarning = '';
    value = null;
    onResponse?.(null);
    phase = 'idle';

    onInteraction?.({
      type: 'change' as any,
      timestamp: Date.now(),
      data: { action: 're-record' },
    });
  }

  // =========================================================================
  // Waveform visualization
  // =========================================================================

  function setupWaveformAnalyser(mediaStream: MediaStream) {
    try {
      audioContext = new AudioContext();
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;

      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyserNode);

      drawWaveform();
    } catch {
      // Waveform is non-critical
    }
  }

  function drawWaveform() {
    if (!analyserNode || !waveformCanvas) return;

    const canvasCtx = waveformCanvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;

    function draw() {
      if (!analyserNode) return;
      animationFrameId = requestAnimationFrame(draw);

      analyserNode.getByteTimeDomainData(dataArray);

      canvasCtx!.fillStyle = '#1f2937';
      canvasCtx!.fillRect(0, 0, width, height);

      canvasCtx!.lineWidth = 2;
      canvasCtx!.strokeStyle = '#3b82f6';
      canvasCtx!.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = (dataArray[i] ?? 128) / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          canvasCtx!.moveTo(x, y);
        } else {
          canvasCtx!.lineTo(x, y);
        }
        x += sliceWidth;
      }

      canvasCtx!.lineTo(width, height / 2);
      canvasCtx!.stroke();
    }

    draw();
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Cleanup on unmount
  onMount(() => {
    return () => {
      if (timerInterval) clearInterval(timerInterval);
      if (countdownInterval) clearInterval(countdownInterval);
      if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (audioContext) {
        audioContext.close();
      }
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  });
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="w-full">
    <!-- Error state -->
    {#if phase === 'error'}
      <div class="flex flex-col items-center gap-3 px-6 py-8 border-2 border-red-300 rounded-xl bg-red-50 text-center">
        <div class="text-red-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="m-0 text-[0.9375rem] text-red-900">{errorMessage}</p>
        <Button variant="secondary" size="sm" onclick={() => { phase = 'idle'; errorMessage = ''; }}>
          Try Again
        </Button>
      </div>
    {/if}

    <!-- Idle state: start button -->
    {#if phase === 'idle'}
      <div class="idle-panel">
        <button
          type="button"
          class="record-start-btn"
          onclick={startRecording}
          {disabled}
        >
          <span class="record-dot"></span>
          {#if isAudioOnly}
            Record Audio
          {:else if recordingMode === 'video-audio'}
            Record Video
          {:else}
            Record Video (No Audio)
          {/if}
        </button>
        <p class="m-0 text-[0.8125rem] text-[hsl(var(--muted-foreground))]">
          Max duration: {formattedMaxDuration()}
          {#if maxFileSize}
            &middot; Max size: {formatBytes(maxFileSize)}
          {/if}
        </p>
      </div>
    {/if}

    <!-- Requesting permission -->
    {#if phase === 'requesting'}
      <div class="flex flex-col items-center gap-4 px-6 py-10 border-2 border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--muted))]">
        <div class="spinner"></div>
        <p class="m-0 text-[hsl(var(--muted-foreground))] text-[0.9375rem]">
          Requesting {hasVideo ? 'camera' : 'microphone'} access...
        </p>
      </div>
    {/if}

    <!-- Countdown -->
    {#if phase === 'countdown'}
      <div class="countdown-panel">
        {#if hasVideo && videoPreviewEl}
          <!-- video preview is visible behind -->
        {/if}
        <div class="relative z-[1]">
          <span class="countdown-number">{countdownValue}</span>
        </div>
        <!-- Video preview during countdown -->
        {#if hasVideo}
          <video
            bind:this={videoPreviewEl}
            class="video-preview"
            playsinline
            muted
          ></video>
        {/if}
      </div>
    {/if}

    <!-- Recording state -->
    {#if phase === 'recording'}
      <div class="recording-panel">
        <!-- Video preview -->
        {#if hasVideo}
          <div class="video-preview-wrapper">
            <video
              bind:this={videoPreviewEl}
              class="video-preview"
              playsinline
              muted
            ></video>
            <div class="recording-indicator">
              <span class="recording-dot-animated"></span>
              <span class="recording-label">REC</span>
            </div>
          </div>
        {/if}

        <!-- Audio waveform (audio-only mode) -->
        {#if isAudioOnly}
          <div class="flex flex-col gap-2.5 px-4 pt-4 items-start">
            <div class="recording-indicator recording-indicator-inline">
              <span class="recording-dot-animated"></span>
              <span class="recording-label">Recording</span>
            </div>
            <canvas
              bind:this={waveformCanvas}
              class="waveform-canvas"
              width="400"
              height="80"
            ></canvas>
          </div>
        {/if}

        <!-- Timer and controls -->
        <div class="flex flex-col items-center gap-3 px-4 pb-4">
          <div class="timer">
            <span class="timer-current">{formattedTime()}</span>
            <span class="mx-1 text-[hsl(var(--muted-foreground))]">/</span>
            <span class="text-[hsl(var(--muted-foreground))]">{formattedMaxDuration()}</span>
          </div>

          <div class="progress-bar">
            <div class="progress-fill" style="width: {progressPercent}%"></div>
          </div>

          <button
            type="button"
            class="stop-btn"
            onclick={stopRecording}
          >
            <span class="stop-square"></span>
            Stop Recording
          </button>
        </div>
      </div>
    {/if}

    <!-- Recorded / Playback state -->
    {#if phase === 'recorded'}
      <div class="playback-panel">
        {#if hasVideo}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoPlaybackEl}
            class="video-playback"
            src={recordedUrl}
            controls
            playsinline
          ></video>
        {:else}
          <div class="flex flex-col items-center gap-4 px-6 pt-8 pb-4 bg-[hsl(var(--muted))]">
            <div class="text-[hsl(var(--muted-foreground))]">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </div>
            <audio
              bind:this={audioPlaybackEl}
              class="w-full max-w-[400px]"
              src={recordedUrl}
              controls
            ></audio>
          </div>
        {/if}

        <div class="flex items-center justify-center gap-2 px-4 py-2 text-[0.8125rem] text-[hsl(var(--muted-foreground))]">
          <span>Duration: {formattedTime()}</span>
          <span class="text-[hsl(var(--border))]">&middot;</span>
          <span>Size: {recordedBlob ? formatBytes(recordedBlob.size) : '---'}</span>
        </div>

        {#if blobSizeWarning}
          <div class="blob-size-warning">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>{blobSizeWarning}</span>
          </div>
        {/if}

        {#if allowRerecord}
          <Button
            variant="secondary"
            size="sm"
            class="re-record-btn"
            onclick={reRecord}
            {disabled}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            Re-record
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  /* ---- Idle ---- */
  .idle-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2.5rem 1.5rem;
    border: 2px dashed hsl(var(--border));
    border-radius: 0.75rem;
    background: hsl(var(--muted));
    text-align: center;
  }

  .record-start-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1.5rem;
    background: hsl(var(--destructive));
    color: hsl(var(--background));
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
  }

  .record-start-btn:hover:not(:disabled) {
    background: hsl(var(--destructive));
    filter: brightness(0.85);
    transform: translateY(-1px);
  }

  .record-start-btn:disabled {
    background: hsl(var(--muted-foreground));
    cursor: not-allowed;
  }

  .record-dot {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    background: hsl(var(--background));
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ---- Spinner ---- */
  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ---- Countdown ---- */
  .countdown-panel {
    position: relative;
    border-radius: 0.75rem;
    overflow: hidden;
    background: hsl(var(--foreground));
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .countdown-panel .video-preview {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.6;
  }

  .countdown-number {
    font-size: 5rem;
    font-weight: 700;
    color: hsl(var(--background));
    text-shadow: 0 2px 8px hsl(var(--foreground) / 0.5);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.15); opacity: 0.8; }
  }

  /* ---- Recording ---- */
  .recording-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border: 2px solid hsl(var(--destructive));
    border-radius: 0.75rem;
    overflow: hidden;
    background: hsl(var(--destructive) / 0.1);
  }

  .video-preview-wrapper {
    position: relative;
    background: hsl(var(--foreground));
  }

  .video-preview {
    width: 100%;
    max-height: 400px;
    object-fit: cover;
    display: block;
  }

  .recording-indicator {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    background: hsl(var(--destructive) / 0.9);
    border-radius: 0.25rem;
    z-index: 1;
  }

  .recording-indicator-inline {
    position: static;
    display: inline-flex;
    background: hsl(var(--destructive));
    border-radius: 0.25rem;
    align-self: flex-start;
  }

  .recording-dot-animated {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    background: hsl(var(--background));
    border-radius: 50%;
    animation: blink 1s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .recording-label {
    font-size: 0.6875rem;
    font-weight: 700;
    color: hsl(var(--background));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ---- Waveform ---- */
  .waveform-canvas {
    width: 100%;
    height: 80px;
    border-radius: 0.375rem;
    background: hsl(var(--foreground));
  }

  /* ---- Recording controls ---- */
  .timer {
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
    font-size: 1.25rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .timer-current {
    color: hsl(var(--destructive));
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: hsl(var(--border));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: hsl(var(--destructive));
    transition: width 1s linear;
    border-radius: 2px;
  }

  .stop-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    background: hsl(var(--foreground));
    color: hsl(var(--background));
    border: none;
    border-radius: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .stop-btn:hover {
    opacity: 0.85;
  }

  .stop-square {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    background: hsl(var(--background));
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* ---- Playback ---- */
  .playback-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.75rem;
    overflow: hidden;
    background: hsl(var(--card));
  }

  .video-playback {
    width: 100%;
    max-height: 400px;
    background: hsl(var(--foreground));
    display: block;
  }

  .blob-size-warning {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0 1rem;
    padding: 0.625rem 0.875rem;
    background: hsl(var(--warning) / 0.1);
    border: 1px solid hsl(var(--warning) / 0.5);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    color: hsl(var(--warning));
    line-height: 1.4;
  }

  .blob-size-warning svg {
    flex-shrink: 0;
    margin-top: 0.1rem;
    color: hsl(var(--warning));
  }

  .playback-panel :global(.re-record-btn) {
    gap: 0.375rem;
    margin: 0 1rem 1rem;
    align-self: center;
  }

  /* ---- Responsive ---- */
  @media (max-width: 640px) {
    .idle-panel {
      padding: 1.5rem 1rem;
    }

    .record-start-btn {
      padding: 0.625rem 1.25rem;
      font-size: 0.9375rem;
    }

    .waveform-canvas {
      height: 60px;
    }

    .countdown-number {
      font-size: 3.5rem;
    }

    .timer {
      font-size: 1rem;
    }
  }
</style>
