import {
  formatSemver,
  QuestionTypes,
  type Block,
  type Page,
  type Question,
  type Questionnaire,
  type ReactionTimeQuestion,
  type ScaleQuestion,
  type TextInputQuestion,
  type Variable,
} from '$lib/shared/types/questionnaire';

function mergeQuestion<T extends Question>(base: T, overrides: Partial<T> = {}): T {
  return { ...base, ...overrides };
}

export function createTestQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  const timestamp = Date.now();

  const questionnaire: Questionnaire = {
    id: `test_q_${timestamp}`,
    name: 'Test Questionnaire',
    description: 'Created for testing',
    version: '1.0.0',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    organizationId: `test_org_${timestamp}`,
    projectId: `test_proj_${timestamp}`,
    code: `TEST_${timestamp}`,
    created: new Date(),
    modified: new Date(),
    pages: [],
    questions: [],
    variables: [],
    flow: [],
    settings: {
      allowBackNavigation: true,
      showProgressBar: true,
      saveProgress: true,
      requireAuthentication: false,
      requireConsent: false,
      allowAnonymous: true,
      metadata: {}
    },
    metadata: {},
    ...overrides
  };

  if (!overrides.version) {
    questionnaire.version = formatSemver(questionnaire);
  }

  return questionnaire;
}

export function createTestPage(overrides: Partial<Page> = {}): Page {
  const timestamp = Date.now();

  return {
    id: `test_page_${timestamp}`,
    name: 'Test Page',
    questions: [],
    blocks: [],
    layout: { type: 'vertical' },
    ...overrides
  };
}

export function createTestBlock(overrides: Partial<Block> = {}): Block {
  const timestamp = Date.now();

  return {
    id: `test_block_${timestamp}`,
    pageId: overrides.pageId ?? `test_page_${timestamp}`,
    name: 'Test Block',
    type: 'standard',
    questions: [],
    layout: { type: 'vertical' },
    ...overrides
  };
}

export function createTestQuestion(overrides: Partial<TextInputQuestion> = {}): TextInputQuestion {
  const timestamp = Date.now();

  return mergeQuestion<TextInputQuestion>({
    id: `test_q_${timestamp}`,
    type: QuestionTypes.TEXT_INPUT,
    order: 0,
    required: false,
    name: 'Test question',
    display: {
      prompt: 'Test question?',
      placeholder: 'Answer here',
      multiline: false,
      maxLength: 500
    },
    response: {
      saveAs: `test_q_${timestamp}`,
      transform: 'none'
    }
  }, overrides);
}

export function createTestVariable(overrides: Partial<Variable> = {}): Variable {
  const timestamp = Date.now();

  return {
    id: `test_var_${timestamp}`,
    name: `testVar${timestamp}`,
    type: 'number',
    scope: 'global',
    formula: '1 + 1',
    defaultValue: null,
    description: 'Test variable',
    ...overrides
  };
}

export function createTextQuestion(text: string, overrides: Partial<TextInputQuestion> = {}): TextInputQuestion {
  return createTestQuestion({
    display: {
      prompt: text,
      multiline: false,
      maxLength: 500
    },
    ...overrides
  });
}

export function createRatingQuestion(
  text: string,
  scale: number = 5,
  overrides: Partial<ScaleQuestion> = {}
): ScaleQuestion {
  const timestamp = Date.now();

  return mergeQuestion<ScaleQuestion>({
    id: `test_scale_${timestamp}`,
    type: QuestionTypes.SCALE,
    order: 0,
    required: false,
    name: 'Rating question',
    display: {
      prompt: text,
      min: 1,
      max: scale,
      labels: {
        min: 'Strongly Disagree',
        max: 'Strongly Agree'
      },
      style: 'buttons',
      orientation: 'horizontal'
    },
    response: {
      saveAs: `test_scale_${timestamp}`,
      valueType: 'number'
    }
  }, overrides);
}

export function createReactionTimeQuestion(
  overrides: Partial<ReactionTimeQuestion> = {}
): ReactionTimeQuestion {
  const timestamp = Date.now();

  return mergeQuestion<ReactionTimeQuestion>({
    id: `test_rt_${timestamp}`,
    type: QuestionTypes.REACTION_TIME,
    order: 0,
    required: true,
    name: 'Reaction time question',
    display: {
      prompt: 'Press SPACE when you see the target',
      instruction: 'Respond as quickly as possible.',
      stimulus: {
        content: 'TARGET'
      },
      fixationDuration: 1000,
      keys: [' '],
      correctKey: ' '
    },
    response: {
      saveAs: `test_rt_${timestamp}`,
      saveAccuracy: true,
      metrics: ['rt', 'accuracy']
    }
  }, overrides);
}

export function createCompleteQuestionnaire(): Questionnaire {
  const page1 = createTestPage({
    name: 'Demographics'
  });

  const page2 = createTestPage({
    name: 'Survey Questions'
  });

  const block1 = createTestBlock({
    pageId: page1.id,
    name: 'Personal Information'
  });

  const block2 = createTestBlock({
    pageId: page2.id,
    name: 'Feedback'
  });

  const q1 = createTextQuestion('What is your name?', { required: true, order: 0 });
  const q2 = createTestQuestion({
    order: 1,
    display: {
      prompt: 'What is your age?',
      placeholder: 'Enter your age'
    }
  });

  const q3 = createRatingQuestion('How satisfied are you with our service?', 5, { order: 2 });
  const q4 = createTextQuestion('Any additional comments?', {
    order: 3,
    display: {
      prompt: 'Any additional comments?',
      multiline: true,
      maxLength: 1000
    }
  });

  // Assign questions to blocks
  block1.questions = [q1.id, q2.id];
  block2.questions = [q3.id, q4.id];

  // Assign blocks to pages
  page1.blocks = [block1];
  page2.blocks = [block2];

  return createTestQuestionnaire({
    pages: [page1, page2],
    questions: [q1, q2, q3, q4],
    variables: [
      createTestVariable({
        name: 'satisfactionScore',
        formula: q3.response.saveAs,
        type: 'number'
      })
    ]
  });
}
