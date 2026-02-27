export type RuntimeOptionValue = string | number | boolean;

export interface RuntimeChoiceOption {
  value: RuntimeOptionValue;
  label: string;
  key?: string;
}

export interface RuntimeQuestion {
  id: string;
  type: string;
  order?: number;
  required?: boolean;
  [key: string]: unknown;
}

export interface RuntimeBlock {
  id: string;
  pageId: string;
  type: 'standard' | 'randomized' | 'conditional' | 'loop';
  questions: string[];
  randomization?: {
    type: 'all' | 'subset';
    fixedPositions?: Record<string, number>;
    seed?: string;
  };
}

export interface RuntimePage {
  id: string;
  questions?: string[];
  blocks?: RuntimeBlock[];
}

export interface RuntimeVariable {
  id: string;
  name: string;
  type: string;
  scope: 'global' | 'page' | 'block' | 'question';
  defaultValue?: unknown;
  formula?: string;
}

export interface RuntimeFlowRule {
  id: string;
  type: 'skip' | 'branch' | 'loop' | 'terminate';
  condition: string;
  target?: string;
  iterations?: number;
}

export interface RuntimeQuestionnaireDefinition {
  id: string;
  version: string;
  name: string;
  created: string;
  modified: string;
  settings: {
    webgl: { targetFPS: number };
    allowBackNavigation: boolean;
    showProgressBar: boolean;
    randomizationSeed: string;
  };
  variables: RuntimeVariable[];
  pages: RuntimePage[];
  questions: RuntimeQuestion[];
  flow: RuntimeFlowRule[];
}

function buildTimestamp(): string {
  return new Date().toISOString();
}

export class QuestionnaireBuilder {
  private readonly definition: RuntimeQuestionnaireDefinition;

  constructor(name: string, options?: { id?: string; randomizationSeed?: string }) {
    const now = buildTimestamp();

    this.definition = {
      id: options?.id || `runtime-${Date.now()}`,
      version: '1.0.0',
      name,
      created: now,
      modified: now,
      settings: {
        webgl: { targetFPS: 120 },
        allowBackNavigation: false,
        showProgressBar: true,
        randomizationSeed: options?.randomizationSeed || `seed-${Date.now()}`,
      },
      variables: [],
      pages: [],
      questions: [],
      flow: [],
    };
  }

  addPage(page: RuntimePage): this {
    this.definition.pages.push(page);
    return this;
  }

  addQuestion(question: RuntimeQuestion): this {
    this.definition.questions.push(question);
    return this;
  }

  addVariable(variable: RuntimeVariable): this {
    this.definition.variables.push(variable);
    return this;
  }

  addFlowRule(rule: RuntimeFlowRule): this {
    this.definition.flow.push(rule);
    return this;
  }

  build(): RuntimeQuestionnaireDefinition {
    this.definition.modified = buildTimestamp();
    this.definition.questions = this.definition.questions.map((question, index) => ({
      ...question,
      order: index,
    }));
    return structuredClone(this.definition);
  }
}

export function createAutoAdvanceQuestion(id: string, text: string): RuntimeQuestion {
  return {
    id,
    type: 'multiple-choice',
    required: true,
    text,
    responseType: {
      type: 'none',
      delay: 20,
    },
  };
}

export function createSingleChoiceQuestion(params: {
  id: string;
  text: string;
  options: RuntimeChoiceOption[];
}): RuntimeQuestion {
  return {
    id: params.id,
    type: 'multiple-choice',
    required: true,
    text: params.text,
    responseType: {
      type: 'single',
      options: params.options,
    },
  };
}

export function createChartFeedbackQuestion(params: {
  id: string;
  title: string;
  description: string;
  conditionFormula: string;
  currentVariable?: string;
  questionnaireId?: string;
  source?: 'variable' | 'response';
  key?: string;
}): RuntimeQuestion {
  const currentVariable = params.currentVariable || params.key || '';

  return {
    id: params.id,
    type: 'statistical-feedback',
    required: false,
    title: params.title,
    description: params.description,
    displayDuration: 40,
    autoAdvance: true,
    config: {
      title: params.title,
      subtitle: params.description,
      chartType: 'bar',
      sourceMode: 'current-session',
      metric: 'mean',
      showPercentile: true,
      showSummary: true,
      refreshMs: 0,
      dataSource: {
        questionnaireId: params.questionnaireId || '',
        source: params.source || 'variable',
        key: params.key || currentVariable,
        currentVariable,
        participantId: '{{participantId}}',
        comparisonParticipantId: '',
      },
    },
    conditions: [{ formula: params.conditionFormula, target: 'show' }],
  };
}

export function createNBackReactionQuestion(params: {
  id: string;
  text: string;
  n?: number;
  sequenceLength?: number;
  targetRate?: number;
  targetKey?: string;
  nonTargetKey?: string;
  stimuli?: string[];
  fixationMs?: number;
  responseTimeoutMs?: number;
}): RuntimeQuestion {
  const stimuli = params.stimuli || ['A', 'B', 'C', 'D'];
  const targetKey = params.targetKey || 'j';
  const nonTargetKey = params.nonTargetKey || 'f';
  const fixationMs = params.fixationMs ?? 120;
  const responseTimeoutMs = params.responseTimeoutMs ?? 180;

  return {
    id: params.id,
    type: 'reaction-time',
    required: true,
    text: params.text,
    config: {
      task: {
        type: 'n-back',
        nBack: {
          n: params.n || 2,
          sequenceLength: params.sequenceLength || 12,
          targetRate: params.targetRate ?? 0.35,
          stimulusSet: stimuli,
          targetKey,
          nonTargetKey,
          fixationMs,
          responseTimeoutMs,
        },
      },
      response: {
        validKeys: [nonTargetKey, targetKey],
        timeout: responseTimeoutMs,
        requireCorrect: true,
      },
      targetFPS: 120,
      practice: false,
      testTrials: params.sequenceLength || 12,
    },
  };
}

export function pageWithQuestions(id: string, questions: string[]): RuntimePage {
  return {
    id,
    questions,
  };
}

export function pageWithRandomizedBlock(params: {
  pageId: string;
  blockId: string;
  questions: string[];
  fixedPositions: Record<string, number>;
  seed?: string;
}): RuntimePage {
  return {
    id: params.pageId,
    blocks: [
      {
        id: params.blockId,
        pageId: params.pageId,
        type: 'randomized',
        questions: params.questions,
        randomization: {
          type: 'all',
          fixedPositions: params.fixedPositions,
          seed: params.seed,
        },
      },
    ],
  };
}
