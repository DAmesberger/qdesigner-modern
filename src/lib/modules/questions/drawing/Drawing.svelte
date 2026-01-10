<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { QuestionModuleConfig } from '../shared/types';
  import type { Question } from '$lib/shared';

  interface DrawingConfig {
    tools?: ('pen' | 'eraser' | 'line' | 'shape')[];
    colors?: string[];
    canvas?: {
      width?: number;
      height?: number;
      background?: string | ImageData;
    };
    analysis?: {
      extractFeatures?: boolean;
      detectShapes?: boolean;
      measurePressure?: boolean;
      trackTiming?: boolean;
    };
  }

  interface StrokePoint {
    x: number;
    y: number;
    time: number;
    pressure: number;
  }

  interface Stroke {
    tool: string;
    color: string;
    width: number;
    points: StrokePoint[];
  }

  interface DrawingValue {
    imageData: string;
    strokes?: Stroke[];
    analysis?: {
      strokeCount?: number;
      totalPoints?: number;
      colors?: string[];
      tools?: string[];
      drawingTime?: number;
      averageStrokeDuration?: number;
      averagePressure?: number;
      pressureVariance?: number;
    };
    timestamp: number;
  }

  interface Props extends Omit<QuestionProps, 'question'> {
    question: any; // Allow relaxed type for module config
  }

  let {
    question = $bindable(),
    mode = 'runtime',
    value = $bindable(null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  // Configuration
  const config = $derived(question.config);
  const tools = $derived(config.tools || ['pen', 'eraser']);
  const colors = $derived(
    config.colors || ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF']
  );
  const canvasWidth = $derived(config.canvas?.width || 600);
  const canvasHeight = $derived(config.canvas?.height || 400);
  const trackPressure = $derived(config.analysis?.measurePressure || false);
  const trackTiming = $derived(config.analysis?.trackTiming || false);

  // Canvas and drawing state
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let isDrawing = $state(false);
  let currentTool = $state<'pen' | 'eraser' | 'line' | 'shape'>('pen');
  let currentColor = $state('#000000');
  let currentLineWidth = $state(2);
  let drawingHistory = $state<ImageData[]>([]);
  let historyStep = $state(-1);

  // Line drawing state
  let isDrawingLine = $state(false);
  let lineStartX = $state(0);
  let lineStartY = $state(0);

  // Shape drawing state
  let isDrawingShape = $state(false);
  let shapeStartX = $state(0);
  let shapeStartY = $state(0);
  let currentShape = $state<'rectangle' | 'circle' | 'triangle'>('rectangle');

  // Pressure and timing tracking
  let strokeData = $state<Stroke[]>([]);
  let currentStroke = $state<Stroke | null>(null);
  let startTime = $state(0);

  // Validation
  $effect(() => {
    const errors: string[] = [];
    let isValid = true;

    if (question.required && !value) {
      errors.push('Drawing is required');
      isValid = false;
    }

    onValidation?.({ valid: isValid, errors });
  });

  // Setup canvas on mount
  $effect(() => {
    if (canvas && !ctx) {
      setupCanvas();
      loadBackground();

      if (trackTiming) {
        startTime = performance.now();
      }
    }
  });

  // Save drawing data on unmount
  $effect(() => {
    return () => {
      if (canvas && ctx) {
        saveDrawingData();
      }
    };
  });

  function setupCanvas() {
    ctx = canvas.getContext('2d')!;

    // Set canvas size
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Set initial style
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear canvas with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Save initial state
    saveHistory();
  }

  function loadBackground() {
    if (config.canvas?.background) {
      if (typeof config.canvas.background === 'string') {
        // Load image background
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
          saveHistory();
        };
        img.src = config.canvas.background;
      } else {
        // Use ImageData background
        ctx.putImageData(config.canvas.background, 0, 0);
        saveHistory();
      }
    }
  }

  function startDrawing(event: MouseEvent | TouchEvent) {
    if (disabled) return;

    isDrawing = true;
    const coords = getCoordinates(event);

    if (currentTool === 'line') {
      isDrawingLine = true;
      lineStartX = coords.x;
      lineStartY = coords.y;
    } else if (currentTool === 'shape') {
      isDrawingShape = true;
      shapeStartX = coords.x;
      shapeStartY = coords.y;
    } else {
      // Start pen or eraser stroke
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);

      if (trackTiming || trackPressure) {
        currentStroke = {
          tool: currentTool,
          color: currentColor,
          width: currentLineWidth,
          points: [
            {
              x: coords.x,
              y: coords.y,
              time: performance.now() - startTime,
              pressure: getPressure(event),
            },
          ],
        };
      }
    }

    onInteraction?.({
      type: 'drawing-start' as any,
      timestamp: Date.now(),
      data: { tool: currentTool, x: coords.x, y: coords.y },
    });
  }

  function draw(event: MouseEvent | TouchEvent) {
    if (!isDrawing || disabled) return;

    const coords = getCoordinates(event);

    if (isDrawingLine) {
      // Preview line
      redrawCanvas();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentLineWidth;
      ctx.beginPath();
      ctx.moveTo(lineStartX, lineStartY);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    } else if (isDrawingShape) {
      // Preview shape
      redrawCanvas();
      drawShape(shapeStartX, shapeStartY, coords.x, coords.y, true);
    } else {
      // Draw with pen or eraser
      ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentLineWidth;

      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();

      if (currentStroke && (trackTiming || trackPressure)) {
        currentStroke.points.push({
          x: coords.x,
          y: coords.y,
          time: performance.now() - startTime,
          pressure: getPressure(event),
        });
      }
    }
  }

  function stopDrawing(event: MouseEvent | TouchEvent) {
    if (!isDrawing) return;

    const coords = getCoordinates(event);

    if (isDrawingLine) {
      // Finalize line
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentLineWidth;
      ctx.beginPath();
      ctx.moveTo(lineStartX, lineStartY);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      isDrawingLine = false;
    } else if (isDrawingShape) {
      // Finalize shape
      drawShape(shapeStartX, shapeStartY, coords.x, coords.y, false);
      isDrawingShape = false;
    } else if (currentStroke) {
      // Save stroke data
      strokeData = [...strokeData, currentStroke];
      currentStroke = null;
    }

    isDrawing = false;
    ctx.globalCompositeOperation = 'source-over';
    saveHistory();
    saveDrawingData();

    onInteraction?.({
      type: 'drawing-end' as any,
      timestamp: Date.now(),
      data: { tool: currentTool },
    });
  }

  function drawShape(x1: number, y1: number, x2: number, y2: number, preview: boolean) {
    const width = x2 - x1;
    const height = y2 - y1;

    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentLineWidth;

    if (preview) {
      ctx.globalAlpha = 0.5;
    }

    switch (currentShape) {
      case 'rectangle':
        ctx.strokeRect(x1, y1, width, height);
        break;
      case 'circle':
        const radius = Math.sqrt(width * width + height * height) / 2;
        const centerX = x1 + width / 2;
        const centerY = y1 + height / 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(x1 + width / 2, y1);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.stroke();
        break;
    }

    if (preview) {
      ctx.globalAlpha = 1;
    }
  }

  function getCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const isTouch = 'touches' in event;
    let clientX = 0;
    let clientY = 0;

    if (isTouch) {
      const touch = (event as TouchEvent).touches[0];
      if (touch) {
        clientX = touch.clientX;
        clientY = touch.clientY;
      }
    } else {
      clientX = (event as MouseEvent).clientX;
      clientY = (event as MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function getPressure(event: MouseEvent | TouchEvent): number {
    if ('touches' in event && (event as TouchEvent).touches[0]) {
      // @ts-ignore - force might not exist
      return (event as TouchEvent).touches[0].force || 1;
    }
    // @ts-ignore - pressure might not exist
    return (event as PointerEvent).pressure || 1;
  }

  function saveHistory() {
    historyStep++;
    if (historyStep < drawingHistory.length) {
      drawingHistory = drawingHistory.slice(0, historyStep);
    }
    drawingHistory = [...drawingHistory, ctx.getImageData(0, 0, canvasWidth, canvasHeight)];
  }

  function redrawCanvas() {
    const image = historyStep >= 0 ? drawingHistory[historyStep] : undefined;
    if (image) {
      ctx.putImageData(image, 0, 0);
    }
  }

  function undo() {
    if (historyStep > 0) {
      historyStep--;
      const image = drawingHistory[historyStep];
      if (image) {
        ctx.putImageData(image, 0, 0);
        saveDrawingData();
      }
    }
  }

  function redo() {
    if (historyStep < drawingHistory.length - 1) {
      historyStep++;
      const image = drawingHistory[historyStep];
      if (image) {
        ctx.putImageData(image, 0, 0);
        saveDrawingData();
      }
    }
  }

  function clearCanvas() {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    loadBackground();
    saveHistory();
    strokeData = [];
    saveDrawingData();

    onInteraction?.({
      type: 'canvas-cleared' as any,
      timestamp: Date.now(),
    });
  }

  function saveDrawingData() {
    if (!canvas) return;

    const imageData = canvas.toDataURL('image/png');
    const analysisData: any = {};

    if (config.analysis?.extractFeatures && strokeData.length > 0) {
      analysisData.strokeCount = strokeData.length;
      analysisData.totalPoints = strokeData.reduce((sum, stroke) => sum + stroke.points.length, 0);
      analysisData.colors = [...new Set(strokeData.map((s) => s.color))];
      analysisData.tools = [...new Set(strokeData.map((s) => s.tool))];
    }

    if (config.analysis?.trackTiming && strokeData.length > 0) {
      const durations = strokeData.map((stroke) => {
        const points = stroke.points;
        return points.length > 0 ? points[points.length - 1]!.time - points[0]!.time : 0;
      });
      analysisData.drawingTime = Math.max(
        ...strokeData.flatMap((s) => s.points.map((p) => p.time))
      );
      analysisData.averageStrokeDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    }

    if (config.analysis?.measurePressure && strokeData.length > 0) {
      const pressures = strokeData.flatMap((s) => s.points.map((p) => p.pressure));
      analysisData.averagePressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;
      analysisData.pressureVariance = Math.sqrt(
        pressures.reduce((sum, p) => sum + Math.pow(p - analysisData.averagePressure, 2), 0) /
          pressures.length
      );
    }

    value = {
      imageData,
      strokes:
        config.analysis?.trackTiming || config.analysis?.measurePressure ? strokeData : undefined,
      analysis: Object.keys(analysisData).length > 0 ? analysisData : undefined,
      timestamp: Date.now(),
    };

    onResponse?.(value);
  }

  function selectTool(tool: typeof currentTool | 'shape') {
    if (tool === 'shape') {
      currentTool = 'shape';
    } else {
      currentTool = tool;
    }
  }

  function selectColor(color: string) {
    currentColor = color;
  }
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="drawing-container">
    <div class="toolbar">
      <div class="tool-group">
        <span class="group-label">Tools</span>
        <div class="tools">
          {#if tools.includes('pen')}
            <button
              class="tool-button"
              class:active={currentTool === 'pen'}
              onclick={() => selectTool('pen')}
              aria-label="Pen tool"
            >
              ✏️
            </button>
          {/if}
          {#if tools.includes('eraser')}
            <button
              class="tool-button"
              class:active={currentTool === 'eraser'}
              onclick={() => selectTool('eraser')}
              aria-label="Eraser tool"
            >
              🧹
            </button>
          {/if}
          {#if tools.includes('line')}
            <button
              class="tool-button"
              class:active={currentTool === 'line'}
              onclick={() => selectTool('line')}
              aria-label="Line tool"
            >
              📏
            </button>
          {/if}
          {#if tools.includes('shape')}
            <button
              class="tool-button"
              class:active={currentTool === 'shape'}
              onclick={() => selectTool('shape')}
              aria-label="Shape tool"
            >
              ⬜
            </button>
          {/if}
        </div>
      </div>

      {#if currentTool === 'shape'}
        <div class="tool-group">
          <span class="group-label">Shape</span>
          <div class="shapes">
            <button
              class="shape-button"
              class:active={currentShape === 'rectangle'}
              onclick={() => (currentShape = 'rectangle')}
            >
              ▭
            </button>
            <button
              class="shape-button"
              class:active={currentShape === 'circle'}
              onclick={() => (currentShape = 'circle')}
            >
              ○
            </button>
            <button
              class="shape-button"
              class:active={currentShape === 'triangle'}
              onclick={() => (currentShape = 'triangle')}
            >
              △
            </button>
          </div>
        </div>
      {/if}

      <div class="tool-group">
        <span class="group-label">Colors</span>
        <div class="colors">
          {#each colors as color}
            <button
              class="color-button"
              class:active={currentColor === color}
              style="background-color: {color}"
              onclick={() => selectColor(color)}
              aria-label="Select color {color}"
            ></button>
          {/each}
        </div>
      </div>

      <div class="tool-group">
        <span class="group-label">Size</span>
        <input type="range" min="1" max="20" bind:value={currentLineWidth} class="size-slider" />
        <span class="size-value">{currentLineWidth}px</span>
      </div>

      <div class="tool-group actions">
        <button class="action-button" onclick={undo} disabled={historyStep <= 0}> ↶ Undo </button>
        <button
          class="action-button"
          onclick={redo}
          disabled={historyStep >= drawingHistory.length - 1}
        >
          ↷ Redo
        </button>
        <button class="action-button clear" onclick={clearCanvas}> 🗑️ Clear </button>
      </div>
    </div>

    <div class="canvas-wrapper">
      <canvas
        bind:this={canvas}
        class="drawing-canvas"
        onmousedown={startDrawing}
        onmousemove={draw}
        onmouseup={stopDrawing}
        onmouseleave={stopDrawing}
        ontouchstart={startDrawing}
        ontouchmove={draw}
        ontouchend={stopDrawing}
      ></canvas>
    </div>

    {#if config.analysis && (config.analysis.trackTiming || config.analysis.measurePressure)}
      <div class="analysis-info">
        {#if config.analysis.trackTiming}
          <span>Drawing time: {((performance.now() - startTime) / 1000).toFixed(1)}s</span>
        {/if}
        {#if config.analysis.extractFeatures}
          <span>Strokes: {strokeData.length}</span>
        {/if}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .drawing-container {
    width: 100%;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .tool-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tool-group.actions {
    margin-left: auto;
  }

  .group-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
  }

  .tools,
  .shapes,
  .colors {
    display: flex;
    gap: 0.25rem;
  }

  .tool-button,
  .shape-button {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 1.25rem;
    transition: all 0.2s;
  }

  .tool-button:hover,
  .shape-button:hover {
    border-color: #d1d5db;
  }

  .tool-button.active,
  .shape-button.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .color-button {
    width: 2rem;
    height: 2rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .color-button:hover {
    transform: scale(1.1);
  }

  .color-button.active {
    border-color: #111827;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #111827;
  }

  .size-slider {
    width: 100px;
  }

  .size-value {
    font-size: 0.875rem;
    color: #374151;
    font-weight: 500;
  }

  .action-button {
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-button:hover:not(:disabled) {
    background: #f9fafb;
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button.clear {
    background: #fef2f2;
    border-color: #fca5a5;
    color: #b91c1c;
  }

  .action-button.clear:hover {
    background: #fee2e2;
  }

  .canvas-wrapper {
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    overflow: hidden;
    display: inline-block;
  }

  .drawing-canvas {
    display: block;
    cursor: crosshair;
    background: white;
  }

  .analysis-info {
    margin-top: 0.5rem;
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .tool-group {
      flex-wrap: wrap;
    }

    .tool-group.actions {
      margin-left: 0;
      margin-top: 0.5rem;
    }
  }
</style>
