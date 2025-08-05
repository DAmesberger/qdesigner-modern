<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { TimingService } from '$lib/services/timing';
  
  interface ReactionTimeConfig {
    stimulus: {
      type: 'text' | 'shape' | 'image';
      content: string;
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
  
  interface ReactionResponse {
    key: string | null;
    reactionTime: number | null;
    isCorrect: boolean | null;
    timing?: any;
    trialNumber: number;
    isPractice: boolean;
    timeout?: boolean;
  }
  
  interface ReactionTimeValue {
    responses: ReactionResponse[];
    averageRT?: number;
    accuracy?: number;
    timeouts?: number;
  }
  
  interface Props extends QuestionProps {
    question: Question & { config: ReactionTimeConfig };
  }
  
  let {
    question,
    mode = 'runtime',
    value = $bindable(null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction
  }: Props = $props();
  
  const timingService = TimingService.getInstance();
  
  // Configuration
  const config = $derived(question.config);
  const fixationDuration = $derived(config.stimulus.fixation?.duration || 500);
  const fixationType = $derived(config.stimulus.fixation?.type || 'cross');
  const responseTimeout = $derived(config.response.timeout || 2000);
  const validKeys = $derived(config.response.validKeys || ['f', 'j']);
  const showFeedback = $derived(config.feedback !== false);
  const isPractice = $derived(config.practice || false);
  const practiceTrialCount = $derived(config.practiceTrials || 3);
  const testTrialCount = $derived(config.testTrials || 10);
  
  // State
  let state = $state<'ready' | 'fixation' | 'stimulus' | 'response' | 'feedback' | 'complete'>('ready');
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let startTime = $state(0);
  let reactionTime = $state(0);
  let isCorrect = $state<boolean | null>(null);
  let trialNumber = $state(0);
  let practiceTrials = $state<number[]>([]);
  let testTrials = $state<number[]>([]);
  let keyListener: ((e: KeyboardEvent) => void) | null = null;
  let timeoutId: number | null = null;
  let animationFrame: number | null = null;
  
  // Initialize value
  $effect(() => {
    if (!value) {
      value = {
        responses: [],
        averageRT: 0,
        accuracy: 1,
        timeouts: 0
      };
    }
  });
  
  // Setup canvas on mount
  $effect(() => {
    if (canvas && !ctx) {
      ctx = canvas.getContext('2d')!;
      setupCanvas();
      
      if (isPractice) {
        startPractice();
      }
    }
  });
  
  // Cleanup on unmount
  $effect(() => {
    return () => {
      cleanup();
    };
  });
  
  function cleanup() {
    if (keyListener) {
      document.removeEventListener('keydown', keyListener);
      keyListener = null;
    }
    
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }
  
  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }
  
  function startPractice() {
    trialNumber = 0;
    practiceTrials = [];
    state = 'ready';
  }
  
  function startTrial() {
    cleanup();
    state = 'fixation';
    drawFixation();
    
    // Start timing measurement
    timingService.startMeasurement(`reaction-${question.id}-${trialNumber}`);
    
    // Show fixation for specified duration
    timeoutId = window.setTimeout(() => {
      showStimulus();
    }, fixationDuration);
    
    onInteraction?.({
      type: 'trial-start',
      timestamp: Date.now(),
      data: { trialNumber, isPractice: trialNumber <= practiceTrialCount }
    });
  }
  
  function drawFixation() {
    if (!ctx || !canvas) return;
    
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Draw fixation
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const size = 20;
    
    if (fixationType === 'cross') {
      ctx.beginPath();
      ctx.moveTo(centerX - size, centerY);
      ctx.lineTo(centerX + size, centerY);
      ctx.moveTo(centerX, centerY - size);
      ctx.lineTo(centerX, centerY + size);
      ctx.stroke();
    } else if (fixationType === 'dot') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  function showStimulus() {
    state = 'stimulus';
    startTime = performance.now();
    
    // Draw stimulus based on type
    drawStimulus();
    
    // Add keyboard listener
    keyListener = (e: KeyboardEvent) => {
      if (validKeys.includes(e.key.toLowerCase()) && state === 'stimulus') {
        handleResponse(e.key.toLowerCase());
      }
    };
    document.addEventListener('keydown', keyListener);
    
    // Set response timeout
    if (responseTimeout > 0) {
      timeoutId = window.setTimeout(() => {
        handleTimeout();
      }, responseTimeout);
    }
  }
  
  function drawStimulus() {
    if (!ctx || !canvas) return;
    
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    const stimulusType = config.stimulus.type;
    const content = config.stimulus.content;
    
    if (stimulusType === 'text') {
      ctx.fillStyle = '#ffffff';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(content.toString(), width / 2, height / 2);
    } else if (stimulusType === 'shape') {
      ctx.fillStyle = '#ffffff';
      if (content === 'circle') {
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2);
        ctx.fill();
      } else if (content === 'square') {
        ctx.fillRect(width / 2 - 50, height / 2 - 50, 100, 100);
      }
    } else if (stimulusType === 'image' && typeof content === 'string') {
      // Load and draw image
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, width / 2 - img.width / 2, height / 2 - img.height / 2);
      };
      img.src = content;
    }
  }
  
  function handleResponse(key: string) {
    if (state !== 'stimulus') return;
    
    cleanup();
    
    // Calculate reaction time
    reactionTime = performance.now() - startTime;
    
    // End timing measurement
    const timing = timingService.endMeasurement(`reaction-${question.id}-${trialNumber}`);
    
    // Check if correct (if applicable)
    if (config.response.requireCorrect && config.correctKey) {
      isCorrect = key === config.correctKey.toLowerCase();
    }
    
    // Record response
    const response: ReactionResponse = {
      key,
      reactionTime,
      isCorrect,
      timing,
      trialNumber,
      isPractice: trialNumber <= practiceTrialCount
    };
    
    if (isPractice && trialNumber < practiceTrialCount) {
      practiceTrials = [...practiceTrials, reactionTime];
    } else {
      testTrials = [...testTrials, reactionTime];
    }
    
    // Update value
    value = {
      ...value,
      responses: [...(value?.responses || []), response],
      averageRT: calculateAverageRT(),
      accuracy: calculateAccuracy()
    };
    
    onResponse?.(value);
    onInteraction?.({
      type: 'response',
      timestamp: Date.now(),
      data: { key, reactionTime, isCorrect, trialNumber }
    });
    
    if (showFeedback) {
      showFeedbackScreen();
    } else {
      nextTrial();
    }
  }
  
  function handleTimeout() {
    if (state !== 'stimulus') return;
    
    cleanup();
    
    // Record timeout
    const response: ReactionResponse = {
      key: null,
      reactionTime: null,
      isCorrect: false,
      timeout: true,
      trialNumber,
      isPractice: trialNumber <= practiceTrialCount
    };
    
    value = {
      ...value,
      responses: [...(value?.responses || []), response],
      timeouts: (value?.timeouts || 0) + 1
    };
    
    onResponse?.(value);
    onInteraction?.({
      type: 'timeout',
      timestamp: Date.now(),
      data: { trialNumber }
    });
    
    if (showFeedback) {
      state = 'feedback';
      drawFeedback('Too slow!', '#ff0000');
      setTimeout(nextTrial, 1000);
    } else {
      nextTrial();
    }
  }
  
  function showFeedbackScreen() {
    state = 'feedback';
    
    let message = '';
    let color = '#ffffff';
    
    if (config.response.requireCorrect && isCorrect !== null) {
      if (isCorrect) {
        message = `Correct! ${reactionTime.toFixed(0)}ms`;
        color = '#00ff00';
      } else {
        message = `Incorrect! ${reactionTime.toFixed(0)}ms`;
        color = '#ff0000';
      }
    } else {
      message = `${reactionTime.toFixed(0)}ms`;
      color = '#00ff00';
    }
    
    drawFeedback(message, color);
    
    setTimeout(nextTrial, 1000);
  }
  
  function drawFeedback(message: string, color: string) {
    if (!ctx || !canvas) return;
    
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Draw feedback
    ctx.fillStyle = color;
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
  }
  
  function nextTrial() {
    trialNumber++;
    
    const totalTrials = isPractice ? practiceTrialCount + testTrialCount : testTrialCount;
    
    if (isPractice && trialNumber < practiceTrialCount) {
      setTimeout(startTrial, 1000);
    } else if (isPractice && trialNumber === practiceTrialCount) {
      // Transition from practice to test
      state = 'ready';
      drawInstructions('Practice complete! Press SPACE to start the test.');
    } else if (trialNumber < totalTrials) {
      setTimeout(startTrial, 1000);
    } else {
      // Test complete
      state = 'complete';
      drawComplete();
    }
  }
  
  function drawInstructions(text: string) {
    if (!ctx || !canvas) return;
    
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Draw instructions
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const lines = text.split('\n');
    const lineHeight = 30;
    const startY = height / 2 - (lines.length * lineHeight) / 2;
    
    lines.forEach((line, index) => {
      ctx.fillText(line, width / 2, startY + index * lineHeight);
    });
  }
  
  function drawComplete() {
    if (!ctx || !canvas) return;
    
    const avgRT = calculateAverageRT();
    const accuracy = calculateAccuracy();
    
    drawInstructions(
      `Task Complete!\n\nAverage RT: ${avgRT.toFixed(0)}ms` +
      (config.response.requireCorrect ? `\nAccuracy: ${(accuracy * 100).toFixed(0)}%` : '')
    );
  }
  
  function calculateAverageRT(): number {
    const rts = testTrials.filter(rt => rt > 0);
    return rts.length > 0 ? rts.reduce((a, b) => a + b, 0) / rts.length : 0;
  }
  
  function calculateAccuracy(): number {
    if (!config.response.requireCorrect || !value?.responses) return 1;
    
    const testResponses = value.responses.filter((r: any) => !r.isPractice);
    const correct = testResponses.filter((r: any) => r.isCorrect).length;
    
    return testResponses.length > 0 ? correct / testResponses.length : 0;
  }
  
  function handleKeyPress(e: KeyboardEvent) {
    if (disabled) return;
    
    if (state === 'ready' && e.key === ' ') {
      e.preventDefault();
      startTrial();
    }
  }
