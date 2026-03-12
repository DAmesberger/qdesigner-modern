import {
  createAutoAdvanceQuestion,
  createChartFeedbackQuestion,
  createNBackReactionQuestion,
  createSingleChoiceQuestion,
  createVisualBlockReactionQuestion,
  pageWithQuestions,
  pageWithRandomizedBlock,
  QuestionnaireBuilder,
  type RuntimeQuestionnaireDefinition,
} from './questionnaire-builder';

export type RuntimeScenarioName =
  | 'control-flow'
  | 'randomization'
  | 'programmability'
  | 'answer-options'
  | 'chart-feedback'
  | 'n-back'
  | 'mixed-reaction';

export interface RuntimeScenarioFixture {
  name: RuntimeScenarioName;
  questionnaire: RuntimeQuestionnaireDefinition;
  keySequence?: string[];
  waitForQuestionId?: string;
  expectedPresented?: {
    include: string[];
    exclude?: string[];
  };
  expectedVariables?: Record<string, unknown>;
  expectedResponse?: {
    questionId: string;
    value: unknown;
    valid?: boolean;
  };
  expectedImmediateFollowUp?: {
    firstQuestionId: string;
    secondQuestionId: string;
  };
  expectedFixedPositions?: {
    firstQuestionId: string;
    lastQuestionId: string;
  };
  expectedReaction?: {
    questionId: string;
    taskType: 'n-back' | 'standard' | 'custom';
    minTrials: number;
  };
}

function buildControlFlowFixture(): RuntimeScenarioFixture {
  const builder = new QuestionnaireBuilder('Control Flow Fixture', {
    id: 'fixture-control-flow',
    randomizationSeed: 'seed-control-flow',
  });

  builder
    .addPage(pageWithQuestions('p1', ['q_gate']))
    .addPage(pageWithQuestions('p2', ['q_should_skip']))
    .addPage(pageWithQuestions('p3', ['q_target']))
    .addQuestion(
      createSingleChoiceQuestion({
        id: 'q_gate',
        text: 'Press Y to skip page 2, or N to continue sequentially.',
        options: [
          { value: 1, label: 'Yes', key: 'y' },
          { value: 0, label: 'No', key: 'n' },
        ],
      })
    )
    .addQuestion(createAutoAdvanceQuestion('q_should_skip', 'This page should be skipped.'))
    .addQuestion(createAutoAdvanceQuestion('q_target', 'Target page reached.'))
    .addFlowRule({
      id: 'skip_page_2_when_yes',
      type: 'skip',
      condition: '(_currentPage == 1) and (q_gate_value == 1)',
      target: 'p3',
    });

  return {
    name: 'control-flow',
    questionnaire: builder.build(),
    waitForQuestionId: 'q_gate',
    keySequence: ['y'],
    expectedPresented: {
      include: ['q_gate', 'q_target'],
      exclude: ['q_should_skip'],
    },
  };
}

function buildRandomizationFixture(): RuntimeScenarioFixture {
  const builder = new QuestionnaireBuilder('Randomization Fixture', {
    id: 'fixture-randomization',
    randomizationSeed: 'seed-randomization',
  });

  builder
    .addPage(
      pageWithRandomizedBlock({
        pageId: 'p1',
        blockId: 'block_main',
        questions: ['q_fixed_start', 'q_random_a', 'q_random_b', 'q_fixed_end'],
        fixedPositions: {
          q_fixed_start: 0,
          q_fixed_end: 3,
        },
        seed: 'fixed-seed',
      })
    )
    .addQuestion(createAutoAdvanceQuestion('q_fixed_start', 'Fixed first question.'))
    .addQuestion(createAutoAdvanceQuestion('q_random_a', 'Randomized question A.'))
    .addQuestion(createAutoAdvanceQuestion('q_random_b', 'Randomized question B.'))
    .addQuestion(createAutoAdvanceQuestion('q_fixed_end', 'Fixed last question.'));

  return {
    name: 'randomization',
    questionnaire: builder.build(),
    expectedFixedPositions: {
      firstQuestionId: 'q_fixed_start',
      lastQuestionId: 'q_fixed_end',
    },
  };
}

