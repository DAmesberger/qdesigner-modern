import { writable, derived, get } from 'svelte/store';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { generateUUID } from '$lib/utils/uuid';
import type { 
  Questionnaire, 
  Question, 
  Page, 
  Block,
  Variable, 
  FlowControl,
  QuestionType,
  ResponseType 
} from '$lib/shared';
import { VariableEngine } from '$lib/scripting-engine';
import { OfflinePersistenceService } from '$lib/services/offlinePersistence';
import { QuestionFactory } from '$lib/shared/factories/question-factory';

export interface DesignerState {
  questionnaire: Questionnaire;
  selectedItemId: string | null;
  selectedItemType: 'question' | 'page' | 'variable' | 'flow' | 'block' | null;
  isDragging: boolean;
  previewMode: boolean;
  currentPageId: string | null;
  currentBlockId: string | null;
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
  id: generateUUID(),
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
      
      // Register all variables (create plain copies to avoid proxy issues)
      state.questionnaire.variables.forEach(v => {
        variableEngine!.registerVariable(JSON.parse(JSON.stringify(v)));
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
            block.questions.forEach(qId => {
            const qIndex = draft.questionnaire.questions.findIndex(q => q.id === qId);
            if (qIndex !== -1) {
              draft.questionnaire.questions.splice(qIndex, 1);
            }
            });
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

    // Question operations
    addQuestion: (targetId: string, questionType: QuestionType, position?: number) => update(state =>
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
          
          // If page found but has no blocks, create a default block
          if (page) {
            if (!page.blocks || page.blocks.length === 0) {
              const newBlock: Block = {
                id: `block${nanoid(6)}`,
                pageId: page.id,
                name: `Block 1`,
                type: 'standard',
                questions: [],
                layout: { type: 'vertical', spacing: 16, alignment: 'center' }
              };
              if (!page.blocks) page.blocks = [];
              page.blocks.push(newBlock);
              block = newBlock;
              
              // Set as current block
              draft.currentBlockId = newBlock.id;
            } else {
              // Use the first block if page has blocks but none was selected
              block = page.blocks[0];
            }
          }
        }
        
        // Exit if no page found
        if (!page) return;

        // Create new question using factory
        const newQuestion = QuestionFactory.create(questionType);
        
        // Update order based on position
        if (block && position !== undefined) {
          newQuestion.order = position;
        } else if (block) {
          newQuestion.order = block.questions.length;
        } else if (page && position !== undefined) {
          newQuestion.order = position;
        } else if (page) {
          newQuestion.order = page.questions?.length || 0;
        }

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
          if (!page.questions) {
            page.questions = [];
          }
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
          const index = page.questions?.indexOf(questionId) ?? -1;
          if (index !== -1) {
            page.questions?.splice(index, 1);
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
        
        // Register with variable engine (create a plain copy to avoid proxy issues)
        if (variableEngine) {
          variableEngine.registerVariable(JSON.parse(JSON.stringify(newVariable)));
        }

        draft.questionnaire.modified = new Date();
      })
    ),

