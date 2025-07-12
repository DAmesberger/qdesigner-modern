import { writable, derived, get } from 'svelte/store';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import type { 
  Questionnaire, 
  Question, 
  Page, 
  Variable, 
  FlowControl,
  QuestionType,
  ResponseType 
} from '$lib/shared/types/types';
import { VariableEngine } from '$lib/core/scripting';
import { OfflinePersistenceService } from '$lib/services/offlinePersistence';

export interface DesignerState {
  questionnaire: Questionnaire;
  selectedItemId: string | null;
  selectedItemType: 'question' | 'page' | 'variable' | 'flow' | null;
  isDragging: boolean;
  previewMode: boolean;
  currentPageId: string | null;
  validationErrors: ValidationError[];
  undoStack: Questionnaire[];
  redoStack: Questionnaire[];
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

// Initial empty questionnaire
const createEmptyQuestionnaire = (): Questionnaire => ({
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

// Create the main designer store
function createDesignerStore() {
  const initialState: DesignerState = {
    questionnaire: createEmptyQuestionnaire(),
    selectedItemId: null,
    selectedItemType: null,
    isDragging: false,
    previewMode: false,
    currentPageId: 'page1',
    validationErrors: [],
    undoStack: [],
    redoStack: [],
    isSaving: false,
    isLoading: false,
    lastSaved: null,
    saveError: null,
    userId: null
  };

  const { subscribe, update, set } = writable<DesignerState>(initialState);

  // Variable engine instance
  let variableEngine: VariableEngine | null = null;

  // Helper function to save undo state
  const saveUndoState = (state: DesignerState) => {
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

    // Page operations
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
            q => q.page !== pageId
          );
          // Remove the page
          draft.questionnaire.pages.splice(index, 1);
          // Update current page if needed
          if (draft.currentPageId === pageId) {
            draft.currentPageId = draft.questionnaire.pages[0].id;
          }
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    // Question operations
    addQuestion: (pageId: string, questionType: QuestionType, position?: number) => update(state =>
      produce(saveUndoState(state), draft => {
        const page = draft.questionnaire.pages.find(p => p.id === pageId);
        if (!page) return;

        const newQuestion: Question = {
          id: `q${nanoid(6)}`,
          type: questionType,
          page: pageId,
          prompt: { text: 'New Question' },
          responseType: { type: 'single' },
          variables: []
        };

        // Add question to questionnaire
        draft.questionnaire.questions.push(newQuestion);

        // Add question ID to page
        if (position !== undefined && position >= 0) {
          page.questions.splice(position, 0, newQuestion.id);
        } else {
          page.questions.push(newQuestion.id);
        }

        // Select the new question
        draft.selectedItemId = newQuestion.id;
        draft.selectedItemType = 'question';
        draft.questionnaire.modified = new Date();
      })
    ),

    updateQuestion: (questionId: string, updates: Partial<Question>) => update(state =>
      produce(saveUndoState(state), draft => {
        const question = draft.questionnaire.questions.find(q => q.id === questionId);
        if (question) {
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

        // Remove from page
        draft.questionnaire.pages.forEach(page => {
          const index = page.questions.indexOf(questionId);
          if (index !== -1) {
            page.questions.splice(index, 1);
          }
        });

        // Clear selection if this was selected
        if (draft.selectedItemId === questionId) {
          draft.selectedItemId = null;
          draft.selectedItemType = null;
        }

        draft.questionnaire.modified = new Date();
      })
    ),

    // Variable operations
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
    selectItem: (itemId: string | null, itemType: DesignerState['selectedItemType']) => 
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
        if (page) {
          const [removed] = page.questions.splice(oldIndex, 1);
          page.questions.splice(newIndex, 0, removed);
          draft.questionnaire.modified = new Date();
        }
      })
    ),

    // Move question between pages
    moveQuestionToPage: (questionId: string, targetPageId: string, position?: number) => 
      update(state => produce(saveUndoState(state), draft => {
        const question = draft.questionnaire.questions.find(q => q.id === questionId);
        if (!question) return;

        // Remove from current page
        draft.questionnaire.pages.forEach(page => {
          const index = page.questions.indexOf(questionId);
          if (index !== -1) {
            page.questions.splice(index, 1);
          }
        });

        // Add to target page
        const targetPage = draft.questionnaire.pages.find(p => p.id === targetPageId);
        if (targetPage) {
          if (position !== undefined) {
            targetPage.questions.splice(position, 0, questionId);
          } else {
            targetPage.questions.push(questionId);
          }
          question.page = targetPageId;
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

    // Validation
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

        // Validate questions
        draft.questionnaire.questions.forEach(question => {
          if (!question.prompt?.text && !question.stimulus) {
            errors.push({
              itemId: question.id,
              itemType: 'question',
              field: 'prompt',
              message: 'Question must have a prompt or stimulus'
            });
          }
        });

        draft.validationErrors = errors;
      })
    ),

    // Import/Export
    importQuestionnaire: (questionnaire: Questionnaire) => update(state =>
      produce(state, draft => {
        draft.questionnaire = questionnaire;
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

    // Persistence methods
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

      const result = await OfflinePersistenceService.saveQuestionnaire(
        state.questionnaire,
        state.userId
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

      const result = await OfflinePersistenceService.loadQuestionnaire(questionnaireId, state.userId);

      update(s => produce(s, draft => {
        draft.isLoading = false;
        if (result.success && result.questionnaire) {
          draft.questionnaire = result.questionnaire;
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

      const questionnaires = await OfflinePersistenceService.listQuestionnaires(state.userId);
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
      return { success: false };

      return result.success;
    }
  };
}

export const designerStore = createDesignerStore();

// Derived stores
export const currentPage = derived(
  designerStore,
  $state => $state.questionnaire.pages.find(p => p.id === $state.currentPageId)
);

export const currentPageQuestions = derived(
  designerStore,
  $state => {
    const page = $state.questionnaire.pages.find(p => p.id === $state.currentPageId);
    if (!page) return [];
    
    return page.questions
      .map(qId => $state.questionnaire.questions.find(q => q.id === qId))
      .filter(Boolean) as Question[];
  }
);

export const selectedItem = derived(
  designerStore,
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
      default:
        return null;
    }
  }
);

export const canUndo = derived(
  designerStore,
  $state => $state.undoStack.length > 0
);

export const canRedo = derived(
  designerStore,
  $state => $state.redoStack.length > 0
);

export const isSaving = derived(
  designerStore,
  $state => $state.isSaving
);

export const isLoading = derived(
  designerStore,
  $state => $state.isLoading
);

export const lastSaved = derived(
  designerStore,
  $state => $state.lastSaved
);

export const saveError = derived(
  designerStore,
  $state => $state.saveError
);