function buildProgrammabilityFixture(): RuntimeScenarioFixture {
  const builder = new QuestionnaireBuilder('Programmability Fixture', {
    id: 'fixture-programmability',
    randomizationSeed: 'seed-programmability',
  });

  builder
    .addVariable({
      id: 'base_rt',
      name: 'base_rt',
      type: 'number',
      scope: 'global',
      defaultValue: 300,
    })
    .addVariable({
      id: 'threshold',
      name: 'threshold',
      type: 'number',
      scope: 'global',
      formula: 'base_rt * 1.5',
    })
    .addVariable({
      id: 'should_skip',
      name: 'should_skip',
      type: 'boolean',
      scope: 'global',
      formula: 'threshold > 400',
    })
    .addPage(pageWithQuestions('p1', ['q_prog_seed']))
    .addPage(pageWithQuestions('p2', ['q_prog_skip']))
    .addPage(pageWithQuestions('p3', ['q_prog_target']))
    .addQuestion(createAutoAdvanceQuestion('q_prog_seed', 'Programmability seed question.'))
    .addQuestion(createAutoAdvanceQuestion('q_prog_skip', 'This question should be skipped.'))
    .addQuestion(createAutoAdvanceQuestion('q_prog_target', 'Formula branch target reached.'))
    .addFlowRule({
      id: 'programmable_branch',
      type: 'branch',
      condition: '(_currentPage == 1) and should_skip',
      target: 'p3',
    });

  return {
    name: 'programmability',
    questionnaire: builder.build(),
    expectedPresented: {
      include: ['q_prog_seed', 'q_prog_target'],
      exclude: ['q_prog_skip'],
    },
    expectedVariables: {
      threshold: 450,
      should_skip: true,
    },
  };
}

function buildAnswerOptionsFixture(): RuntimeScenarioFixture {
  const builder = new QuestionnaireBuilder('Answer Options Fixture', {
    id: 'fixture-answer-options',
    randomizationSeed: 'seed-answer-options',
  });

  builder
    .addPage(pageWithQuestions('p1', ['q_choice', 'q_answer_done']))
    .addQuestion(
      createSingleChoiceQuestion({
        id: 'q_choice',
        text: 'Press L or R to select an answer option.',
        options: [
          { value: 'left', label: 'Left', key: 'l' },
          { value: 'right', label: 'Right', key: 'r' },
        ],
      })
    )
    .addQuestion(createAutoAdvanceQuestion('q_answer_done', 'Answer option captured.'));

  return {
    name: 'answer-options',
    questionnaire: builder.build(),
    waitForQuestionId: 'q_choice',
    keySequence: ['l'],
    expectedResponse: {
      questionId: 'q_choice',
      value: 'left',
      valid: true,
    },
  };
}

function buildChartFeedbackFixture(): RuntimeScenarioFixture {
  const builder = new QuestionnaireBuilder('Chart Feedback Fixture', {
    id: 'fixture-chart-feedback',
    randomizationSeed: 'seed-chart-feedback',
  });

  builder
    .addPage(pageWithQuestions('p1', ['q_chart_input', 'q_chart_feedback']))
    .addQuestion(
      createSingleChoiceQuestion({
        id: 'q_chart_input',
        text: 'Pick A or B to trigger instant feedback.',
        options: [
          { value: 1, label: 'Alpha', key: 'a' },
          { value: 2, label: 'Beta', key: 'b' },
        ],
      })
    )
    .addQuestion(
      createChartFeedbackQuestion({
        id: 'q_chart_feedback',
        title: 'Instant Feedback',
        description: 'Feedback should appear right after the answer.',
        conditionFormula: 'q_chart_input_value != null',
        currentVariable: 'q_chart_input_value',
      })
    );

  return {
    name: 'chart-feedback',
    questionnaire: builder.build(),
    waitForQuestionId: 'q_chart_input',
    keySequence: ['a'],
    expectedResponse: {
      questionId: 'q_chart_input',
      value: 1,
    },
    expectedImmediateFollowUp: {
      firstQuestionId: 'q_chart_input',
      secondQuestionId: 'q_chart_feedback',
    },
  };
}

function buildNBackFixture(): RuntimeScenarioFixture {
  const builder = new QuestionnaireBuilder('N-Back Fixture', {
    id: 'fixture-n-back',
    randomizationSeed: 'seed-n-back',
  });

  builder.addPage(pageWithQuestions('p1', ['q_nback'])).addQuestion(
    createNBackReactionQuestion({
      id: 'q_nback',
      text: '2-back task',
      n: 2,
      sequenceLength: 8,
      targetRate: 0.35,
      fixationMs: 80,
      responseTimeoutMs: 120,
    })
  );

  return {
    name: 'n-back',
    questionnaire: builder.build(),
    expectedPresented: {
      include: ['q_nback'],
    },
    expectedReaction: {
      questionId: 'q_nback',
      taskType: 'n-back',
      minTrials: 8,
    },
  };
}

