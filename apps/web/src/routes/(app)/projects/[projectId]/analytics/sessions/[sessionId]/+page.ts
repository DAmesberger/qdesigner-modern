import type { PageLoad } from './$types';
import { api } from '$lib/services/api';
import { error } from '@sveltejs/kit';
import {
  buildQuestionIndex,
  resolveAnswer,
  selectPinnedContent,
  extractArmAssignment,
  type ResolvedAnswer,
  type VersionSnapshot,
} from '$lib/analytics/sessionRecord';
import type {
  Project,
  SessionData,
  SessionResponseRecord,
  InteractionEventRecord,
  SessionVariableRecord,
} from '$lib/shared/types/api';

export const ssr = false;

export interface SessionAnswerRow extends ResolvedAnswer {
  reactionTimeUs: number | null;
  answeredAt: string | null;
  presentedAt: string | null;
  clientId: string | null;
  metadata: Record<string, unknown>;
  rawValue: unknown;
}

export interface SessionRecordData {
  project: Project;
  session: SessionData;
  responses: SessionResponseRecord[];
  events: InteractionEventRecord[];
  variables: SessionVariableRecord[];
  answers: SessionAnswerRow[];
  arm: { condition: string; conditionIndex: number | null } | null;
  /** Semver of the definition snapshot the prompts were resolved against. */
  resolvedVersion: string | null;
  /** True when the exact pinned version was found; false ⇒ prompts are best-effort. */
  matchedPinnedVersion: boolean;
}

export const load: PageLoad = async ({ params, parent }): Promise<SessionRecordData> => {
  const { organizationId } = await parent();
  if (!organizationId) {
    throw error(403, 'No organization found');
  }

  const { projectId, sessionId } = params;

  let project: Project;
  let session: SessionData;
  let responses: SessionResponseRecord[];
  let events: InteractionEventRecord[];
  let variables: SessionVariableRecord[];

  try {
    project = await api.projects.get(projectId);
    if (!project) {
      throw error(404, 'Project not found');
    }
    session = await api.sessions.get(sessionId);
    [responses, events, variables] = await Promise.all([
      api.sessions.getResponses(sessionId),
      api.sessions.getEvents(sessionId),
      api.sessions.getVariables(sessionId),
    ]);
  } catch (err) {
    // SvelteKit errors thrown above carry a numeric status — re-throw as-is.
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    // The read endpoints return 404 for a missing session and 403 for a
    // researcher without access to its questionnaire; both surface here as a
    // plain Error (status stripped by the api client). For a read-only browser
    // either way means "this record isn't available to you".
    console.error('Error loading session record:', err);
    throw error(404, 'Session not found or not accessible');
  }

  // Resolve the answers against the exact definition version the session pinned,
  // falling back to the latest definition content when that snapshot is gone.
  let versions: VersionSnapshot[] = [];
  try {
    versions = (await api.questionnaires.listVersions(session.questionnaireId)) as VersionSnapshot[];
  } catch (err) {
    console.error('Error loading questionnaire versions:', err);
  }

  let fallback: { content: unknown; version: string | null } | null = null;
  try {
    const latest = await api.questionnaires.get(projectId, session.questionnaireId);
    const version =
      latest.version_major != null
        ? `${latest.version_major}.${latest.version_minor ?? 0}.${latest.version_patch ?? 0}`
        : null;
    fallback = { content: latest.content, version };
  } catch (err) {
    console.error('Error loading questionnaire definition:', err);
  }

  const pinned = selectPinnedContent(
    versions,
    {
      major: session.questionnaireVersionMajor ?? null,
      minor: session.questionnaireVersionMinor ?? null,
      patch: session.questionnaireVersionPatch ?? null,
    },
    fallback
  );

  const index = buildQuestionIndex(pinned.content);
  const answers: SessionAnswerRow[] = responses.map((response) => ({
    ...resolveAnswer(response, index),
    reactionTimeUs: response.reaction_time_us,
    answeredAt: response.answered_at,
    presentedAt: response.presented_at,
    clientId: (response as SessionResponseRecord & { client_id?: string | null }).client_id ?? null,
    metadata: response.metadata,
    rawValue: response.value,
  }));

  return {
    project,
    session,
    responses,
    events,
    variables,
    answers,
    arm: extractArmAssignment(variables),
    resolvedVersion: pinned.resolvedVersion,
    matchedPinnedVersion: pinned.matchedExact,
  };
};
