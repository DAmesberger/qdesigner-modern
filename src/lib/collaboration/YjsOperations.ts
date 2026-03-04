/**
 * YjsOperations — translates each DocumentStore operation into
 * Y.Doc mutations, ensuring CRDT-safe collaborative editing.
 *
 * Each method mutates the Y.Doc directly within a transaction.
 * The Y.Doc's update events then propagate changes to peers.
 */

import * as Y from 'yjs';
import { generateId } from '$lib/shared/utils/id';
import type {
  Block,
  FlowControl,
  Page,
  Question,
  Variable,
} from '$lib/shared/types/questionnaire';

// ---------------------------------------------------------------------------
// Meta operations
// ---------------------------------------------------------------------------

export function updateMeta(
  doc: Y.Doc,
  updates: Record<string, unknown>,
): void {
  const meta = doc.getMap('meta');
  doc.transact(() => {
    for (const [key, value] of Object.entries(updates)) {
      meta.set(key, value);
    }
    meta.set('modified', new Date().toISOString());
  });
}

// ---------------------------------------------------------------------------
// Page operations
// ---------------------------------------------------------------------------

export function addPage(doc: Y.Doc, name?: string): string {
  const pages = doc.getArray<Y.Map<unknown>>('pages');
  const pageId = generateId('page');
  const blockId = generateId('block');

  doc.transact(() => {
    const yPage = new Y.Map<unknown>();
    yPage.set('id', pageId);
    yPage.set('name', name?.trim() || `Page ${pages.length + 1}`);

    const yBlocks = new Y.Array<Y.Map<unknown>>();
    const yBlock = new Y.Map<unknown>();
    yBlock.set('id', blockId);
    yBlock.set('pageId', pageId);
    yBlock.set('name', 'Block 1');
    yBlock.set('type', 'standard');
    yBlock.set('questions', new Y.Array<string>());
    yBlocks.push([yBlock]);

    yPage.set('blocks', yBlocks);
    pages.push([yPage]);
    touchMeta(doc);
  });

  return pageId;
}

export function updatePage(
  doc: Y.Doc,
  pageId: string,
  updates: Partial<Page>,
): void {
  const yPage = findPage(doc, pageId);
  if (!yPage) return;

  doc.transact(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'blocks') continue; // Blocks are managed separately
      yPage.set(key, value);
    }
    touchMeta(doc);
  });
}

export function deletePage(doc: Y.Doc, pageId: string): void {
  const pages = doc.getArray<Y.Map<unknown>>('pages');
  const index = findPageIndex(doc, pageId);
  if (index === -1) return;

  doc.transact(() => {
    // Remove questions that belong to this page's blocks
    const yPage = pages.get(index);
    const yBlocks = yPage.get('blocks') as Y.Array<Y.Map<unknown>> | undefined;
    if (yBlocks) {
      const questions = doc.getMap<Y.Map<unknown>>('questions');
      for (let i = 0; i < yBlocks.length; i++) {
        const block = yBlocks.get(i);
        const qIds = block.get('questions') as Y.Array<string> | undefined;
        if (qIds) {
          for (let j = 0; j < qIds.length; j++) {
            questions.delete(qIds.get(j));
          }
        }
      }
    }

    pages.delete(index, 1);
    touchMeta(doc);
  });
}

// ---------------------------------------------------------------------------
// Block operations
// ---------------------------------------------------------------------------

export function addBlock(
  doc: Y.Doc,
  pageId: string,
  type: Block['type'] = 'standard',
  name?: string,
): string {
  const yPage = findPage(doc, pageId);
  if (!yPage) return '';

  const blockId = generateId('block');

  doc.transact(() => {
    let yBlocks = yPage.get('blocks') as Y.Array<Y.Map<unknown>> | undefined;
    if (!yBlocks) {
      yBlocks = new Y.Array<Y.Map<unknown>>();
      yPage.set('blocks', yBlocks);
    }

    const yBlock = new Y.Map<unknown>();
    yBlock.set('id', blockId);
    yBlock.set('pageId', pageId);
    yBlock.set('name', name?.trim() || `Block ${yBlocks.length + 1}`);
    yBlock.set('type', type);
    yBlock.set('questions', new Y.Array<string>());
    yBlocks.push([yBlock]);
    touchMeta(doc);
  });

  return blockId;
}