</script>

<BaseQuestion
  {question}
  {mode}
  bind:value
  {disabled}
  {onResponse}
  {onValidation}
  {onInteraction}
>
  <div class="reaction-container">
    <canvas 
      bind:this={canvas}
      class="reaction-canvas"
      on:keydown={handleKeyPress}
      tabindex="0"
    />
    
    {#if state === 'ready'}
      <div class="overlay-instructions">
        <h3>Reaction Time Task</h3>
        <p>{question.config.prompt || 'Respond as quickly as possible when you see the stimulus.'}</p>
        <p class="keys">Valid keys: {validKeys.join(', ').toUpperCase()}</p>
        <p class="start">Press SPACE to begin</p>
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .reaction-container {
    width: 100%;
    min-height: 400px;
    position: relative;
    background: #000;
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .reaction-canvas {
    width: 100%;
    height: 400px;
    display: block;
    cursor: crosshair;
  }
  
  .reaction-canvas:focus {
    outline: 2px solid #3b82f6;
    outline-offset: -2px;
  }
  
  .overlay-instructions {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: white;
    background: rgba(0, 0, 0, 0.8);
    padding: 2rem;
    border-radius: 0.5rem;
    max-width: 80%;
  }
  
  .overlay-instructions h3 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .overlay-instructions p {
    margin: 0.5rem 0;
    font-size: 1rem;
  }
  
  .overlay-instructions .keys {
    margin: 1rem 0;
    font-family: monospace;
    font-size: 1.125rem;
    color: #60a5fa;
  }
  
  .overlay-instructions .start {
    margin-top: 1.5rem;
    font-size: 1.125rem;
    font-weight: 500;
    color: #4ade80;
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  
  /* Responsive */
  @media (max-width: 640px) {
    .reaction-container {
      min-height: 300px;
    }
    
    .reaction-canvas {
      height: 300px;
    }
    
    .overlay-instructions {
      padding: 1.5rem;
    }
    
    .overlay-instructions h3 {
      font-size: 1.25rem;
    }
    
    .overlay-instructions p {
      font-size: 0.875rem;
    }
  }
</style>