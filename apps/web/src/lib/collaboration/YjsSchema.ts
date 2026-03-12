/**
 * Yjs Schema — maps the Questionnaire data model to a Y.Doc structure.
 *
 * Layout:
 *   Y.Map<"meta">       — name, description, version, settings, etc.
 *   Y.Array<"pages">    — ordered pages, each as a Y.Map
 *   Y.Map<"questions">  — keyed by question ID, each value a Y.Map
 *   Y.Array<"variables"> — ordered variables, each as a Y.Map
 *   Y.Array<"flow">     — ordered flow-control rules, each as a Y.Map
 */

import * as Y from 'yjs';
import type {
  Block,
  FlowControl,
  Page,
  Question,
  Questionnaire,
  Variable,
} from '$lib/shared/types/questionnaire';

// ---------------------------------------------------------------------------
// Questionnaire -> Y.Doc
// ---------------------------------------------------------------------------

export function questionnaireToYDoc(questionnaire: Questionnaire, doc?: Y.Doc): Y.Doc {
  const ydoc = doc ?? new Y.Doc();

  ydoc.transact(() => {
    // Meta
    const meta = ydoc.getMap('meta');
    meta.set('id', questionnaire.id);
    meta.set('name', questionnaire.name);
    meta.set('description', questionnaire.description ?? '');
    meta.set('version', questionnaire.version);
    meta.set('versionMajor', questionnaire.versionMajor);
    meta.set('versionMinor', questionnaire.versionMinor);
    meta.set('versionPatch', questionnaire.versionPatch);
    meta.set('organizationId', questionnaire.organizationId ?? '');
    meta.set('projectId', questionnaire.projectId ?? '');
    meta.set('created', questionnaire.created.toISOString());
    meta.set('modified', questionnaire.modified.toISOString());
    meta.set('settings', questionnaire.settings);

    // Pages (ordered)
    const pages = ydoc.getArray<Y.Map<unknown>>('pages');
    pages.delete(0, pages.length);
    for (const page of questionnaire.pages) {
      pages.push([pageToYMap(page)]);
    }

    // Questions (keyed map)
    const questions = ydoc.getMap<Y.Map<unknown>>('questions');
    questions.forEach((_v, key) => questions.delete(key));
    for (const question of questionnaire.questions) {
      questions.set(question.id, questionToYMap(question));
    }

    // Variables (ordered)
    const variables = ydoc.getArray<Y.Map<unknown>>('variables');
    variables.delete(0, variables.length);
    for (const variable of questionnaire.variables) {
      variables.push([variableToYMap(variable)]);
    }

    // Flow (ordered)
    const flow = ydoc.getArray<Y.Map<unknown>>('flow');
    flow.delete(0, flow.length);
    for (const rule of questionnaire.flow) {
      flow.push([flowToYMap(rule)]);
    }
  });

  return ydoc;
}

// ---------------------------------------------------------------------------
// Y.Doc -> Questionnaire
// ---------------------------------------------------------------------------

export function yDocToQuestionnaire(doc: Y.Doc): Questionnaire {
  const meta = doc.getMap('meta');
  const pagesArr = doc.getArray<Y.Map<unknown>>('pages');
  const questionsMap = doc.getMap<Y.Map<unknown>>('questions');
  const variablesArr = doc.getArray<Y.Map<unknown>>('variables');
  const flowArr = doc.getArray<Y.Map<unknown>>('flow');

  const questions: Question[] = [];
  questionsMap.forEach((yQuestion) => {
    questions.push(yMapToQuestion(yQuestion));
  });

  // Preserve insertion order by sorting on the `order` field
  questions.sort((a, b) => a.order - b.order);

  return {
    id: (meta.get('id') as string) ?? '',
    name: (meta.get('name') as string) ?? 'Untitled Questionnaire',
    description: (meta.get('description') as string) ?? '',
    version: (meta.get('version') as string) ?? '1.0.0',
    versionMajor: (meta.get('versionMajor') as number) ?? 1,
    versionMinor: (meta.get('versionMinor') as number) ?? 0,
    versionPatch: (meta.get('versionPatch') as number) ?? 0,
    organizationId: (meta.get('organizationId') as string) || undefined,
    projectId: (meta.get('projectId') as string) || undefined,
    created: new Date((meta.get('created') as string) || Date.now()),
    modified: new Date((meta.get('modified') as string) || Date.now()),
    settings: (meta.get('settings') as Questionnaire['settings']) ?? {
      allowBackNavigation: false,
      showProgressBar: true,
      saveProgress: true,
    },
    pages: pagesArr.toArray().map(yMapToPage),
    questions,
    variables: variablesArr.toArray().map(yMapToVariable),
    flow: flowArr.toArray().map(yMapToFlow),
  };
}

