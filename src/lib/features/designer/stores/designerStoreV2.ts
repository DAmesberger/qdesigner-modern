import { writable, derived, get } from 'svelte/store';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import type { 
  Questionnaire, 
  Page, 
  Block,
  Variable, 
  FlowControl,
} from '$lib/shared';
import type { 
  Question as NewQuestion,
  QuestionType as NewQuestionType
} from '$lib/shared/types/questionnaire';
import { QuestionFactory } from '$lib/shared/factories/question-factory';
import { migrateQuestion } from '$lib/shared/migration/question-migration';
import { QuestionValidator } from '$lib/shared/validators/question-validators';
import { VariableEngine } from '$lib/scripting-engine';
import { OfflinePersistenceService } from '$lib/services/offlinePersistence';

// Updated questionnaire type with new questions
export interface QuestionnaireV2 extends Omit<Questionnaire, 'questions'> {
  questions: NewQuestion[];
}

export interface DesignerStateV2 {
  questionnaire: QuestionnaireV2;
  selectedItemId: string | null;
  selectedItemType: 'question' | 'page' | 'variable' | 'flow' | 'block' | null;
  isDragging: boolean;
  previewMode: boolean;
  currentPageId: string | null;
  currentBlockId: string | null;
  validationErrors: ValidationError[];
  undoStack: QuestionnaireV2[];
  redoStack: QuestionnaireV2[];
  isSaving: boolean;
  isLoading: boolean;
  lastSaved: Date | null;
  saveError: string | null;
  userId: string | null;
}

export interface ValidationError {
  itemId: string;
  itemType: string;
  field: string;
  message: string;
}

// Create empty questionnaire with new types
const createEmptyQuestionnaire = (): QuestionnaireV2 => ({
  id: nanoid(),
  name: 'New Questionnaire',
  description: '',
  version: '1.0.0',
  created: new Date(),
  modified: new Date(),
  variables: [],
  questions: [],
  pages: [{
    id: 'page1',
    name: 'Page 1',
    questions: [],
    layout: { type: 'vertical', spacing: 16, alignment: 'center' }
  }],
  flow: [],
  settings: {
    allowBackNavigation: true,
    showProgressBar: true,
    saveProgress: true,
    webgl: { targetFPS: 120 }
  }
});

