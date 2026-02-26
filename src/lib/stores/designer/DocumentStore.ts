import { generateId } from '$lib/shared/utils/id';
import { QuestionFactory } from '$lib/shared/factories/question-factory';
import {
  QuestionTypes,
  type Block,
  type FlowControl,
  type Page,
  type Question,
  type QuestionType,
  type Questionnaire,
  type Variable,
} from '$lib/shared/types/questionnaire';

export interface ValidationFinding {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface DocumentValidationResult {
  valid: boolean;
  validationErrors: ValidationFinding[];
  warnings: ValidationFinding[];
}

export interface NewQuestionnaireOptions {
  id?: string;
  name?: string;
  description?: string;
  organizationId?: string;
  projectId?: string;
  version?: string;
}

interface QuestionInsertResult {
  questionnaire: Questionnaire;
  questionId: string;
  pageId: string;
  blockId: string;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Svelte state proxies are not always structured-cloneable.
      // JSON fallback keeps designer mutations operational.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function asDate(input: unknown): Date {
  if (input instanceof Date) return input;
  if (typeof input === 'string' || typeof input === 'number') {
    const date = new Date(input);
    if (!Number.isNaN(date.valueOf())) return date;
  }
  return new Date();
}

export class DocumentStore {
  public createEmptyQuestionnaire(options: NewQuestionnaireOptions = {}): Questionnaire {
    const pageId = generateId('page');
    const blockId = generateId('block');
    const now = new Date();

    return {
      id: options.id || '',
      name: options.name?.trim() || 'Untitled Questionnaire',
      description: options.description || '',
      organizationId: options.organizationId,
      projectId: options.projectId,
      version: options.version || '1.0.0',
      created: now,
      modified: now,
      variables: [],
      questions: [],
      pages: [
        {
          id: pageId,
          name: 'Page 1',
          blocks: [
            {
              id: blockId,
              pageId,
              name: 'Block 1',
              type: 'standard',
              questions: [],
            },
          ],
        },
      ],
      flow: [],
      settings: {
        allowBackNavigation: false,
        showProgressBar: true,
        saveProgress: true,
        webgl: {
          targetFPS: 120,
        },
      },
      metadata: {
        created: Date.now(),
        modified: Date.now(),
        version: options.version || '1.0.0',
      },
    };
  }

  public normalizeQuestionnaire(input: any): Questionnaire {
    const source = input?.definition || input?.content || input || {};
    const fallback = this.createEmptyQuestionnaire({
      id: input?.id,
      name: source?.name,
      description: source?.description,
      organizationId: input?.organizationId || input?.organization_id || source?.organizationId,
      projectId: input?.projectId || input?.project_id || source?.projectId,
      version: source?.version,
    });

    const normalized = deepClone(fallback);

    normalized.id = input?.id || source?.id || normalized.id;
    normalized.name = source?.name || input?.name || normalized.name;
    normalized.description = source?.description || input?.description || normalized.description;
    normalized.organizationId =
      input?.organizationId || input?.organization_id || source?.organizationId || normalized.organizationId;
    normalized.projectId = input?.projectId || input?.project_id || source?.projectId || normalized.projectId;
    normalized.version = source?.version || normalized.version;
    normalized.created = asDate(source?.created || input?.created || input?.created_at || normalized.created);
    normalized.modified = asDate(source?.modified || input?.modified || input?.updated_at || normalized.modified);
    normalized.settings = {
      ...normalized.settings,
      ...(source?.settings || {}),
    };

    normalized.variables = Array.isArray(source?.variables) ? deepClone(source.variables) : [];
    normalized.questions = Array.isArray(source?.questions) ? deepClone(source.questions) : [];
    normalized.flow = Array.isArray(source?.flow) ? deepClone(source.flow) : [];

    normalized.pages = this.normalizePages(source?.pages, normalized.questions);

    this.ensureStructureIntegrity(normalized);
    this.normalizeQuestionOrders(normalized);

    return normalized;
  }

