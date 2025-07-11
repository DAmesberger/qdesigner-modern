import { supabase, type Tables, type Inserts } from './supabase';
import type { Questionnaire, Question, Page, Variable } from '$lib/shared';
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
   */
  static async saveQuestionnaire(questionnaire: Questionnaire, userId: string): Promise<SaveResult> {
    try {
      // Start a transaction-like operation
      const questionnaireId = questionnaire.id || nanoid();
      
      // 1. Insert or update the questionnaire
      const { data: savedQuestionnaire, error: qError } = await supabase
        .from('questionnaires')
        .upsert({
          id: questionnaireId,
          user_id: userId,
          name: questionnaire.name,
          description: questionnaire.description,
          version: questionnaire.version,
          settings: questionnaire.settings || {},
          flow_control: questionnaire.flow || [],
          metadata: {
            created: questionnaire.created,
            modified: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (qError) throw qError;

      // 2. Delete existing pages, questions, and variables (for simplicity)
      await supabase.from('questions').delete().eq('questionnaire_id', questionnaireId);
      await supabase.from('pages').delete().eq('questionnaire_id', questionnaireId);
      await supabase.from('variables').delete().eq('questionnaire_id', questionnaireId);

      // 3. Insert pages
      if (questionnaire.pages.length > 0) {
        const pages = questionnaire.pages.map((page, index) => ({
          id: page.id,
          questionnaire_id: questionnaireId,
          name: page.name,
          order_index: index,
          layout: page.layout,
          settings: page.settings || {}
        }));

        const { error: pagesError } = await supabase
          .from('pages')
          .insert(pages);

        if (pagesError) throw pagesError;
      }

      // 4. Insert questions
      const allQuestions: Inserts<'questions'>[] = [];
      questionnaire.pages.forEach((page) => {
        page.questions.forEach((questionId, index) => {
          const question = questionnaire.questions.find(q => q.id === questionId);
          if (question) {
            allQuestions.push({
              id: question.id,
              questionnaire_id: questionnaireId,
              page_id: page.id,
              type: question.type,
              text: question.text,
              name: question.name,
              order_index: index,
              required: question.required || false,
              settings: question.settings || {},
              validation: question.validation || {},
              media: question.media || []
            });
          }
        });
      });

      if (allQuestions.length > 0) {
        const { error: questionsError } = await supabase
          .from('questions')
          .insert(allQuestions);

        if (questionsError) throw questionsError;
      }

      // 5. Insert variables
      if (questionnaire.variables.length > 0) {
        const variables = questionnaire.variables.map((variable, index) => ({
          id: variable.id,
          questionnaire_id: questionnaireId,
          name: variable.name,
          type: variable.type,
          default_value: variable.defaultValue,
          formula: variable.formula,
          description: variable.description,
          order_index: index,
          metadata: variable.metadata || {}
        }));

        const { error: variablesError } = await supabase
          .from('variables')
          .insert(variables);

        if (variablesError) throw variablesError;
      }

      return {
        success: true,
        questionnaireId
      };
    } catch (error) {
      console.error('Error saving questionnaire:', error);
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
      // 1. Load questionnaire
      const { data: questionnaire, error: qError } = await supabase
        .from('questionnaires')
        .select('*')
        .eq('id', questionnaireId)
        .single();

      if (qError) throw qError;
      if (!questionnaire) throw new Error('Questionnaire not found');

      // 2. Load pages
      const { data: pages, error: pagesError } = await supabase
        .from('pages')
        .select('*')
        .eq('questionnaire_id', questionnaireId)
        .order('order_index');

      if (pagesError) throw pagesError;

      // 3. Load questions
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('questionnaire_id', questionnaireId);

      if (questionsError) throw questionsError;

      // 4. Load variables
      const { data: variables, error: variablesError } = await supabase
        .from('variables')
        .select('*')
        .eq('questionnaire_id', questionnaireId)
        .order('order_index');

      if (variablesError) throw variablesError;

      // 5. Reconstruct the questionnaire object
      const reconstructedQuestionnaire: Questionnaire = {
        id: questionnaire.id,
        name: questionnaire.name,
        description: questionnaire.description || '',
        version: questionnaire.version,
        created: new Date(questionnaire.created_at),
        modified: new Date(questionnaire.updated_at),
        settings: questionnaire.settings || {},
        flow: questionnaire.flow_control || [],
        variables: variables.map(v => ({
          id: v.id,
          name: v.name,
          type: v.type as Variable['type'],
          defaultValue: v.default_value,
          formula: v.formula || undefined,
          description: v.description || undefined,
          metadata: v.metadata || {}
        })),
        questions: questions.map(q => ({
          id: q.id,
          type: q.type as QuestionType,
          text: q.text,
          name: q.name,
          required: q.required,
          settings: q.settings || {},
          validation: q.validation || {},
          media: q.media || []
        })),
        pages: pages.map(p => ({
          id: p.id,
          name: p.name,
          questions: questions
            .filter(q => q.page_id === p.id)
            .sort((a, b) => a.order_index - b.order_index)
            .map(q => q.id),
          layout: p.layout,
          settings: p.settings || {}
        }))
      };

      return {
        success: true,
        questionnaire: reconstructedQuestionnaire
      };
    } catch (error) {
      console.error('Error loading questionnaire:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * List questionnaires for a user
   */
  static async listQuestionnaires(userId: string) {
    try {
      const { data, error } = await supabase
        .from('questionnaires')
        .select('id, name, description, version, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        questionnaires: data || []
      };
    } catch (error) {
      console.error('Error listing questionnaires:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        questionnaires: []
      };
    }
  }

  /**
   * Delete a questionnaire
   */
  static async deleteQuestionnaire(questionnaireId: string, userId: string) {
    try {
      const { error } = await supabase
        .from('questionnaires')
        .delete()
        .eq('id', questionnaireId)
        .eq('user_id', userId);

      if (error) throw error;

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting questionnaire:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}