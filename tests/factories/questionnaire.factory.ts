import type { Questionnaire, Page, Block, Question, Variable } from '@qdesigner/shared';

export function createTestQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  const timestamp = Date.now();
  
  return {
    id: `test_q_${timestamp}`,
    name: 'Test Questionnaire',
    description: 'Created for testing',
    version: 1,
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
      autoAdvance: false,
      shufflePages: false,
      shuffleBlocks: false,
      shuffleQuestions: false,
      savePartialResponses: true,
      preventDuplicateResponses: false,
      requireAuthentication: false,
      customTheme: {}
    },
    metadata: {},
    ...overrides
  };
}

export function createTestPage(overrides: Partial<Page> = {}): Page {
  const timestamp = Date.now();
  
  return {
    id: `test_page_${timestamp}`,
    title: 'Test Page',
    description: '',
    blocks: [],
    order: 0,
    showIf: null,
    timing: null,
    ...overrides
  };
}

export function createTestBlock(overrides: Partial<Block> = {}): Block {
  const timestamp = Date.now();
  
  return {
    id: `test_block_${timestamp}`,
    title: 'Test Block',
    description: '',
    questionIds: [],
    order: 0,
    randomize: false,
    showIf: null,
    ...overrides
  };
}

export function createTestQuestion(overrides: Partial<Question> = {}): Question {
  const timestamp = Date.now();
  
  return {
    id: `test_q_${timestamp}`,
    type: 'single_choice',
    text: 'Test question?',
    required: false,
    responseType: {
      type: 'single',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' }
      ]
    },
    validation: null,
    showIf: null,
    timing: null,
    media: null,
    styles: {},
    ...overrides
  };
}

export function createTestVariable(overrides: Partial<Variable> = {}): Variable {
  const timestamp = Date.now();
  
  return {
    id: `test_var_${timestamp}`,
    name: `testVar${timestamp}`,
    type: 'computed',
    dataType: 'number',
    formula: '1 + 1',
    defaultValue: null,
    description: 'Test variable',
    ...overrides
  };
}

export function createTextQuestion(text: string, overrides: Partial<Question> = {}): Question {
  return createTestQuestion({
    type: 'text',
    text,
    responseType: {
      type: 'text',
      multiline: false,
      maxLength: 500
    },
    ...overrides
  });
}

export function createRatingQuestion(text: string, scale: number = 5, overrides: Partial<Question> = {}): Question {
  return createTestQuestion({
    type: 'single_choice',
    text,
    responseType: {
      type: 'scale',
      min: 1,
      max: scale,
      minLabel: 'Strongly Disagree',
      maxLabel: 'Strongly Agree'
    },
    ...overrides
  });
}

export function createReactionTimeQuestion(overrides: Partial<Question> = {}): Question {
  return createTestQuestion({
    type: 'reaction_time',
    text: 'Press SPACE when you see the target',
    responseType: {
      type: 'keypress',
      validKeys: [' ']
    },
    timing: {
      responseWindow: 2000,
      fixationDuration: 1000,
      randomDelay: {
        min: 500,
        max: 2000
      }
    },
    ...overrides
  });
}

export function createCompleteQuestionnaire(): Questionnaire {
  const page1 = createTestPage({
    title: 'Demographics',
    order: 0
  });
  
  const page2 = createTestPage({
    title: 'Survey Questions',
    order: 1
  });
  
  const block1 = createTestBlock({
    title: 'Personal Information',
    order: 0
  });
  
  const block2 = createTestBlock({
    title: 'Feedback',
    order: 0
  });
  
  const q1 = createTextQuestion('What is your name?', { required: true });
  const q2 = createTestQuestion({
    text: 'What is your age?',
    type: 'single_choice',
    responseType: {
      type: 'single',
      options: [
        { value: '18-24', label: '18-24' },
        { value: '25-34', label: '25-34' },
        { value: '35-44', label: '35-44' },
        { value: '45-54', label: '45-54' },
        { value: '55+', label: '55+' }
      ]
    }
  });
  
  const q3 = createRatingQuestion('How satisfied are you with our service?');
  const q4 = createTextQuestion('Any additional comments?', {
    responseType: {
      type: 'text',
      multiline: true,
      maxLength: 1000
    }
  });
  
  // Assign questions to blocks
  block1.questionIds = [q1.id, q2.id];
  block2.questionIds = [q3.id, q4.id];
  
  // Assign blocks to pages
  page1.blocks = [block1];
  page2.blocks = [block2];
  
  return createTestQuestionnaire({
    pages: [page1, page2],
    questions: [q1, q2, q3, q4],
    variables: [
      createTestVariable({
        name: 'satisfactionScore',
        formula: 'q3',
        dataType: 'number'
      })
    ]
  });
}