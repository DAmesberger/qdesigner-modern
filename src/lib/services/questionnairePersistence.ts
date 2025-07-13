import { supabase } from './supabase';
import type { Questionnaire } from '$lib/shared';
import { nanoid } from 'nanoid';

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
   * Save a questionnaire to Supabase
   * Note: This implementation stores the entire questionnaire as JSONB in questionnaire_definitions table
   * according to the actual database schema
   */
  static async saveQuestionnaire(
    questionnaire: Questionnaire, 
    projectId: string,
    organizationId: string,
    userId: string
  ): Promise<SaveResult> {
    try {
      const questionnaireId = questionnaire.id || nanoid();
      
      // Prepare the questionnaire definition for storage
      const definition = {
        id: questionnaireId,
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

      // Insert or update the questionnaire definition
      const { data, error } = await supabase
        .from('questionnaire_definitions')
        .upsert({
          id: questionnaireId,
          organization_id: organizationId,
          project_id: projectId,
          name: questionnaire.name,
          code: questionnaire.code || null,
          version: questionnaire.version || 1,
          definition, // Store entire questionnaire as JSONB
          variables: questionnaire.variables || [], // Store variables separately for querying
          status: 'draft',
          settings: questionnaire.settings || {},
          created_by: userId,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        questionnaireId
      };
    } catch (error) {
      console.error('Error saving questionnaire:', error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Load a questionnaire from Supabase
   */
  static async loadQuestionnaire(questionnaireId: string): Promise<LoadResult> {
    try {
      // Load questionnaire definition
      const { data, error } = await supabase
        .from('questionnaire_definitions')
        .select('*')
        .eq('id', questionnaireId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Questionnaire not found');

      // Extract questionnaire from the JSONB definition
      const questionnaire: Questionnaire = {
        id: data.definition.id || data.id,
        name: data.definition.name || data.name,
        description: data.definition.description || '',
        version: data.definition.version || data.version,
        pages: data.definition.pages || [],
        questions: data.definition.questions || [],
        variables: data.definition.variables || [],
        settings: data.definition.settings || {},
        flow: data.definition.flow || [],
        created: data.definition.created || data.created_at,
        modified: data.definition.modified || data.updated_at
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
      created_at: string;
      updated_at: string;
    }>;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from('questionnaire_definitions')
        .select('id, name, version, status, created_at, updated_at')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        questionnaires: data || []
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
  static async deleteQuestionnaire(questionnaireId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('questionnaire_definitions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', questionnaireId);

      if (error) throw error;

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