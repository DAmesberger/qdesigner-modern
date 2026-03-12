// Central module registration file.
// This ensures all modules are registered once and exposes a shared promise.

let modulesRegistered = false;
let registrationPromise: Promise<void> | null = null;

export async function registerAllModules() {
  // Only run on client-side
  if (typeof window === 'undefined') {
    return;
  }

  if (modulesRegistered) {
    return;
  }

  if (registrationPromise) {
    return registrationPromise;
  }

  registrationPromise = (async () => {
  const { registerModule } = await import('./registry');

  // Import and register display modules
  const [
    { metadata: barChartMetadata },
    { metadata: textMetadata },
    { metadata: textInstructionMetadata },
    // Question modules
    { metadata: multipleChoiceMetadata },
    { metadata: scaleMetadata },
    { metadata: ratingMetadata },
    { metadata: textInputMetadata },
    { metadata: numberInputMetadata },
    { metadata: matrixMetadata },
    { metadata: rankingMetadata },
    { metadata: dateTimeMetadata },
    { metadata: fileUploadMetadata },
    { metadata: mediaResponseMetadata },
    { metadata: drawingMetadata },
    { metadata: reactionTimeMetadata },
    { metadata: reactionExperimentMetadata },
    { metadata: webglMetadata },
    { metadata: statisticalFeedbackMetadata }
  ] = await Promise.all([
    // Display modules
    import('./display/bar-chart/metadata'),
    import('./display/text/metadata'),
    import('./display/text-instruction/metadata'),
    // Question modules
    import('./questions/multiple-choice/metadata'),
    import('./questions/scale/metadata'),
    import('./questions/rating/metadata'),
    import('./questions/text-input/metadata'),
    import('./questions/number-input/metadata'),
    import('./questions/matrix/metadata'),
    import('./questions/ranking/metadata'),
    import('./questions/date-time/metadata'),
    import('./questions/file-upload/metadata'),
    import('./questions/media-response/metadata'),
    import('./questions/drawing/metadata'),
    import('./questions/reaction-time/metadata'),
    import('./questions/reaction-experiment/metadata'),
    import('./questions/webgl/metadata'),
    import('./display/statistical-feedback/metadata')
  ]);

  // Register all display modules
  registerModule(barChartMetadata);
  registerModule(textMetadata);
  registerModule(textInstructionMetadata);
  registerModule(statisticalFeedbackMetadata);

  // Register all question modules
  registerModule(multipleChoiceMetadata);
  registerModule(scaleMetadata);
  registerModule(ratingMetadata);
  registerModule(textInputMetadata);
  registerModule(numberInputMetadata);
  registerModule(matrixMetadata);
  registerModule(rankingMetadata);
  registerModule(dateTimeMetadata);
  registerModule(fileUploadMetadata);
  registerModule(mediaResponseMetadata);
  registerModule(drawingMetadata);
  registerModule(reactionTimeMetadata);
  registerModule(reactionExperimentMetadata);
  registerModule(webglMetadata);

  modulesRegistered = true;
  console.log('[Module Registration] All modules registered');
  })().catch((error) => {
    registrationPromise = null;
    throw error;
  });

  return registrationPromise;
}

// Auto-register if on client-side
if (typeof window !== 'undefined') {
  void registerAllModules();
}
