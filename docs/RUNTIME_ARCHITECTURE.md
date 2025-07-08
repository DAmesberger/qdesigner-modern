# QDesigner Runtime Architecture

## Overview

The runtime system is built on a modular architecture that separates concerns:

1. **Resource Management** - Preloading and caching all assets
2. **Stimulus System** - Modular rendering of any content type
3. **Response Handlers** - Modular input collection with precise timing
4. **Runtime Engine** - Orchestration with frame-perfect timing

## Key Design Principles

### 1. Everything is Preloaded

The `ResourceManager` scans the entire questionnaire and preloads:
- Images → WebGL textures
- Videos → HTMLVideoElement with frames ready
- Audio → Web Audio API buffers
- Fonts → Loaded into document.fonts
- Custom resources → JSON, shaders, etc.

This ensures zero loading delays during execution.

### 2. Modular Stimulus System

Any content can be a stimulus. The system provides:

- **TextStimulus** - Text rendered to canvas then WebGL
- **ImageStimulus** - Images as WebGL textures
- **VideoStimulus** - Frame-accurate video playback
- **AudioStimulus** - Web Audio API with optional waveform
- **CanvasStimulus** - Custom drawing operations
- **CompositeStimulus** - Combine multiple stimuli

All stimuli implement the same interface:
```typescript
interface IStimulus {
  preload(resourceManager: ResourceManager): Promise<void>;
  prepare(gl: WebGL2RenderingContext, config: StimulusConfig): void;
  render(gl: WebGL2RenderingContext, context: RenderContext): void;
  cleanup(gl: WebGL2RenderingContext): void;
  isReady(): boolean;
  getOnsetTime(): number | null;
}
```

### 3. Complete Flexibility

Questions are compositions of:
- **Stimuli** (what to show)
- **Response Handlers** (how to collect input)
- **Timing** (when and for how long)

Examples:
```typescript
// Simple instruction
{
  stimulus: new TextStimulus({ text: "Press SPACE to begin" }),
  response: new KeypressHandler({ keys: [' '] }),
  timing: { duration: null } // Wait for response
}

// Visual reaction test
{
  stimulus: new ImageStimulus({ imageUrl: "target.png" }),
  response: new KeypressHandler({ keys: ['f', 'j'] }),
  timing: { 
    fixationDuration: 500,
    stimulusDuration: 100,
    responseDuration: 1500
  }
}

// Complex multi-modal stimulus
{
  stimulus: new CompositeStimulus({
    components: [
      { stimulus: videoStimulus, layer: 0 },
      { stimulus: textOverlay, layer: 1 },
      { stimulus: progressBar, layer: 2 }
    ]
  }),
  response: new CompositeHandler({
    handlers: [
      new ChoiceHandler({ options: ['A', 'B', 'C'] }),
      new MouseTrackingHandler()
    ]
  })
}
```

### 4. WebGL Rendering Pipeline

All rendering goes through WebGL for consistent timing:

1. **Frame Start** (requestAnimationFrame at 60/120/144 Hz)
2. **Update Variables** - Calculate current values
3. **Check Timing** - Advance to next phase if needed
4. **Render Stimuli** - All through WebGL
5. **Collect Responses** - With performance.now() timestamps
6. **Frame End** - Ensure consistent frame pacing

### 5. Precise Timing

Every timing-critical operation uses `performance.now()`:

```typescript
// Stimulus onset
const onsetTime = performance.now();
stimulus.markOnset(onsetTime);

// Response collection
const responseTime = performance.now();
const reactionTime = responseTime - onsetTime;

// Frame timing
const frameTime = performance.now() - lastFrameTime;
const targetFrameTime = 1000 / targetFPS;
```

## Usage Example

```typescript
// Initialize runtime
const runtime = new QuestionnaireRuntime({
  questionnaire,
  canvas,
  targetFPS: 120
});

// Preload all resources
await runtime.preload((progress) => {
  console.log(`Loading: ${progress.percentage}%`);
});

// Start execution
runtime.start();

// Runtime handles:
// - Resource management
// - Stimulus presentation
// - Response collection
// - Variable updates
// - Flow control
// - Data export
```

## Response Handlers (To Be Implemented)

Similar modular system for responses:

- **KeypressHandler** - Keyboard input with timing
- **ClickHandler** - Mouse/touch positions
- **ChoiceHandler** - Single/multiple selection
- **ScaleHandler** - Continuous values
- **TextInputHandler** - Free text
- **DrawingHandler** - Mouse paths
- **AudioHandler** - Voice recording

## Benefits

1. **Performance** - Everything preloaded, all rendering through WebGL
2. **Flexibility** - Any stimulus + any response type
3. **Precision** - Microsecond timing accuracy
4. **Extensibility** - Easy to add new stimulus/response types
5. **Testability** - Modular components are easy to test

This architecture ensures QDesigner can handle any experimental paradigm while maintaining the precise timing required for reaction time studies.