  public addPage(questionnaire: Questionnaire, name?: string): { questionnaire: Questionnaire; pageId: string } {
    const next = deepClone(questionnaire);
    const pageId = generateId('page');
    const blockId = generateId('block');

    next.pages.push({
      id: pageId,
      name: name?.trim() || `Page ${next.pages.length + 1}`,
      blocks: [
        {
          id: blockId,
          pageId,
          name: 'Block 1',
          type: 'standard',
          questions: [],
        },
      ],
    });

    this.touch(next);
    return { questionnaire: next, pageId };
  }

  public updatePage(
    questionnaire: Questionnaire,
    pageId: string,
    updates: Partial<Page>
  ): Questionnaire {
    const next = deepClone(questionnaire);
    const page = next.pages.find((candidate) => candidate.id === pageId);
    if (!page) return questionnaire;

    Object.assign(page, updates);
    this.touch(next);
    return next;
  }

  public addBlock(
    questionnaire: Questionnaire,
    pageId: string,
    type: Block['type'] = 'standard',
    name?: string
  ): { questionnaire: Questionnaire; blockId: string } {
    const next = deepClone(questionnaire);
    const page = next.pages.find((candidate) => candidate.id === pageId);
    if (!page) {
      return { questionnaire, blockId: '' };
    }

    if (!page.blocks) page.blocks = [];

    const blockId = generateId('block');
    page.blocks.push({
      id: blockId,
      pageId,
      type,
      name: name?.trim() || `Block ${page.blocks.length + 1}`,
      questions: [],
    });

    this.touch(next);
    return { questionnaire: next, blockId };
  }

  public updateBlock(
    questionnaire: Questionnaire,
    blockId: string,
    updates: Partial<Block>
  ): Questionnaire {
    const next = deepClone(questionnaire);
    const located = this.findBlock(next, blockId);
    if (!located) return questionnaire;

    Object.assign(located.block, updates);
    this.touch(next);
    return next;
  }

  public deleteBlock(questionnaire: Questionnaire, blockId: string): Questionnaire {
    const next = deepClone(questionnaire);
    const located = this.findBlock(next, blockId);
    if (!located) return questionnaire;

    const questionIds = new Set(located.block.questions || []);
    located.page.blocks = (located.page.blocks || []).filter((candidate) => candidate.id !== blockId);

    if (located.page.blocks.length === 0) {
      const replacement = {
        id: generateId('block'),
        pageId: located.page.id,
        name: 'Block 1',
        type: 'standard' as const,
        questions: [],
      };
      located.page.blocks.push(replacement);
    }

    if (questionIds.size > 0) {
      next.questions = next.questions.filter((question) => !questionIds.has(question.id));
      for (const page of next.pages) {
        for (const block of page.blocks || []) {
          block.questions = (block.questions || []).filter((id) => !questionIds.has(id));
        }
      }
    }

    this.normalizeQuestionOrders(next);
    this.touch(next);
    return next;
  }

  public updateBlockQuestions(
    questionnaire: Questionnaire,
    blockId: string,
    questionIds: string[]
  ): Questionnaire {
    const next = deepClone(questionnaire);
    const located = this.findBlock(next, blockId);
    if (!located) return questionnaire;

    const validQuestionIds = questionIds.filter((id, index, ids) => {
      const exists = next.questions.some((question) => question.id === id);
      return exists && ids.indexOf(id) === index;
    });

    located.block.questions = validQuestionIds;
    this.touch(next);
    return next;
  }

  public reorderQuestionsInBlock(
    questionnaire: Questionnaire,
    blockId: string,
    fromIndex: number,
    toIndex: number
  ): Questionnaire {
    const next = deepClone(questionnaire);
    const located = this.findBlock(next, blockId);
    if (!located) return questionnaire;

    const list = [...(located.block.questions || [])];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length ||
      fromIndex === toIndex
    ) {
      return questionnaire;
    }

    const [moved] = list.splice(fromIndex, 1);
    if (!moved) return questionnaire;
    list.splice(toIndex, 0, moved);
    located.block.questions = list;

    this.touch(next);
    return next;
  }

