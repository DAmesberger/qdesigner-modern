import { api } from './api';
import type { Questionnaire } from '$lib/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- persistence layer hydrates dynamic questionnaire JSON payloads
type DynamicValue = any;

export interface SaveResult {
  success: boolean;
  questionnaireId?: string;
  error?: string;
}

export interface LoadResult {
  success: boolean;
  questionnaire?: Questionnaire;
  error?: string;
}

export class QuestionnairePersistenceService {
  /**
   * Save a questionnaire to the backend API
   * Stores the entire questionnaire as JSONB in questionnaire_definitions table
   */
  static async saveQuestionnaire(
    questionnaire: Questionnaire,
    projectId: string
  ): Promise<SaveResult> {
    try {
      const content = {
        id: questionnaire.id,
        name: questionnaire.name,
        description: questionnaire.description,
        version: questionnaire.version,
        pages: questionnaire.pages,
        questions: questionnaire.questions,
        variables: questionnaire.variables,
        settings: questionnaire.settings,
        flow: questionnaire.flow,
        created: questionnaire.created,
        modified: new Date().toISOString()
      };

      if (questionnaire.id) {
        // Update existing questionnaire
        await api.questionnaires.update(projectId, questionnaire.id, {
          name: questionnaire.name,
          description: questionnaire.description,
          content,
          settings: (questionnaire.settings || {}) as Record<string, unknown>
        });

        return {
          success: true,
          questionnaireId: questionnaire.id
        };
      } else {
        // Create new questionnaire
        const result = await api.questionnaires.create(projectId, {
          name: questionnaire.name,
          description: questionnaire.description,
          content,
          settings: (questionnaire.settings || {}) as Record<string, unknown>
        });

        return {
          success: true,
          questionnaireId: result.id
        };
      }
    } catch (error) {
      console.error('Error saving questionnaire:', error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Load a questionnaire from the backend API
   */
  static async loadQuestionnaire(projectId: string, questionnaireId: string): Promise<LoadResult> {
    try {
      const data = await api.questionnaires.get(projectId, questionnaireId);

      if (!data) throw new Error('Questionnaire not found');

      // Extract questionnaire from the JSONB content
      const content = data.content || {};
      const questionnaire: Questionnaire = {
        id: (content as DynamicValue).id || data.id,
        name: (content as DynamicValue).name || data.name,
        description: (content as DynamicValue).description || data.description || '',
        version: (content as DynamicValue).version || `${data.version}.0.0`,
        pages: (content as DynamicValue).pages || [],
        questions: (content as DynamicValue).questions || [],
        variables: (content as DynamicValue).variables || [],
        settings: (content as DynamicValue).settings || data.settings || {},
        flow: (content as DynamicValue).flow || [],
        created: (content as DynamicValue).created || data.createdAt,
        modified: (content as DynamicValue).modified || data.updatedAt
      };

      return {
        success: true,
        questionnaire
      };
    } catch (error) {
      console.error('Error loading questionnaire:', error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * List questionnaires for a project
   */
  static async listQuestionnaires(projectId: string): Promise<{
    success: boolean;
    questionnaires?: Array<{
      id: string;
      name: string;
      version: number;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
    error?: string;
  }> {
    try {
      const data = await api.questionnaires.list(projectId);

      return {
        success: true,
        questionnaires: (data || []).map((q) => ({
          id: q.id,
          name: q.name,
          version: q.version,
          status: q.status,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt
        }))
      };
    } catch (error) {
      console.error('Error listing questionnaires:', error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete a questionnaire
   */
  static async deleteQuestionnaire(projectId: string, questionnaireId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await api.questionnaires.delete(projectId, questionnaireId);

      return { success: true };
    } catch (error) {
      console.error('Error deleting questionnaire:', error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}
