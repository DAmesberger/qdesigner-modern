/** Unknown optional extensions are data. Required extensions need runtime support. */
function assertSupportedExtensions(definition: { extensions?: unknown }): void {
  const extensions = definition.extensions;
  if (extensions === undefined) return;
  if (extensions === null || typeof extensions !== 'object' || Array.isArray(extensions)) {
    throw new Error('QDEF_EXTENSION_INVALID: extensions must be a namespaced registry.');
  }
  for (const [name, extension] of Object.entries(extensions)) {
    if (extension === null || typeof extension !== 'object' || Array.isArray(extension)) {
      throw new Error(`QDEF_EXTENSION_INVALID: ${name} must declare required and data.`);
    }
    if ('required' in extension && extension.required === true) {
      throw new Error(`QDEF_REQUIRED_EXTENSION: ${name} has no installed execution support.`);
    }
    if (
      !/^[a-zA-Z0-9_-]+(?:[.:][a-zA-Z0-9_-]+)+$/.test(name) ||
      !('required' in extension) ||
      extension.required !== false ||
      !('data' in extension) ||
      Object.keys(extension).some((key) => key !== 'required' && key !== 'data')
    ) {
      throw new Error(`QDEF_EXTENSION_INVALID: ${name} must be optional namespaced data.`);
    }
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Check capabilities before constructing a participant runtime. Drafts remain editable. */
export function assertExecutableDefinition(definition: {
  extensions?: unknown;
  questions?: unknown;
}): void {
  assertSupportedExtensions(definition);
  const questions = Array.isArray(definition.questions)
    ? definition.questions
    : Object.values(record(definition.questions) ?? {});
  for (const item of questions) {
    const question = record(item);
    if (question?.type !== 'statistical-feedback') continue;
    const config = record(question.config) ?? {};
    const display = record(question.display) ?? {};
    const mode = config.sourceMode ?? display.sourceMode ?? 'current-session';
    const source = record(config.dataSource ?? display.dataSource ?? question.dataSource);
    if (!source) continue;
    for (const [field, binding, modes] of [
      [
        'questionnaireId',
        'questionnaireBinding',
        ['cohort', 'participant-vs-cohort', 'participant-vs-participant'],
      ],
      [
        'participantId',
        'participantBinding',
        ['participant-vs-cohort', 'participant-vs-participant'],
      ],
      ['comparisonParticipantId', 'comparisonParticipantBinding', ['participant-vs-participant']],
    ] as const) {
      if (!modes.some((candidate) => candidate === mode)) continue;
      if (
        typeof source[binding] === 'string' &&
        (typeof source[field] !== 'string' || !source[field].trim())
      ) {
        throw new Error(`QDEF_SOURCE_BINDING_REQUIRED: ${source[binding]} has no local target.`);
      }
    }
  }
}