  public addQuestion(
    questionnaire: Questionnaire,
    containerId: string,
    type: string
  ): QuestionInsertResult {
    const next = deepClone(questionnaire);
    this.ensureStructureIntegrity(next);

    const created = this.createQuestion(type, next.questions.length);

    let located = this.findBlock(next, containerId);
    if (!located) {
      const page = next.pages.find((candidate) => candidate.id === containerId) || next.pages[0];
      if (!page) {
        const seed = this.createEmptyQuestionnaire();
        next.pages = seed.pages;
      }

      const resolvedPage = page || next.pages[0]!;
      if (!resolvedPage.blocks || resolvedPage.blocks.length === 0) {
        resolvedPage.blocks = [
          {
            id: generateId('block'),
            pageId: resolvedPage.id,
            name: 'Block 1',
            type: 'standard',
            questions: [],
          },
        ];
      }
      located = {
        page: resolvedPage,
        block: resolvedPage.blocks[0]!,
      };
    }

    next.questions.push(created);
    located.block.questions = [...(located.block.questions || []), created.id];
    this.normalizeQuestionOrders(next);
    this.touch(next);

    return {
      questionnaire: next,
      questionId: created.id,
      pageId: located.page.id,
      blockId: located.block.id,
    };
  }

  public updateQuestion(
    questionnaire: Questionnaire,
    questionId: string,
    updates: Partial<Question>
  ): Questionnaire {
    const next = deepClone(questionnaire);
    const index = next.questions.findIndex((question) => question.id === questionId);
    if (index === -1) return questionnaire;

    const current = next.questions[index];
    if (!current) return questionnaire;

    next.questions[index] = {
      ...current,
      ...updates,
    } as Question;

    this.touch(next);
    return next;
  }

  public duplicateQuestion(questionnaire: Questionnaire, questionId: string): QuestionInsertResult | null {
    const next = deepClone(questionnaire);
    const source = next.questions.find((question) => question.id === questionId);
    if (!source) return null;

    let clone: Question;
    try {
      clone = QuestionFactory.clone(source as Question);
    } catch {
      clone = {
        ...(deepClone(source) as Question),
        id: generateId('q'),
      } as Question;
    }

    clone.order = next.questions.length;
    next.questions.push(clone);

    let located = this.findBlockContainingQuestion(next, questionId);
    if (!located) {
      this.ensureStructureIntegrity(next);
      located = {
        page: next.pages[0]!,
        block: next.pages[0]!.blocks![0]!,
      };
    }

    const sourceIndex = located.block.questions.findIndex((id) => id === questionId);
    if (sourceIndex >= 0) {
      const nextIds = [...located.block.questions];
      nextIds.splice(sourceIndex + 1, 0, clone.id);
      located.block.questions = nextIds;
    } else {
      located.block.questions.push(clone.id);
    }

    this.normalizeQuestionOrders(next);
    this.touch(next);

    return {
      questionnaire: next,
      questionId: clone.id,
      pageId: located.page.id,
      blockId: located.block.id,
    };
  }

  public deleteQuestion(questionnaire: Questionnaire, questionId: string): Questionnaire {
    const next = deepClone(questionnaire);
    const exists = next.questions.some((question) => question.id === questionId);
    if (!exists) return questionnaire;

    next.questions = next.questions.filter((question) => question.id !== questionId);

    for (const page of next.pages) {
      if (Array.isArray(page.questions)) {
        page.questions = page.questions.filter((id) => id !== questionId);
      }

      for (const block of page.blocks || []) {
        block.questions = (block.questions || []).filter((id) => id !== questionId);
      }
    }

    this.normalizeQuestionOrders(next);
    this.touch(next);
    return next;
  }

  public addVariable(questionnaire: Questionnaire, variable: Variable): Questionnaire {
    const next = deepClone(questionnaire);
    const prepared: Variable = {
      ...variable,
      id: variable.id || generateId('var'),
    };

    next.variables.push(prepared);
    this.touch(next);
    return next;
  }

