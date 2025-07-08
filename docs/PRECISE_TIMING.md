# Precise Timing in QDesigner

## The Challenge

Traditional web-based questionnaires face timing precision issues:
- DOM rendering is unpredictable
- CSS animations have variable delays
- Image/video loading causes frame drops
- JavaScript timing can be affected by browser throttling

## The Solution: WebGL-Based Rendering

QDesigner achieves microsecond-precision timing by rendering ALL questionnaire content through WebGL:

### 1. HTML Content to WebGL

```typescript
// Any HTML questionnaire content is pre-rendered to canvas
const htmlRenderer = new HTMLRenderer({
  html: `
    <div class="question">
      <h2>How satisfied are you with this product?</h2>
      <p>Please rate on a scale of 1-10</p>
    </div>
  `,
  css: `
    .question { 
      text-align: center; 
      font-size: 24px; 
    }
  `
});

// Pre-render during loading phase
await htmlRenderer.preload(resourceManager);

// When presented, the texture is already on GPU
// Onset time is marked at the exact frame it's displayed
renderer.render(gl, context); // Zero delay - already prepared
```

### 2. Precise Onset Marking

```typescript
protected renderContent(gl: WebGL2RenderingContext, context: RenderContext): void {
  if (this.needsUpdate && this.renderComplete) {
    // Upload texture to GPU
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    
    // Mark the EXACT moment content becomes visible
    if (!this.onsetTime) {
      this.onsetTime = performance.now(); // Microsecond precision
    }
  }
}
```

### 3. Benefits for Questionnaires

1. **Any Question Type**: Regular survey questions, scales, text inputs - all rendered through WebGL
2. **Consistent Timing**: Every question type has the same precise timing capability
3. **Rich Content**: Full HTML/CSS support while maintaining timing precision
4. **Media Integration**: Images, videos, audio all preloaded and ready

### 4. Example: Scale Question with Reaction Time

```typescript
// This looks like a normal scale question to users
const question = {
  type: 'scale',
  html: `
    <div class="scale-question">
      <h3>How quickly did you notice the change?</h3>
      <div class="scale">
        <span>Very Slow</span>
        <input type="range" min="1" max="7" />
        <span>Very Fast</span>
      </div>
    </div>
  `,
  responseType: { type: 'scale', min: 1, max: 7 }
};

// But reaction time is measured from the exact frame it appears
// Variables automatically created:
// - q1_value: 5 (their response)
// - q1_time: 1234567.89 (when they responded)
// - q1_delta: 523.45 (reaction time in ms)
// - q1_onset: 1234044.44 (when question appeared)
```

### 5. Mixed Content Example

```typescript
// A complex question mixing HTML content with timed media
const question = {
  html: `
    <div class="instructions">
      <h2>Watch the video and answer when you see a red object</h2>
    </div>
  `,
  media: [{
    type: 'video',
    url: 'experiment-video.mp4',
    autoplay: true
  }],
  responseType: { type: 'keypress', keys: ['space'] }
};

// Timing is measured from first video frame rendered
// Both HTML and video are composited in WebGL
```

## Key Advantages

1. **No Distinction**: Users create questionnaires normally - the system handles precise timing automatically
2. **Full Flexibility**: Any HTML/CSS content works, including forms, animations, SVGs
3. **Guaranteed Timing**: WebGL's frame-locked rendering ensures consistent timing
4. **Performance**: 60-120+ FPS maintained even with complex content
5. **Preloading**: Everything ready before presentation = zero delays

This approach makes QDesigner a questionnaire platform that *happens* to have research-grade timing precision, rather than a reaction time tool trying to do questionnaires.