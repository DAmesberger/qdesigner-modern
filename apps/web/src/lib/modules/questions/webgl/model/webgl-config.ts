export interface WebGLContent {
  type: 'circle' | 'rectangle' | 'triangle' | 'custom';
  properties: {
    radius?: number;
    width?: number;
    height?: number;
    color?: number[];
    shader?: string;
    vertices?: number[];
  };
}

export interface WebGLConfig {
  stimulus: {
    type: 'shape' | 'image' | 'video' | 'custom';
    content: WebGLContent | string;
    fixation: {
      show: boolean;
      type: 'cross' | 'dot';
      duration: number;
      color: string;
    };
  };
  response: {
    type: 'keyboard' | 'mouse' | 'touch';
    validKeys: string[];
    requireCorrect: boolean;
    correctKey?: string;
  };
  timing: {
    preDelay: number;
    postFixationDelay: number;
    stimulusDuration: number;
    responseDuration: number;
    interTrialInterval: number;
  };
  rendering: {
    targetFPS: number;
    vsync: boolean;
    antialias: boolean;
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item : null))
    .filter((item): item is string => item !== null);

  return normalized.length > 0 ? normalized : [...fallback];
}

function asColor(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value) || value.length !== 4) {
    return [...fallback];
  }

  const normalized = value
    .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : null))
    .filter((item): item is number => item !== null);

  return normalized.length === 4 ? normalized : [...fallback];
}

function normalizeStimulusContent(
  stimulusType: WebGLConfig['stimulus']['type'],
  source: unknown
): WebGLConfig['stimulus']['content'] {
  if (stimulusType === 'image' || stimulusType === 'video') {
    return typeof source === 'string' ? source : '';
  }

  const record = toRecord(source);
  const properties = toRecord(record.properties);

  if (stimulusType === 'custom') {
    return {
      type: 'custom',
      properties: {
        shader: asString(properties.shader),
        vertices: Array.isArray(properties.vertices)
          ? properties.vertices.filter(
              (item): item is number => typeof item === 'number' && Number.isFinite(item)
            )
          : [],
      },
    };
  }

  return {
    type:
      record.type === 'rectangle' || record.type === 'triangle' || record.type === 'custom'
        ? (record.type as WebGLContent['type'])
        : 'circle',
    properties: {
      radius: asNumber(properties.radius, 50),
      width: asNumber(properties.width, 100),
      height: asNumber(properties.height, 100),
      color: asColor(properties.color, [1, 1, 1, 1]),
    },
  };
}

export function createDefaultWebGLConfig(): WebGLConfig {
  return {
    stimulus: {
      type: 'shape',
      content: {
        type: 'circle',
        properties: {
          radius: 50,
          width: 100,
          height: 100,
          color: [1, 1, 1, 1],
        },
      },
      fixation: {
        show: true,
        type: 'cross',
        duration: 500,
        color: '#ffffff',
      },
    },
    response: {
      type: 'keyboard',
      validKeys: ['f', 'j'],
      requireCorrect: false,
      correctKey: undefined,
    },
    timing: {
      preDelay: 0,
      postFixationDelay: 0,
      stimulusDuration: 0,
      responseDuration: 2000,
      interTrialInterval: 500,
    },
    rendering: {
      targetFPS: 120,
      vsync: true,
      antialias: true,
    },
  };
}

export function normalizeWebGLQuestionConfig(questionLike: unknown): WebGLConfig {
  const root = toRecord(questionLike);
  const config = toRecord(root.config);
  const stimulus = toRecord(config.stimulus);
  const response = {
    ...toRecord(root.response),
    ...toRecord(config.response),
  };
  const timing = toRecord(config.timing);
  const rendering = toRecord(config.rendering);

  const defaults = createDefaultWebGLConfig();
  const stimulusType =
    stimulus.type === 'image' || stimulus.type === 'video' || stimulus.type === 'custom'
      ? (stimulus.type as WebGLConfig['stimulus']['type'])
      : 'shape';

  return {
    stimulus: {
      type: stimulusType,
      content: normalizeStimulusContent(stimulusType, stimulus.content),
      fixation: {
        show: asBoolean(toRecord(stimulus.fixation).show, defaults.stimulus.fixation.show),
        type:
          toRecord(stimulus.fixation).type === 'dot'
            ? 'dot'
            : defaults.stimulus.fixation.type,
        duration: asNumber(
          toRecord(stimulus.fixation).duration,
          defaults.stimulus.fixation.duration
        ),
        color: asString(toRecord(stimulus.fixation).color, defaults.stimulus.fixation.color),
      },
    },
    response: {
      type:
        response.type === 'mouse' || response.type === 'touch'
          ? (response.type as WebGLConfig['response']['type'])
          : 'keyboard',
      validKeys: asStringArray(response.validKeys, defaults.response.validKeys),
      requireCorrect: asBoolean(response.requireCorrect, defaults.response.requireCorrect),
      correctKey: asString(response.correctKey) || undefined,
    },
    timing: {
      preDelay: asNumber(timing.preDelay, defaults.timing.preDelay),
      postFixationDelay: asNumber(
        timing.postFixationDelay,
        defaults.timing.postFixationDelay
      ),
      stimulusDuration: asNumber(timing.stimulusDuration, defaults.timing.stimulusDuration),
      responseDuration: asNumber(timing.responseDuration, defaults.timing.responseDuration),
      interTrialInterval: asNumber(
        timing.interTrialInterval,
        defaults.timing.interTrialInterval
      ),
    },
    rendering: {
      targetFPS: asNumber(rendering.targetFPS, defaults.rendering.targetFPS),
      vsync: asBoolean(rendering.vsync, defaults.rendering.vsync),
      antialias: asBoolean(rendering.antialias, defaults.rendering.antialias),
    },
  };
}