// ---------------------------------------------------------------------------
// Sub-converters: data -> Y.Map
// ---------------------------------------------------------------------------

function pageToYMap(page: Page): Y.Map<unknown> {
  const yPage = new Y.Map<unknown>();
  yPage.set('id', page.id);
  yPage.set('name', page.name ?? '');

  const yBlocks = new Y.Array<Y.Map<unknown>>();
  for (const block of page.blocks ?? []) {
    yBlocks.push([blockToYMap(block)]);
  }
  yPage.set('blocks', yBlocks);

  if (page.layout) yPage.set('layout', page.layout);
  if (page.conditions) yPage.set('conditions', page.conditions);
  if (page.script) yPage.set('script', page.script);

  return yPage;
}

function blockToYMap(block: Block): Y.Map<unknown> {
  const yBlock = new Y.Map<unknown>();
  yBlock.set('id', block.id);
  yBlock.set('pageId', block.pageId);
  yBlock.set('name', block.name ?? '');
  yBlock.set('type', block.type);

  const yQuestions = new Y.Array<string>();
  for (const qId of block.questions) {
    yQuestions.push([qId]);
  }
  yBlock.set('questions', yQuestions);

  if (block.randomization) yBlock.set('randomization', block.randomization);
  if (block.loop) yBlock.set('loop', block.loop);
  if (block.conditions) yBlock.set('conditions', block.conditions);
  if (block.condition) yBlock.set('condition', block.condition);

  return yBlock;
}

function questionToYMap(question: Question): Y.Map<unknown> {
  const yQ = new Y.Map<unknown>();
  // Spread all top-level fields as plain JSON values.
  // Nested objects (display, response, validation, etc.) are stored as JSON
  // since they are edited atomically per question and don't need sub-field CRDT.
  const plain = JSON.parse(JSON.stringify(question));
  for (const [key, value] of Object.entries(plain)) {
    yQ.set(key, value);
  }
  return yQ;
}

function variableToYMap(variable: Variable): Y.Map<unknown> {
  const yV = new Y.Map<unknown>();
  const plain = JSON.parse(JSON.stringify(variable));
  for (const [key, value] of Object.entries(plain)) {
    yV.set(key, value);
  }
  return yV;
}

function flowToYMap(flow: FlowControl): Y.Map<unknown> {
  const yF = new Y.Map<unknown>();
  const plain = JSON.parse(JSON.stringify(flow));
  for (const [key, value] of Object.entries(plain)) {
    yF.set(key, value);
  }
  return yF;
}

// ---------------------------------------------------------------------------
// Sub-converters: Y.Map -> data
// ---------------------------------------------------------------------------

function yMapToPage(yPage: Y.Map<unknown>): Page {
  const yBlocks = yPage.get('blocks') as Y.Array<Y.Map<unknown>> | undefined;
  const blocks: Block[] = yBlocks ? yBlocks.toArray().map(yMapToBlock) : [];

  return {
    id: (yPage.get('id') as string) ?? '',
    name: (yPage.get('name') as string) ?? '',
    blocks,
    layout: yPage.get('layout') as Page['layout'],
    conditions: yPage.get('conditions') as Page['conditions'],
    script: yPage.get('script') as string | undefined,
  };
}

function yMapToBlock(yBlock: Y.Map<unknown>): Block {
  const yQuestions = yBlock.get('questions') as Y.Array<string> | undefined;
  const questions: string[] = yQuestions ? yQuestions.toArray() : [];

  return {
    id: (yBlock.get('id') as string) ?? '',
    pageId: (yBlock.get('pageId') as string) ?? '',
    name: (yBlock.get('name') as string) ?? '',
    type: (yBlock.get('type') as Block['type']) ?? 'standard',
    questions,
    randomization: yBlock.get('randomization') as Block['randomization'],
    loop: yBlock.get('loop') as Block['loop'],
    conditions: yBlock.get('conditions') as Block['conditions'],
    condition: yBlock.get('condition') as string | undefined,
  };
}

function yMapToQuestion(yQ: Y.Map<unknown>): Question {
  const plain: Record<string, unknown> = {};
  yQ.forEach((value, key) => {
    plain[key] = value;
  });
  return plain as unknown as Question;
}

function yMapToVariable(yV: Y.Map<unknown>): Variable {
  const plain: Record<string, unknown> = {};
  yV.forEach((value, key) => {
    plain[key] = value;
  });
  return plain as unknown as Variable;
}

function yMapToFlow(yF: Y.Map<unknown>): FlowControl {
  const plain: Record<string, unknown> = {};
  yF.forEach((value, key) => {
    plain[key] = value;
  });
  return plain as unknown as FlowControl;
}
