import type { Questionnaire } from '$lib/shared/types/questionnaire';
import { QuestionnairePersistenceService } from '$lib/services/questionnairePersistence';
import { api } from '$lib/services/api';

export interface PersistedQuestionnaireSummary {
  id: string;
  name: string;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavePayload {
  projectId: string;
  questionnaire: Questionnaire;
}

export class DesignerPersistenceService {
  public async createQuestionnaire(
    projectId: string,
    data: {
      name: string;
      description?: string;
      content: Record<string, unknown>;
      settings?: Record<string, unknown>;
    }
  ): Promise<{ id: string }> {
    const created = await api.questionnaires.create(projectId, {
      name: data.name,
      description: data.description,
      content: data.content,
      settings: data.settings || {},
    });

    return { id: created.id };
  }

  public async save({ projectId, questionnaire }: SavePayload): Promise<{ success: boolean; id?: string; error?: string }> {
    const result = await QuestionnairePersistenceService.saveQuestionnaire(questionnaire, projectId);
    return {
      success: result.success,
      id: result.questionnaireId,
      error: result.error,
    };
  }

  public async list(projectId: string): Promise<PersistedQuestionnaireSummary[]> {
    const result = await QuestionnairePersistenceService.listQuestionnaires(projectId);
    if (!result.success || !result.questionnaires) {
      return [];
    }

    return result.questionnaires;
  }

  public async load(projectId: string, questionnaireId: string): Promise<Questionnaire | null> {
    const result = await QuestionnairePersistenceService.loadQuestionnaire(projectId, questionnaireId);
    if (!result.success || !result.questionnaire) {
      return null;
    }

    return result.questionnaire;
  }

  public async publish(projectId: string, questionnaireId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await api.questionnaires.publish(projectId, questionnaireId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to publish questionnaire',
      };
    }
  }
}