// Create the new designer store
function createDesignerStoreV2() {
  const initialState: DesignerStateV2 = {
    questionnaire: createEmptyQuestionnaire(),
    selectedItemId: null,
    selectedItemType: null,
    isDragging: false,
    previewMode: false,
    currentPageId: 'page1',
    currentBlockId: null,
    validationErrors: [],
    undoStack: [],
    redoStack: [],
    isSaving: false,
    isLoading: false,
    lastSaved: null,
    saveError: null,
    userId: null
  };

  const { subscribe, update, set } = writable<DesignerStateV2>(initialState);

  // Variable engine instance
  let variableEngine: VariableEngine | null = null;

  // Helper function to save undo state
  const saveUndoState = (state: DesignerStateV2) => {
    return produce(state, draft => {
      draft.undoStack.push(JSON.parse(JSON.stringify(draft.questionnaire)));
      if (draft.undoStack.length > 50) {
        draft.undoStack.shift();
      }
      draft.redoStack = [];
    });
  };

  return {
    subscribe,

    // Initialize variable engine
    initVariableEngine: () => {
      const state = get({ subscribe });
      variableEngine = new VariableEngine();
      
      // Register all variables
      state.questionnaire.variables.forEach(v => {
        variableEngine!.registerVariable(v);
      });
    },

    // Page operations (same as before)
    addPage: () => update(state => 
      produce(saveUndoState(state), draft => {
        const newPage: Page = {
          id: `page${nanoid(6)}`,
          name: `Page ${draft.questionnaire.pages.length + 1}`,
          questions: [],
          layout: { type: 'vertical', spacing: 16, alignment: 'center' }
        };
        draft.questionnaire.pages.push(newPage);
        draft.questionnaire.modified = new Date();
      })
    ),

    updatePage: (pageId: string, updates: Partial<Page>) => update(state =>
      produce(saveUndoState(state), draft => {
        const page = draft.questionnaire.pages.find(p => p.id === pageId);
        if (page) {
          Object.assign(page, updates);
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    deletePage: (pageId: string) => update(state =>
      produce(saveUndoState(state), draft => {
        const index = draft.questionnaire.pages.findIndex(p => p.id === pageId);
        if (index !== -1 && draft.questionnaire.pages.length > 1) {
          // Remove questions from this page
          draft.questionnaire.questions = draft.questionnaire.questions.filter(
            q => {
              // Check if question is on this page
              const page = draft.questionnaire.pages.find(p => 
                p.questions?.includes(q.id) || 
                p.blocks?.some(b => b.questions.includes(q.id))
              );
              return page?.id !== pageId;
            }
          );
          // Remove the page
          draft.questionnaire.pages.splice(index, 1);
          // Update current page if needed
          if (draft.currentPageId === pageId && draft.questionnaire.pages.length > 0) {
            draft.currentPageId = draft.questionnaire.pages[0]?.id || null;
          }
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    // Block operations
    addBlock: (pageId: string, blockType: Block['type'] = 'standard') => update(state =>
      produce(saveUndoState(state), draft => {
        const page = draft.questionnaire.pages.find(p => p.id === pageId);
        if (!page) return;

        const newBlock: Block = {
          id: `block${nanoid(6)}`,
          pageId,
          name: `Block ${(page.blocks?.length ?? 0) + 1}`,
          type: blockType,
          questions: [],
          layout: { type: 'vertical', spacing: 16, alignment: 'center' }
        };

        if (!page.blocks) page.blocks = [];
        page.blocks.push(newBlock);
        
        // Set as current block
        draft.currentBlockId = newBlock.id;
        draft.questionnaire.modified = new Date();
      })
    ),

    updateBlock: (blockId: string, updates: Partial<Block>) => update(state =>
      produce(saveUndoState(state), draft => {
        const page = draft.questionnaire.pages.find(p => 
          p.blocks?.some(b => b.id === blockId)
        );
        if (!page) return;

        const block = page.blocks?.find(b => b.id === blockId);
        if (block) {
          Object.assign(block, updates);
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    deleteBlock: (blockId: string) => update(state =>
      produce(saveUndoState(state), draft => {
        const page = draft.questionnaire.pages.find(p => 
          p.blocks?.some(b => b.id === blockId)
        );
        if (!page || !page.blocks) return;

        const blockIndex = page.blocks.findIndex(b => b.id === blockId);
        if (blockIndex !== -1) {
          const block = page.blocks[blockIndex];
          
          // Remove all questions in this block
          if (block) {
            draft.questionnaire.questions = draft.questionnaire.questions.filter(
              q => !block.questions.includes(q.id)
            );
          }

          // Remove the block
          page.blocks.splice(blockIndex, 1);

          // Clear current block if it was this one
          if (draft.currentBlockId === blockId) {
            draft.currentBlockId = page.blocks[0]?.id || null;
          }

          // Clear selection if this was selected
          if (draft.selectedItemId === blockId) {
            draft.selectedItemId = null;
            draft.selectedItemType = null;
          }

          draft.questionnaire.modified = new Date();
        }
      })
    ),

    setCurrentBlock: (blockId: string | null) => update(state =>
      produce(state, draft => {
        draft.currentBlockId = blockId;
      })
    ),

    reorderQuestionsInBlock: (blockId: string, oldIndex: number, newIndex: number) => update(state =>
      produce(saveUndoState(state), draft => {
        const page = draft.questionnaire.pages.find(p => 
          p.blocks?.some(b => b.id === blockId)
        );
        if (!page) return;

        const block = page.blocks?.find(b => b.id === blockId);
        if (block && block.questions) {
          const [removed] = block.questions.splice(oldIndex, 1);
          if (removed) {
            block.questions.splice(newIndex, 0, removed);
          }
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    updateBlockQuestions: (blockId: string, questionIds: string[]) => update(state =>
      produce(saveUndoState(state), draft => {
        const page = draft.questionnaire.pages.find(p => 
          p.blocks?.some(b => b.id === blockId)
        );
        if (!page) return;

        const block = page.blocks?.find(b => b.id === blockId);
        if (block) {
          block.questions = questionIds;
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    // Question operations with new type system
    addQuestion: (targetId: string, questionType: NewQuestionType, position?: number) => update(state =>
      produce(saveUndoState(state), draft => {
        // Check if targetId is a block ID
        let block: Block | undefined;
        let page: Page | undefined;
        
        // First try to find as block
        for (const p of draft.questionnaire.pages) {
          if (p.blocks) {
            const foundBlock = p.blocks.find(b => b.id === targetId);
            if (foundBlock) {
              block = foundBlock;
              page = p;
              break;
            }
          }
        }
        
        // If not found as block, try as page
        if (!block) {
          page = draft.questionnaire.pages.find(p => p.id === targetId);
        }
        
        // Exit if no page found
        if (!page) return;

        // Create new question with factory
        const newQuestion = QuestionFactory.create(questionType);

        // Add question to questionnaire
        draft.questionnaire.questions.push(newQuestion);

        // Add question ID to block or page
        if (block) {
          if (position !== undefined && position >= 0) {
            block.questions.splice(position, 0, newQuestion.id);
          } else {
            block.questions.push(newQuestion.id);
          }
        } else {
          if (!page.questions) page.questions = [];
          if (position !== undefined && position >= 0) {
            page.questions.splice(position, 0, newQuestion.id);
          } else {
            page.questions.push(newQuestion.id);
          }
        }

        // Select the new question
        draft.selectedItemId = newQuestion.id;
        draft.selectedItemType = 'question';
        draft.questionnaire.modified = new Date();
      })
    ),

    updateQuestion: (questionId: string, updates: Partial<NewQuestion>) => update(state =>
      produce(saveUndoState(state), draft => {
        const question = draft.questionnaire.questions.find(q => q.id === questionId);
        if (question) {
          // Deep merge to preserve nested structures
          Object.assign(question, updates);
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    deleteQuestion: (questionId: string) => update(state =>
      produce(saveUndoState(state), draft => {
        // Remove from questions array
        const qIndex = draft.questionnaire.questions.findIndex(q => q.id === questionId);
        if (qIndex !== -1) {
          draft.questionnaire.questions.splice(qIndex, 1);
        }

        // Remove from pages
        draft.questionnaire.pages.forEach(page => {
          const index = page.questions?.indexOf(questionId) ?? -1;
          if (index !== -1) {
            page.questions?.splice(index, 1);
          }
          
          // Remove from blocks
          page.blocks?.forEach(block => {
            const blockIndex = block.questions.indexOf(questionId);
            if (blockIndex !== -1) {
              block.questions.splice(blockIndex, 1);
            }
          });
        });

        // Clear selection if this was selected
        if (draft.selectedItemId === questionId) {
          draft.selectedItemId = null;
          draft.selectedItemType = null;
        }

        draft.questionnaire.modified = new Date();
      })
    ),

    duplicateQuestion: (questionId: string) => update(state =>
      produce(saveUndoState(state), draft => {
        const originalQuestion = draft.questionnaire.questions.find(q => q.id === questionId);
        if (!originalQuestion) return;

        // Clone the question
        const clonedQuestion = QuestionFactory.clone(originalQuestion);
        draft.questionnaire.questions.push(clonedQuestion);

        // Find where to insert the clone
        draft.questionnaire.pages.forEach(page => {
          const pageIndex = page.questions?.indexOf(questionId) ?? -1;
          if (pageIndex !== -1 && page.questions) {
            page.questions.splice(pageIndex + 1, 0, clonedQuestion.id);
          }
          
          page.blocks?.forEach(block => {
            const blockIndex = block.questions.indexOf(questionId);
            if (blockIndex !== -1) {
              block.questions.splice(blockIndex + 1, 0, clonedQuestion.id);
            }
          });
        });

        // Select the cloned question
        draft.selectedItemId = clonedQuestion.id;
        draft.selectedItemType = 'question';
        draft.questionnaire.modified = new Date();
      })
    ),

    // Variable operations (same as before)
    addVariable: (variable: Omit<Variable, 'id'>) => update(state =>
      produce(saveUndoState(state), draft => {
        const newVariable: Variable = {
          ...variable,
          id: `var${nanoid(6)}`
        };
        draft.questionnaire.variables.push(newVariable);
        
        // Register with variable engine
        if (variableEngine) {
          variableEngine.registerVariable(newVariable);
        }

        draft.questionnaire.modified = new Date();
      })
    ),

    updateVariable: (variableId: string, updates: Partial<Variable>) => update(state =>
      produce(saveUndoState(state), draft => {
        const variable = draft.questionnaire.variables.find(v => v.id === variableId);
        if (variable) {
          Object.assign(variable, updates);
          
          // Re-register with variable engine
          if (variableEngine) {
            variableEngine.clear();
            draft.questionnaire.variables.forEach(v => {
              variableEngine!.registerVariable(v);
            });
          }

          draft.questionnaire.modified = new Date();
        }
      })
    ),

    deleteVariable: (variableId: string) => update(state =>
      produce(saveUndoState(state), draft => {
        const index = draft.questionnaire.variables.findIndex(v => v.id === variableId);
        if (index !== -1) {
          draft.questionnaire.variables.splice(index, 1);
          
          // Re-register all variables
          if (variableEngine) {
            variableEngine.clear();
            draft.questionnaire.variables.forEach(v => {
              variableEngine!.registerVariable(v);
            });
          }

          draft.questionnaire.modified = new Date();
        }
      })
    ),

    // Flow control operations
    addFlowControl: (flowControl: Omit<FlowControl, 'id'>) => update(state =>
      produce(saveUndoState(state), draft => {
        const newFlow: FlowControl = {
          ...flowControl,
          id: `flow${nanoid(6)}`
        };
        draft.questionnaire.flow.push(newFlow);
        draft.questionnaire.modified = new Date();
      })
    ),

    // Selection
    selectItem: (itemId: string | null, itemType: DesignerStateV2['selectedItemType']) => 
      update(state => produce(state, draft => {
        draft.selectedItemId = itemId;
        draft.selectedItemType = itemType;
      })),

    // Navigation
    setCurrentPage: (pageId: string) => update(state =>
      produce(state, draft => {
        draft.currentPageId = pageId;
      })
    ),

    // Preview mode
    togglePreview: () => update(state =>
      produce(state, draft => {
        draft.previewMode = !draft.previewMode;
      })
    ),

    // Drag state
    setDragging: (isDragging: boolean) => update(state =>
      produce(state, draft => {
        draft.isDragging = isDragging;
      })
    ),

    // Reorder questions within a page
    reorderQuestions: (pageId: string, oldIndex: number, newIndex: number) => update(state =>
      produce(saveUndoState(state), draft => {
        const page = draft.questionnaire.pages.find(p => p.id === pageId);
        if (page && page.questions) {
          const [removed] = page.questions.splice(oldIndex, 1);
          if (removed) {
            page.questions.splice(newIndex, 0, removed);
          }
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    // Move question between pages
    moveQuestionToPage: (questionId: string, targetPageId: string, position?: number) => 
      update(state => produce(saveUndoState(state), draft => {
        const question = draft.questionnaire.questions.find(q => q.id === questionId);
        if (!question) return;

        // Remove from all pages and blocks
        draft.questionnaire.pages.forEach(page => {
          const pageIndex = page.questions?.indexOf(questionId) ?? -1;
          if (pageIndex !== -1) {
            page.questions?.splice(pageIndex, 1);
          }
          
          page.blocks?.forEach(block => {
            const blockIndex = block.questions.indexOf(questionId);
            if (blockIndex !== -1) {
              block.questions.splice(blockIndex, 1);
            }
          });
        });

        // Add to target page
        const targetPage = draft.questionnaire.pages.find(p => p.id === targetPageId);
        if (targetPage) {
          if (!targetPage.questions) targetPage.questions = [];
          if (position !== undefined) {
            targetPage.questions.splice(position, 0, questionId);
          } else {
            targetPage.questions.push(questionId);
          }
        }

        draft.questionnaire.modified = new Date();
      })),

    // Undo/Redo
    undo: () => update(state =>
      produce(state, draft => {
        if (draft.undoStack.length > 0) {
          draft.redoStack.push(JSON.parse(JSON.stringify(draft.questionnaire)));
          draft.questionnaire = draft.undoStack.pop()!;
        }
      })
    ),

    redo: () => update(state =>
      produce(state, draft => {
        if (draft.redoStack.length > 0) {
          draft.undoStack.push(JSON.parse(JSON.stringify(draft.questionnaire)));
          draft.questionnaire = draft.redoStack.pop()!;
        }
      })
    ),

    // Validation with new validator
    validate: () => update(state =>
      produce(state, draft => {
        const errors: ValidationError[] = [];

        // Validate pages
        if (draft.questionnaire.pages.length === 0) {
          errors.push({
            itemId: 'questionnaire',
            itemType: 'questionnaire',
            field: 'pages',
            message: 'Questionnaire must have at least one page'
          });
        }

        // Validate variables
        draft.questionnaire.variables.forEach(variable => {
          if (!variable.name) {
            errors.push({
              itemId: variable.id,
              itemType: 'variable',
              field: 'name',
              message: 'Variable must have a name'
            });
          }

          // Validate formula if present
          if (variable.formula && variableEngine) {
            const result = variableEngine.evaluateFormula(variable.formula);
            if (result.error) {
              errors.push({
                itemId: variable.id,
                itemType: 'variable',
                field: 'formula',
                message: `Formula error: ${result.error}`
              });
            }
          }
        });

        // Validate questions with new validator
        draft.questionnaire.questions.forEach(question => {
          const validation = QuestionValidator.validateQuestion(question);
          
          validation.errors.forEach(error => {
            errors.push({
              itemId: question.id,
              itemType: 'question',
              field: error.field,
              message: error.message
            });
          });
          
          // Add warnings as lower severity
          validation.warnings.forEach(warning => {
            errors.push({
              itemId: question.id,
              itemType: 'question',
              field: warning.field,
              message: `Warning: ${warning.message}`
            });
          });
        });

        draft.validationErrors = errors;
      })
    ),

    // Import questionnaire with migration
    importQuestionnaire: (questionnaire: Questionnaire) => update(state =>
      produce(state, draft => {
        // Migrate questions to new format
        const migrationResult = questionnaire.questions.map(q => migrateQuestion(q));
        const migratedQuestions = migrationResult
          .filter(r => r.success && r.question)
          .map(r => r.question!);
        
        // Log any migration warnings/errors
        migrationResult.forEach((result, index) => {
          if (result.warnings.length > 0) {
            console.warn(`Migration warnings for question ${index}:`, result.warnings);
          }
          if (result.errors.length > 0) {
            console.error(`Migration errors for question ${index}:`, result.errors);
          }
        });

        draft.questionnaire = {
          ...questionnaire,
          questions: migratedQuestions
        };
        draft.currentPageId = questionnaire.pages[0]?.id || null;
        draft.selectedItemId = null;
        draft.selectedItemType = null;
        draft.undoStack = [];
        draft.redoStack = [];

        // Re-register variables
        if (variableEngine) {
          variableEngine.clear();
          questionnaire.variables.forEach(v => {
            variableEngine!.registerVariable(v);
          });
        }
      })
    ),

    exportQuestionnaire: () => {
      const state = get({ subscribe });
      return JSON.parse(JSON.stringify(state.questionnaire));
    },
    
    updateQuestionnaire: (updates: Partial<QuestionnaireV2>) => update(state =>
      produce(saveUndoState(state), draft => {
        Object.assign(draft.questionnaire, updates);
        draft.questionnaire.modified = new Date();
      })
    ),

    // Persistence methods (updated to handle conversion)
    setUserId: (userId: string) => {
      update(state =>
        produce(state, draft => {
          draft.userId = userId;
        })
      );
      
      // Start offline sync when user is set
      if (userId) {
        OfflinePersistenceService.startSync(userId);
      } else {
        OfflinePersistenceService.stopSync();
      }
    },

    saveQuestionnaire: async () => {
      const state = get({ subscribe });
      
      if (!state.userId) {
        console.error('No user ID set. Cannot save questionnaire.');
        update(s => produce(s, draft => {
          draft.saveError = 'User not authenticated';
        }));
        return false;
      }

      update(s => produce(s, draft => {
        draft.isSaving = true;
        draft.saveError = null;
      }));

      // Convert back to old format for saving
      // This is temporary until the backend is updated
      const oldFormatQuestionnaire: Questionnaire = {
        ...state.questionnaire,
        questions: [] // Would need reverse migration here
      };

      const result = await OfflinePersistenceService.saveQuestionnaire(
        oldFormatQuestionnaire,
        state.userId,
        state.questionnaire.projectId || 'default-project',
        state.questionnaire.organizationId || 'default-org'
      );

      update(s => produce(s, draft => {
        draft.isSaving = false;
        if (result.success) {
          draft.lastSaved = new Date();
          draft.saveError = null;
          if (result.questionnaireId && draft.questionnaire.id !== result.questionnaireId) {
            draft.questionnaire.id = result.questionnaireId;
          }
        } else {
          draft.saveError = result.error || 'Failed to save questionnaire';
        }
      }));

      return result.success;
    },

    loadQuestionnaire: async (questionnaireId: string) => {
      update(s => produce(s, draft => {
        draft.isLoading = true;
        draft.saveError = null;
      }));

      const state = get({ subscribe });
      const result = await OfflinePersistenceService.loadQuestionnaire(questionnaireId, state.userId || '');

      update(s => produce(s, draft => {
        draft.isLoading = false;
        if (result.success && result.questionnaire) {
          // Use importQuestionnaire to handle migration
          const migrationResult = result.questionnaire.questions.map(q => migrateQuestion(q));
          const migratedQuestions = migrationResult
            .filter(r => r.success && r.question)
            .map(r => r.question!);
          
          draft.questionnaire = {
            ...result.questionnaire,
            questions: migratedQuestions
          };
          draft.currentPageId = result.questionnaire.pages[0]?.id || null;
          draft.selectedItemId = null;
          draft.selectedItemType = null;
          draft.undoStack = [];
          draft.redoStack = [];
          draft.lastSaved = new Date();
          
          // Re-register variables
          if (variableEngine) {
            variableEngine.clear();
            result.questionnaire.variables.forEach(v => {
              variableEngine!.registerVariable(v);
            });
          }
        } else {
          draft.saveError = result.error || 'Failed to load questionnaire';
        }
      }));

      return result.success;
    },

    listQuestionnaires: async () => {
      const state = get({ subscribe });
      
      if (!state.userId) {
        console.error('No user ID set. Cannot list questionnaires.');
        return [];
      }

      const projectId = state.questionnaire.projectId || 'default-project';
      const questionnaires = await OfflinePersistenceService.listQuestionnaires(state.userId, projectId);
      return questionnaires;
    },

    updateLastSaved: () => update(state =>
      produce(state, draft => {
        draft.lastSaved = new Date();
      })
    ),

    getState: () => get({ subscribe }),

    deleteQuestionnaire: async (questionnaireId: string) => {
      const state = get({ subscribe });
      
      if (!state.userId) {
        console.error('No user ID set. Cannot delete questionnaire.');
        return false;
      }

      // For now, we'll just mark it as deleted in the sync queue
      // Full delete implementation would need to be added to OfflinePersistenceService
      return false;
    }
  };
}

export const designerStoreV2 = createDesignerStoreV2();

// Derived stores
export const currentPage = derived(
  designerStoreV2,
  $state => $state.questionnaire.pages.find(p => p.id === $state.currentPageId)
);

export const currentPageQuestions = derived(
  designerStoreV2,
  $state => {
    const page = $state.questionnaire.pages.find(p => p.id === $state.currentPageId);
    if (!page) return [];
    
    return (page.questions ?? [])
      .map(qId => $state.questionnaire.questions.find(q => q.id === qId))
      .filter(Boolean) as NewQuestion[];
  }
);

export const selectedItem = derived(
  designerStoreV2,
  $state => {
    if (!$state.selectedItemId || !$state.selectedItemType) return null;

    switch ($state.selectedItemType) {
      case 'question':
        return $state.questionnaire.questions.find(q => q.id === $state.selectedItemId);
      case 'page':
        return $state.questionnaire.pages.find(p => p.id === $state.selectedItemId);
      case 'variable':
        return $state.questionnaire.variables.find(v => v.id === $state.selectedItemId);
      case 'flow':
        return $state.questionnaire.flow.find(f => f.id === $state.selectedItemId);
      case 'block':
        for (const page of $state.questionnaire.pages) {
          if (page.blocks) {
            const block = page.blocks.find(b => b.id === $state.selectedItemId);
            if (block) return block;
          }
        }
        return null;
      default:
        return null;
    }
  }
);

export const canUndo = derived(
  designerStoreV2,
  $state => $state.undoStack.length > 0
);

export const canRedo = derived(
  designerStoreV2,
  $state => $state.redoStack.length > 0
);

export const isSaving = derived(
  designerStoreV2,
  $state => $state.isSaving
);

export const isLoading = derived(
  designerStoreV2,
  $state => $state.isLoading
);

export const lastSaved = derived(
  designerStoreV2,
  $state => $state.lastSaved
);

export const saveError = derived(
  designerStoreV2,
  $state => $state.saveError
);

// Block-related derived stores
export const currentPageBlocks = derived(
  designerStoreV2,
  $state => {
    const page = $state.questionnaire.pages.find(p => p.id === $state.currentPageId);
    return page?.blocks || [];
  }
);

export const currentBlock = derived(
  designerStoreV2,
  $state => {
    if (!$state.currentBlockId) return null;
    
    for (const page of $state.questionnaire.pages) {
      if (page.blocks) {
        const block = page.blocks.find(b => b.id === $state.currentBlockId);
        if (block) return block;
      }
    }
    return null;
  }
);

export const currentBlockQuestions = derived(
  [designerStoreV2, currentBlock],
  ([$state, $currentBlock]) => {
    if (!$currentBlock) return [];
    
    return $currentBlock.questions
      .map(qId => $state.questionnaire.questions.find(q => q.id === qId))
      .filter(Boolean) as NewQuestion[];
  }
);