  public updateVariable(
    questionnaire: Questionnaire,
    variableId: string,
    updates: Partial<Variable>
  ): Questionnaire {
    const next = deepClone(questionnaire);
    const index = next.variables.findIndex((variable) => variable.id === variableId);
    if (index === -1) return questionnaire;

    next.variables[index] = {
      ...next.variables[index],
      ...updates,
    } as Variable;

    this.touch(next);
    return next;
  }

  public deleteVariable(questionnaire: Questionnaire, variableId: string): Questionnaire {
    const next = deepClone(questionnaire);
    next.variables = next.variables.filter((variable) => variable.id !== variableId);
    this.touch(next);
    return next;
  }

  public addFlowControl(questionnaire: Questionnaire, flow: FlowControl): Questionnaire {
    const next = deepClone(questionnaire);
    next.flow = [...(next.flow || []), flow];
    this.touch(next);
    return next;
  }

  public updateQuestionnaire(
    questionnaire: Questionnaire,
    updates: Partial<Questionnaire>
  ): Questionnaire {
    const next = {
      ...deepClone(questionnaire),
      ...deepClone(updates),
    };

    this.ensureStructureIntegrity(next);
    this.normalizeQuestionOrders(next);
    this.touch(next);
    return next;
  }

  public validate(questionnaire: Questionnaire): DocumentValidationResult {
    const errors: ValidationFinding[] = [];
    const warnings: ValidationFinding[] = [];

    if (!questionnaire.name?.trim()) {
      errors.push({
        field: 'questionnaire.name',
        message: 'Questionnaire name is required.',
        severity: 'error',
      });
    }

    if (!Array.isArray(questionnaire.pages) || questionnaire.pages.length === 0) {
      errors.push({
        field: 'questionnaire.pages',
        message: 'At least one page is required.',
        severity: 'error',
      });
    }

    const questionIds = new Set(questionnaire.questions.map((question) => question.id));

    questionnaire.pages.forEach((page, pageIndex) => {
      if (!Array.isArray(page.blocks) || page.blocks.length === 0) {
        warnings.push({
          field: `pages[${pageIndex}].blocks`,
          message: `Page \"${page.name || page.id}\" has no blocks.`,
          severity: 'warning',
        });
        return;
      }

      page.blocks.forEach((block, blockIndex) => {
        if (!Array.isArray(block.questions) || block.questions.length === 0) {
          warnings.push({
            field: `pages[${pageIndex}].blocks[${blockIndex}].questions`,
            message: `Block \"${block.name || block.id}\" has no questions.`,
            severity: 'warning',
          });
          return;
        }

        for (const id of block.questions) {
          if (!questionIds.has(id)) {
            errors.push({
              field: `pages[${pageIndex}].blocks[${blockIndex}].questions`,
              message: `Question ID \"${id}\" is referenced but missing from questionnaire.questions.`,
              severity: 'error',
            });
          }
        }
      });
    });

    const duplicateVariables = this.findDuplicates(questionnaire.variables.map((variable) => variable.name));
    for (const name of duplicateVariables) {
      errors.push({
        field: 'questionnaire.variables',
        message: `Variable name \"${name}\" is duplicated.`,
        severity: 'error',
      });
    }

    return {
      valid: errors.length === 0,
      validationErrors: errors,
      warnings,
    };
  }

  public exportQuestionnaire(questionnaire: Questionnaire): Questionnaire {
    return deepClone(questionnaire);
  }

