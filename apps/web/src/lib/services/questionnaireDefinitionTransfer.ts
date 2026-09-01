import type { DefinitionArtifact } from '$lib/api/generated/types.gen';
import { api } from '$lib/services/api';

const QDEF_MEDIA_TYPE = 'application/vnd.qdesigner.questionnaire+json';

function safeFileStem(name: string): string {
  const stem = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem || 'questionnaire';
}

/** Download server-emitted canonical bytes without reserializing the QDef in the browser. */
export async function downloadQuestionnaireDefinition(
  projectId: string,
  questionnaireId: string
): Promise<DefinitionArtifact> {
  const artifact = await api.questionnaires.exportDefinition(projectId, questionnaireId);
  const blob = new Blob([artifact.canonical], { type: `${QDEF_MEDIA_TYPE};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileStem(artifact.metadata.questionnaireName)}.qdef.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return artifact;
}