    updateVariable: (variableId: string, updates: Partial<Variable>) => update(state =>
      produce(saveUndoState(state), draft => {
        const variable = draft.questionnaire.variables.find(v => v.id === variableId);
        if (variable) {
          Object.assign(variable, updates);
          
          // Re-register with variable engine (create plain copies to avoid proxy issues)
          if (variableEngine) {
            variableEngine.clear();
            draft.questionnaire.variables.forEach(v => {
              variableEngine!.registerVariable(JSON.parse(JSON.stringify(v)));
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
          
          // Re-register all variables (create plain copies to avoid proxy issues)
          if (variableEngine) {
            variableEngine.clear();
            draft.questionnaire.variables.forEach(v => {
              variableEngine!.registerVariable(JSON.parse(JSON.stringify(v)));
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

        // Remove from current page
        draft.questionnaire.pages.forEach(page => {
          const index = page.questions?.indexOf(questionId) ?? -1;
          if (index !== -1) {
            page.questions?.splice(index, 1);
          }
        });

        // Add to target page
        const targetPage = draft.questionnaire.pages.find(p => p.id === targetPageId);
        if (targetPage && targetPage.questions) {
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

        // Re-register variables (create plain copies to avoid proxy issues)
        if (variableEngine) {
          variableEngine.clear();
          questionnaire.variables.forEach(v => {
            variableEngine!.registerVariable(JSON.parse(JSON.stringify(v)));
          });
        }
      })
    ),

    exportQuestionnaire: () => {
      const state = get({ subscribe });
      return JSON.parse(JSON.stringify(state.questionnaire));
    },
    
    updateQuestionnaire: (updates: Partial<Questionnaire>) => update(state =>
      produce(saveUndoState(state), draft => {
        Object.assign(draft.questionnaire, updates);
        draft.questionnaire.modified = new Date();
      })
    ),

    // Persistence methods
    setUserId: (userId: string) => {
      update(state =>
        produce(state, draft => {
          draft.userId = userId;
        })
      );
    },
    
    setOrganizationId: (organizationId: string) => {
      update(state =>
        produce(state, draft => {
          draft.questionnaire.organizationId = organizationId;
        })
      );
    },
    
    setProjectId: (projectId: string) => {
      update(state =>
        produce(state, draft => {
          draft.questionnaire.projectId = projectId;
        })
      );
    },
    
    createNewQuestionnaire: (options: { name: string; description?: string; projectId: string; organizationId: string }) => {
      update(state =>
        produce(state, draft => {
          const newQuestionnaire = createEmptyQuestionnaire();
          newQuestionnaire.name = options.name;
          newQuestionnaire.description = options.description || '';
          newQuestionnaire.projectId = options.projectId;
          newQuestionnaire.organizationId = options.organizationId;
          draft.questionnaire = newQuestionnaire;
          draft.currentPageId = newQuestionnaire.pages[0]?.id || null;
          draft.selectedItemId = null;
          draft.selectedItemType = null;
          draft.undoStack = [];
          draft.redoStack = [];
        })
      );
    },
    
    loadQuestionnaireFromDefinition: (definition: any) => {
      update(state =>
        produce(state, draft => {
          // Transform the database definition to the internal format
          const questionnaire: Questionnaire = {
            id: definition.id,
            name: definition.name,
            description: definition.description || '',
            version: definition.version || '1.0.0',
            created: new Date(definition.created_at),
            modified: new Date(definition.updated_at),
            projectId: definition.project_id,
            organizationId: definition.organizationId || definition.organization_id,
            variables: definition.content?.variables || [],
            questions: definition.content?.questions || [],
            pages: definition.content?.pages || [{
              id: 'page1',
              name: 'Page 1',
              questions: [],
              layout: { type: 'vertical', spacing: 16, alignment: 'center' }
            }],
            flow: definition.content?.flow || [],
            settings: definition.content?.settings || {
              allowBackNavigation: true,
              showProgressBar: true,
              saveProgress: true,
              webgl: { targetFPS: 120 }
            }
          };
          
          draft.questionnaire = questionnaire;
          draft.currentPageId = questionnaire.pages[0]?.id || null;
          draft.selectedItemId = null;
          draft.selectedItemType = null;
          draft.undoStack = [];
          draft.redoStack = [];
          
          // Re-register variables if any
          if (variableEngine && questionnaire.variables.length > 0) {
            variableEngine.clear();
            questionnaire.variables.forEach(v => {
              variableEngine!.registerVariable(JSON.parse(JSON.stringify(v)));
            });
          }
        })
      );
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

      if (!state.questionnaire.projectId || !state.questionnaire.organizationId) {
        console.error('Missing project or organization context');
        update(s => produce(s, draft => {
          draft.saveError = 'Missing project or organization context';
        }));
        return false;
      }

      const result = await OfflinePersistenceService.saveQuestionnaire(
        state.questionnaire,
        state.userId,
        state.questionnaire.projectId,
        state.questionnaire.organizationId
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
          draft.questionnaire = result.questionnaire;
          draft.currentPageId = result.questionnaire.pages[0]?.id || null;
          draft.selectedItemId = null;
          draft.selectedItemType = null;
          draft.undoStack = [];
          draft.redoStack = [];
          draft.lastSaved = new Date();
          
          // Re-register variables (create plain copies to avoid proxy issues)
          if (variableEngine) {
            variableEngine.clear();
            result.questionnaire.variables.forEach(v => {
              variableEngine!.registerVariable(JSON.parse(JSON.stringify(v)));
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

      const projectId = state.questionnaire.projectId || generateUUID();
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
    
    return (page.questions ?? [])
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

// Block-related derived stores
export const currentPageBlocks = derived(
  designerStore,
  $state => {
    const page = $state.questionnaire.pages.find(p => p.id === $state.currentPageId);
    return page?.blocks || [];
  }
);

export const currentBlock = derived(
  designerStore,
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
  [designerStore, currentBlock],
  ([$state, $currentBlock]) => {
    if (!$currentBlock) return [];
    
    return $currentBlock.questions
      .map(qId => $state.questionnaire.questions.find(q => q.id === qId))
      .filter(Boolean) as Question[];
  }
);