  private normalizePages(rawPages: unknown, questions: Question[]): Page[] {
    if (!Array.isArray(rawPages) || rawPages.length === 0) {
      return this.createEmptyQuestionnaire().pages;
    }

    const questionIdSet = new Set(questions.map((question) => question.id));

    return rawPages.map((rawPage, pageIndex) => {
      const sourcePage = (rawPage || {}) as Record<string, any>;
      const pageId = sourcePage.id || generateId('page');

      let blocks = Array.isArray(sourcePage.blocks) ? deepClone(sourcePage.blocks) : [];

      if (blocks.length === 0) {
        const pageQuestions = Array.isArray(sourcePage.questions)
          ? sourcePage.questions.filter((id: string) => questionIdSet.has(id))
          : [];

        blocks = [
          {
            id: generateId('block'),
            pageId,
            name: 'Block 1',
            type: 'standard',
            questions: pageQuestions,
          },
        ];
      }

      const normalizedBlocks: Block[] = blocks.map((rawBlock: any, blockIndex: number) => ({
        id: rawBlock.id || generateId('block'),
        pageId,
        name: rawBlock.name || rawBlock.title || `Block ${blockIndex + 1}`,
        type: this.normalizeBlockType(rawBlock.type),
        questions: Array.isArray(rawBlock.questions)
          ? rawBlock.questions.filter((id: string) => questionIdSet.has(id))
          : [],
        randomization: rawBlock.randomization,
        loop: rawBlock.loop,
        conditions: rawBlock.conditions,
      }));

      return {
        id: pageId,
        name: sourcePage.name || sourcePage.title || `Page ${pageIndex + 1}`,
        questions: Array.isArray(sourcePage.questions) ? sourcePage.questions : undefined,
        blocks: normalizedBlocks,
        layout: sourcePage.layout,
        conditions: sourcePage.conditions,
      };
    });
  }

  private normalizeBlockType(type: string): Block['type'] {
    if (type === 'randomized' || type === 'conditional' || type === 'loop' || type === 'standard') {
      return type;
    }
    return 'standard';
  }

  private ensureStructureIntegrity(questionnaire: Questionnaire): void {
    if (!Array.isArray(questionnaire.pages) || questionnaire.pages.length === 0) {
      questionnaire.pages = this.createEmptyQuestionnaire().pages;
    }

    questionnaire.pages.forEach((page, pageIndex) => {
      if (!page.id) page.id = generateId('page');
      if (!page.name) page.name = `Page ${pageIndex + 1}`;
      if (!Array.isArray(page.blocks) || page.blocks.length === 0) {
        page.blocks = [
          {
            id: generateId('block'),
            pageId: page.id,
            name: 'Block 1',
            type: 'standard',
            questions: [],
          },
        ];
      }

      page.blocks = page.blocks.map((block, blockIndex) => ({
        ...block,
        id: block.id || generateId('block'),
        pageId: page.id,
        name: block.name || `Block ${blockIndex + 1}`,
        type: this.normalizeBlockType(block.type),
        questions: Array.isArray(block.questions) ? block.questions : [],
      }));
    });

    if (!Array.isArray(questionnaire.questions)) {
      questionnaire.questions = [];
    }

    if (!Array.isArray(questionnaire.variables)) {
      questionnaire.variables = [];
    }

    if (!Array.isArray(questionnaire.flow)) {
      questionnaire.flow = [];
    }
  }

  private normalizeQuestionOrders(questionnaire: Questionnaire): void {
    questionnaire.questions = questionnaire.questions.map((question, index) => ({
      ...question,
      order: index,
      required: question.required ?? false,
      responseType: this.ensureResponseType(question as Question),
    }));
  }

