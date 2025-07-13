// Type-specific handlers for different designer items
// This provides a clean separation of concerns and type safety

import type { 
  Question, 
  Page, 
  Variable, 
  FlowControl, 
  Block,
  QuestionSettings,
  PageSettings 
} from '$lib/shared/types/questionnaire';
import { designerStore } from '../stores/designerStore';

// Base interface for item handlers
interface ItemHandler<T> {
  getDisplayName(): string;
  getIcon(): string;
  canHaveSettings(): boolean;
  getSettings(): Record<string, any>;
  updateSettings?(settings: Partial<Record<string, any>>): void;
  getProperties(): Record<string, any>;
  validate(): string[];
}

// Question handler
export class QuestionHandler implements ItemHandler<Question> {
  constructor(private question: Question) {}

  getDisplayName(): string {
    return this.question.name || this.question.text || `Question ${this.question.id}`;
  }

  getIcon(): string {
    const iconMap: Record<string, string> = {
      text: 'mdi:form-textbox',
      choice: 'mdi:radiobox-marked',
      scale: 'mdi:gauge',
      rating: 'mdi:star',
      reaction: 'mdi:timer',
      multimedia: 'mdi:image',
      instruction: 'mdi:information',
      webgl: 'mdi:cube-outline',
      custom: 'mdi:puzzle'
    };
    return iconMap[this.question.type] || 'mdi:help-circle';
  }

  canHaveSettings(): boolean {
    return true;
  }

  getSettings(): QuestionSettings {
    return this.question.settings || {};
  }

  updateSettings(settings: Partial<QuestionSettings>): void {
    designerStore.updateQuestion(this.question.id, {
      settings: {
        ...this.getSettings(),
        ...settings
      }
    });
  }

  getProperties(): Record<string, any> {
    return {
      id: this.question.id,
      type: this.question.type,
      text: this.question.text,
      required: this.question.required,
      responseType: this.question.responseType
    };
  }

  validate(): string[] {
    const errors: string[] = [];
    if (!this.question.text && this.question.type !== 'instruction') {
      errors.push('Question text is required');
    }
    if (!this.question.responseType) {
      errors.push('Response type is required');
    }
    return errors;
  }
}

// Page handler
export class PageHandler implements ItemHandler<Page> {
  constructor(private page: Page) {}

  getDisplayName(): string {
    return this.page.title || this.page.name || `Page ${this.page.id}`;
  }

  getIcon(): string {
    return 'mdi:file-document-outline';
  }

  canHaveSettings(): boolean {
    return true;
  }

  getSettings(): PageSettings {
    return this.page.settings || {};
  }

  updateSettings(settings: Partial<PageSettings>): void {
    designerStore.updatePage(this.page.id, {
      settings: {
        ...this.getSettings(),
        ...settings
      }
    });
  }

  getProperties(): Record<string, any> {
    return {
      id: this.page.id,
      name: this.page.name,
      title: this.page.title,
      questionCount: this.page.questions?.length || 0,
      blockCount: this.page.blocks?.length || 0
    };
  }

  validate(): string[] {
    const errors: string[] = [];
    if (!this.page.questions?.length && !this.page.blocks?.length) {
      errors.push('Page must contain at least one question or block');
    }
    return errors;
  }
}

// Variable handler
export class VariableHandler implements ItemHandler<Variable> {
  constructor(private variable: Variable) {}

  getDisplayName(): string {
    return this.variable.name;
  }

  getIcon(): string {
    const iconMap: Record<string, string> = {
      number: 'mdi:numeric',
      string: 'mdi:alphabetical',
      boolean: 'mdi:toggle-switch',
      date: 'mdi:calendar',
      time: 'mdi:clock',
      array: 'mdi:code-array',
      object: 'mdi:code-braces',
      reaction_time: 'mdi:timer-outline',
      stimulus_onset: 'mdi:eye-outline'
    };
    return iconMap[this.variable.type] || 'mdi:variable';
  }

  canHaveSettings(): boolean {
    return false;
  }

  getSettings(): Record<string, any> {
    return {};
  }

  getProperties(): Record<string, any> {
    return {
      id: this.variable.id,
      name: this.variable.name,
      type: this.variable.type,
      scope: this.variable.scope,
      defaultValue: this.variable.defaultValue,
      formula: this.variable.formula
    };
  }

  validate(): string[] {
    const errors: string[] = [];
    if (!this.variable.name) {
      errors.push('Variable name is required');
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.variable.name)) {
      errors.push('Variable name must be a valid identifier');
    }
    return errors;
  }
}

// Flow control handler
export class FlowControlHandler implements ItemHandler<FlowControl> {
  constructor(private flow: FlowControl) {}

  getDisplayName(): string {
    return `${this.flow.type} flow`;
  }

  getIcon(): string {
    const iconMap: Record<string, string> = {
      branch: 'mdi:source-branch',
      loop: 'mdi:repeat',
      randomize: 'mdi:shuffle',
      terminate: 'mdi:stop-circle'
    };
    return iconMap[this.flow.type] || 'mdi:sitemap';
  }

  canHaveSettings(): boolean {
    return false;
  }

  getSettings(): Record<string, any> {
    return {};
  }

  getProperties(): Record<string, any> {
    return {
      id: this.flow.id,
      type: this.flow.type,
      condition: this.flow.condition,
      target: this.flow.target
    };
  }

  validate(): string[] {
    const errors: string[] = [];
    if (this.flow.type === 'branch' && !this.flow.condition) {
      errors.push('Branch condition is required');
    }
    return errors;
  }
}

// Block handler
export class BlockHandler implements ItemHandler<Block> {
  constructor(private block: Block) {}

  getDisplayName(): string {
    return this.block.name || `Block ${this.block.id}`;
  }

  getIcon(): string {
    const iconMap: Record<string, string> = {
      standard: 'mdi:view-list',
      randomized: 'mdi:shuffle-variant',
      conditional: 'mdi:filter',
      loop: 'mdi:repeat-variant'
    };
    return iconMap[this.block.type] || 'mdi:view-module';
  }

  canHaveSettings(): boolean {
    return false;
  }

  getSettings(): Record<string, any> {
    return {};
  }

  getProperties(): Record<string, any> {
    return {
      id: this.block.id,
      type: this.block.type,
      pageId: this.block.pageId,
      questionCount: this.block.questions.length
    };
  }

  validate(): string[] {
    const errors: string[] = [];
    if (!this.block.questions.length) {
      errors.push('Block must contain at least one question');
    }
    return errors;
  }
}

// Factory function to create the appropriate handler
export function createItemHandler(
  item: Question | Page | Variable | FlowControl | Block | null | undefined
): ItemHandler<any> | null {
  if (!item) return null;

  // Identify item type and create appropriate handler
  if ('responseType' in item) {
    return new QuestionHandler(item as Question);
  }
  if ('blocks' in item || 'questions' in item) {
    return new PageHandler(item as Page);
  }
  if ('formula' in item && 'scope' in item) {
    return new VariableHandler(item as Variable);
  }
  if ('type' in item && 'condition' in item) {
    return new FlowControlHandler(item as FlowControl);
  }
  if ('pageId' in item && 'questions' in item) {
    return new BlockHandler(item as Block);
  }

  return null;
}