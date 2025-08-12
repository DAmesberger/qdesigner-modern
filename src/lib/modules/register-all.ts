// Central module registration file
// This ensures all modules are registered when imported

export async function registerAllModules() {
  // Only run on client-side
  if (typeof window === 'undefined') {
    return;
  }

  const { registerModule } = await import('./registry');

  // Import and register display modules
  const [
    { metadata: barChartMetadata },
    { metadata: textMetadata },
    { metadata: textInstructionMetadata },
    // Question modules
    { metadata: multipleChoiceMetadata },
    { metadata: scaleMetadata },
    { metadata: textInputMetadata },
    { metadata: matrixMetadata },
    { metadata: rankingMetadata },
    { metadata: dateTimeMetadata },
    { metadata: fileUploadMetadata },
    { metadata: drawingMetadata },
    { metadata: reactionTimeMetadata },
    { metadata: webglMetadata }
  ] = await Promise.all([
    // Display modules
    import('./display/bar-chart/metadata'),
    import('./display/text/metadata'),
    import('./display/text-instruction/metadata'),
    // Question modules
    import('./questions/multiple-choice/metadata'),
    import('./questions/scale/metadata'),
    import('./questions/text-input/metadata'),
    import('./questions/matrix/metadata'),
    import('./questions/ranking/metadata'),
    import('./questions/date-time/metadata'),
    import('./questions/file-upload/metadata'),
    import('./questions/drawing/metadata'),
    import('./questions/reaction-time/metadata'),
    import('./questions/webgl/metadata')
  ]);

  // Register all display modules
  registerModule(barChartMetadata);
  registerModule(textMetadata);
  registerModule(textInstructionMetadata);

  // Register all question modules
  registerModule(multipleChoiceMetadata);
  registerModule(scaleMetadata);
  registerModule(textInputMetadata);
  registerModule(matrixMetadata);
  registerModule(rankingMetadata);
  registerModule(dateTimeMetadata);
  registerModule(fileUploadMetadata);
  registerModule(drawingMetadata);
  registerModule(reactionTimeMetadata);
  registerModule(webglMetadata);

  console.log('[Module Registration] All modules registered');
}

// Auto-register if on client-side
if (typeof window !== 'undefined') {
  registerAllModules();
}