  private ensureResponseType(question: Question): any {
    const existing = (question as any).responseType;
    if (existing?.type) {
      return existing;
    }

    const normalizeOptions = (
      input: any
    ): Array<{ value: string | number | boolean; label: string; key?: string }> => {
      if (!Array.isArray(input)) return [];
      return input
        .map((option: any) => {
          if (option === null || option === undefined) return null;
          const rawValue = option.value ?? option.id ?? option.label;
          if (rawValue === undefined || rawValue === null) return null;
          return {
            value: rawValue,
            label: String(option.label ?? rawValue),
            key: option.key,
          };
        })
        .filter(
          (
            option
          ): option is { value: string | number | boolean; label: string; key?: string } =>
            option !== null
        );
    };

    const legacyResponse = (question as any).response;
    const displayOptions = (question as any).display?.options;

    if (legacyResponse?.type) {
      const type = String(legacyResponse.type);
      if (type === 'single' || type === 'radio') {
        return {
          type: 'single',
          options: normalizeOptions(legacyResponse.options || displayOptions),
        };
      }

      if (type === 'multiple' || type === 'checkbox') {
        return {
          type: 'multiple',
          options: normalizeOptions(legacyResponse.options || displayOptions),
        };
      }

      if (type === 'text') {
        return {
          type: 'text',
          minLength: legacyResponse.minLength,
          maxLength: legacyResponse.maxLength,
        };
      }

      if (type === 'number') {
        return {
          type: 'number',
          min: legacyResponse.min,
          max: legacyResponse.max,
        };
      }

      if (type === 'scale') {
        return {
          type: 'scale',
          min: legacyResponse.min ?? 1,
          max: legacyResponse.max ?? 5,
          minLabel: legacyResponse.minLabel,
          maxLabel: legacyResponse.maxLabel,
        };
      }

      if (type === 'keypress') {
        return {
          type: 'keypress',
          keys: Array.isArray(legacyResponse.keys) ? legacyResponse.keys : [],
        };
      }

      if (type === 'none') {
        return {
          type: 'none',
          delay: legacyResponse.delay ?? 0,
        };
      }
    }

    if (question.type === QuestionTypes.TEXT_INPUT) {
      return { type: 'text' };
    }

    if (question.type === QuestionTypes.NUMBER_INPUT) {
      return { type: 'number' };
    }

    if (question.type === QuestionTypes.SINGLE_CHOICE) {
      return {
        type: 'single',
        options: normalizeOptions(displayOptions),
      };
    }

    if (question.type === QuestionTypes.MULTIPLE_CHOICE) {
      return {
        type: 'single',
        options: normalizeOptions(displayOptions),
      };
    }

    if (question.type === QuestionTypes.SCALE || question.type === QuestionTypes.RATING) {
      return {
        type: 'scale',
        min: 1,
        max: 5,
      };
    }

    if (question.type === QuestionTypes.REACTION_TIME) {
      return {
        type: 'keypress',
        keys: ['space'],
      };
    }

    return { type: 'none', delay: 0 };
  }

  private createQuestion(type: string, order: number): Question {
    const normalizedType = this.normalizeQuestionType(type);

    try {
      const created = QuestionFactory.create(normalizedType);
      return {
        ...created,
        id: created.id || generateId('q'),
        type: normalizedType,
        order,
        required: created.required ?? false,
      } as Question;
    } catch {
      return {
        id: generateId('q'),
        type: QuestionTypes.TEXT_INPUT,
        order,
        required: false,
        display: {
          prompt: 'New question',
          placeholder: 'Enter your response...',
        },
        response: {
          saveAs: `q_${order + 1}`,
          transform: 'none',
        },
      } as Question;
    }
  }

  private normalizeQuestionType(type: string): QuestionType {
    const availableTypes = Object.values(QuestionTypes);
    if (availableTypes.includes(type as QuestionType)) {
      return type as QuestionType;
    }

    if (type === 'text') return QuestionTypes.TEXT_INPUT;
    if (type === 'instruction') return QuestionTypes.INSTRUCTION;
    if (type === 'choice') return QuestionTypes.SINGLE_CHOICE;

    return QuestionTypes.TEXT_INPUT;
  }

  private findBlock(
    questionnaire: Questionnaire,
    blockId: string
  ): { page: Page; block: Block } | null {
    for (const page of questionnaire.pages) {
      for (const block of page.blocks || []) {
        if (block.id === blockId) {
          return { page, block };
        }
      }
    }
    return null;
  }

  private findBlockContainingQuestion(
    questionnaire: Questionnaire,
    questionId: string
  ): { page: Page; block: Block } | null {
    for (const page of questionnaire.pages) {
      for (const block of page.blocks || []) {
        if ((block.questions || []).includes(questionId)) {
          return { page, block };
        }
      }
    }
    return null;
  }

  private findDuplicates(values: string[]): string[] {
    const counts = new Map<string, number>();
    for (const value of values) {
      const normalized = value?.trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value);
  }

  private touch(questionnaire: Questionnaire): void {
    questionnaire.modified = new Date();
    questionnaire.metadata = {
      ...(questionnaire.metadata || {}),
      modified: Date.now(),
    };
  }
}