export function updateBlock(
  doc: Y.Doc,
  blockId: string,
  updates: Partial<Block>,
): void {
  const yBlock = findBlock(doc, blockId);
  if (!yBlock) return;

  doc.transact(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'questions') continue; // Managed separately
      yBlock.set(key, value);
    }
    touchMeta(doc);
  });
}

export function deleteBlock(doc: Y.Doc, blockId: string): void {
  const pages = doc.getArray<Y.Map<unknown>>('pages');

  doc.transact(() => {
    for (let pi = 0; pi < pages.length; pi++) {
      const yPage = pages.get(pi);
      const yBlocks = yPage.get('blocks') as Y.Array<Y.Map<unknown>> | undefined;
      if (!yBlocks) continue;

      for (let bi = 0; bi < yBlocks.length; bi++) {
        const block = yBlocks.get(bi);
        if (block.get('id') === blockId) {
          // Remove associated questions
          const questions = doc.getMap<Y.Map<unknown>>('questions');
          const qIds = block.get('questions') as Y.Array<string> | undefined;
          if (qIds) {
            for (let qi = 0; qi < qIds.length; qi++) {
              questions.delete(qIds.get(qi));
            }
          }

          yBlocks.delete(bi, 1);

          // Ensure at least one block remains
          if (yBlocks.length === 0) {
            const replacement = new Y.Map<unknown>();
            replacement.set('id', generateId('block'));
            replacement.set('pageId', yPage.get('id'));
            replacement.set('name', 'Block 1');
            replacement.set('type', 'standard');
            replacement.set('questions', new Y.Array<string>());
            yBlocks.push([replacement]);
          }

          touchMeta(doc);
          return;
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Question operations
// ---------------------------------------------------------------------------

export function addQuestion(
  doc: Y.Doc,
  blockId: string,
  question: Question,
): void {
  const yBlock = findBlock(doc, blockId);
  if (!yBlock) return;

  doc.transact(() => {
    // Add to questions map
    const questions = doc.getMap<Y.Map<unknown>>('questions');
    const yQ = new Y.Map<unknown>();
    const plain = JSON.parse(JSON.stringify(question));
    for (const [key, value] of Object.entries(plain)) {
      yQ.set(key, value);
    }
    questions.set(question.id, yQ);

    // Add reference to block
    const qIds = yBlock.get('questions') as Y.Array<string>;
    qIds.push([question.id]);

    touchMeta(doc);
  });
}

export function updateQuestion(
  doc: Y.Doc,
  questionId: string,
  updates: Partial<Question>,
): void {
  const questions = doc.getMap<Y.Map<unknown>>('questions');
  const yQ = questions.get(questionId);
  if (!yQ) return;

  doc.transact(() => {
    const plain = JSON.parse(JSON.stringify(updates));
    for (const [key, value] of Object.entries(plain)) {
      yQ.set(key, value);
    }
    touchMeta(doc);
  });
}

export function deleteQuestion(doc: Y.Doc, questionId: string): void {
  doc.transact(() => {
    // Remove from questions map
    const questions = doc.getMap<Y.Map<unknown>>('questions');
    questions.delete(questionId);

    // Remove from all block references
    const pages = doc.getArray<Y.Map<unknown>>('pages');
    for (let pi = 0; pi < pages.length; pi++) {
      const yPage = pages.get(pi);
      const yBlocks = yPage.get('blocks') as Y.Array<Y.Map<unknown>> | undefined;
      if (!yBlocks) continue;

      for (let bi = 0; bi < yBlocks.length; bi++) {
        const block = yBlocks.get(bi);
        const qIds = block.get('questions') as Y.Array<string> | undefined;
        if (!qIds) continue;

        for (let qi = qIds.length - 1; qi >= 0; qi--) {
          if (qIds.get(qi) === questionId) {
            qIds.delete(qi, 1);
          }
        }
      }
    }

    touchMeta(doc);
  });
}

export function reorderQuestionsInBlock(
  doc: Y.Doc,
  blockId: string,
  fromIndex: number,
  toIndex: number,
): void {
  const yBlock = findBlock(doc, blockId);
  if (!yBlock) return;

  const qIds = yBlock.get('questions') as Y.Array<string> | undefined;
  if (!qIds || fromIndex < 0 || toIndex < 0 || fromIndex >= qIds.length || toIndex >= qIds.length) {
    return;
  }

  doc.transact(() => {
    const id = qIds.get(fromIndex);
    qIds.delete(fromIndex, 1);
    qIds.insert(toIndex, [id]);
    touchMeta(doc);
  });
}

// ---------------------------------------------------------------------------
// Variable operations
// ---------------------------------------------------------------------------

export function addVariable(doc: Y.Doc, variable: Variable): void {
  const variables = doc.getArray<Y.Map<unknown>>('variables');

  doc.transact(() => {
    const yV = new Y.Map<unknown>();
    const plain = JSON.parse(JSON.stringify(variable));
    for (const [key, value] of Object.entries(plain)) {
      yV.set(key, value);
    }
    variables.push([yV]);
    touchMeta(doc);
  });
}

export function updateVariable(
  doc: Y.Doc,
  variableId: string,
  updates: Partial<Variable>,
): void {
  const variables = doc.getArray<Y.Map<unknown>>('variables');

  doc.transact(() => {
    for (let i = 0; i < variables.length; i++) {
      const yV = variables.get(i);
      if (yV.get('id') === variableId) {
        const plain = JSON.parse(JSON.stringify(updates));
        for (const [key, value] of Object.entries(plain)) {
          yV.set(key, value);
        }
        break;
      }
    }
    touchMeta(doc);
  });
}

export function deleteVariable(doc: Y.Doc, variableId: string): void {
  const variables = doc.getArray<Y.Map<unknown>>('variables');

  doc.transact(() => {
    for (let i = 0; i < variables.length; i++) {
      const yV = variables.get(i);
      if (yV.get('id') === variableId) {
        variables.delete(i, 1);
        break;
      }
    }
    touchMeta(doc);
  });
}

// ---------------------------------------------------------------------------
// Flow control operations
// ---------------------------------------------------------------------------

export function addFlowControl(doc: Y.Doc, flow: FlowControl): void {
  const flowArr = doc.getArray<Y.Map<unknown>>('flow');

  doc.transact(() => {
    const yF = new Y.Map<unknown>();
    const plain = JSON.parse(JSON.stringify(flow));
    for (const [key, value] of Object.entries(plain)) {
      yF.set(key, value);
    }
    flowArr.push([yF]);
    touchMeta(doc);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function touchMeta(doc: Y.Doc): void {
  const meta = doc.getMap('meta');
  meta.set('modified', new Date().toISOString());
}

function findPage(doc: Y.Doc, pageId: string): Y.Map<unknown> | null {
  const pages = doc.getArray<Y.Map<unknown>>('pages');
  for (let i = 0; i < pages.length; i++) {
    const yPage = pages.get(i);
    if (yPage.get('id') === pageId) return yPage;
  }
  return null;
}

function findPageIndex(doc: Y.Doc, pageId: string): number {
  const pages = doc.getArray<Y.Map<unknown>>('pages');
  for (let i = 0; i < pages.length; i++) {
    if (pages.get(i).get('id') === pageId) return i;
  }
  return -1;
}

function findBlock(doc: Y.Doc, blockId: string): Y.Map<unknown> | null {
  const pages = doc.getArray<Y.Map<unknown>>('pages');
  for (let i = 0; i < pages.length; i++) {
    const yPage = pages.get(i);
    const yBlocks = yPage.get('blocks') as Y.Array<Y.Map<unknown>> | undefined;
    if (!yBlocks) continue;
    for (let j = 0; j < yBlocks.length; j++) {
      const block = yBlocks.get(j);
      if (block.get('id') === blockId) return block;
    }
  }
  return null;
}