function buildMixedReactionFixture(): RuntimeScenarioFixture {
  const builder = new QuestionnaireBuilder('Mixed Reaction Fixture', {
    id: 'fixture-mixed-reaction',
    randomizationSeed: 'seed-mixed-reaction',
  });

  const reactionQuestion = createVisualBlockReactionQuestion({
    id: 'q_reaction_visual',
    text: 'Visual block reaction test in mixed flow',
    blocks: [
      {
        id: 'mixed-test',
        name: 'Mixed Test',
        kind: 'test',
        trials: [
          {
            id: 'trial-1',
            condition: 'congruent',
            stimulus: 'LEFT',
            validKeys: ['f', 'j'],
            correctResponse: 'f',
            responseTimeoutMs: 140,
            fixationMs: 40,
            repeat: 1,
          },
          {
            id: 'trial-2',
            condition: 'incongruent',
            stimulus: 'RIGHT',
            validKeys: ['f', 'j'],
            correctResponse: 'j',
            responseTimeoutMs: 140,
            fixationMs: 40,
            repeat: 1,
          },
          {
            id: 'trial-3',
            condition: 'congruent',
            stimulus: 'LEFT',
            validKeys: ['f', 'j'],
            correctResponse: 'f',
            responseTimeoutMs: 140,
            fixationMs: 40,
            repeat: 1,
          },
        ],
      },
    ],
  });

  const reactionConfig = reactionQuestion.config as {
    study?: { practice?: boolean; practiceTrials?: number; testTrials?: number };
    practice?: boolean;
    practiceTrials?: number;
    testTrials?: number;
  };
  if (reactionConfig.study) {
    reactionConfig.study.practice = false;
    reactionConfig.study.practiceTrials = 0;
    reactionConfig.study.testTrials = 3;
  }
  reactionConfig.practice = false;
  reactionConfig.practiceTrials = 0;
  reactionConfig.testTrials = 3;

  builder
    .addPage(pageWithQuestions('p1', ['q_intro', 'q_reaction_visual', 'q_mixed_done']))
    .addQuestion(
      createSingleChoiceQuestion({
        id: 'q_intro',
        text: 'Press L to continue into reaction block.',
        options: [
          { value: 'left', label: 'Left', key: 'l' },
          { value: 'right', label: 'Right', key: 'r' },
        ],
      })
    )
    .addQuestion(reactionQuestion)
    .addQuestion(createAutoAdvanceQuestion('q_mixed_done', 'Mixed flow complete.'));

  return {
    name: 'mixed-reaction',
    questionnaire: builder.build(),
    waitForQuestionId: 'q_intro',
    keySequence: ['l'],
    expectedPresented: {
      include: ['q_intro', 'q_reaction_visual', 'q_mixed_done'],
    },
    expectedResponse: {
      questionId: 'q_intro',
      value: 'left',
      valid: true,
    },
    expectedReaction: {
      questionId: 'q_reaction_visual',
      taskType: 'custom',
      minTrials: 3,
    },
  };
}

export const runtimeScenarioFixtures: Record<RuntimeScenarioName, RuntimeScenarioFixture> = {
  'control-flow': buildControlFlowFixture(),
  randomization: buildRandomizationFixture(),
  programmability: buildProgrammabilityFixture(),
  'answer-options': buildAnswerOptionsFixture(),
  'chart-feedback': buildChartFeedbackFixture(),
  'n-back': buildNBackFixture(),
  'mixed-reaction': buildMixedReactionFixture(),
};

export function getRuntimeScenarioFixture(name: RuntimeScenarioName): RuntimeScenarioFixture {
  return runtimeScenarioFixtures[name];
}

export function serializeRuntimeFixture(
  fixture: RuntimeScenarioFixture | RuntimeQuestionnaireDefinition
): string {
  const questionnaire = 'questionnaire' in fixture ? fixture.questionnaire : fixture;
  return Buffer.from(JSON.stringify(questionnaire), 'utf-8').toString('base64url');
}
