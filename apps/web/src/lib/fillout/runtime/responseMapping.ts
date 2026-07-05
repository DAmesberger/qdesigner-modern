import type { Response } from '$lib/shared';
import type { SessionResponseRecord, SessionVariableRecord } from '$lib/shared/types/api';
import type { StoredFilloutResponse } from '../services/OfflineResponsePersistence';
import type { FilloutVariable } from '$lib/services/db/indexeddb';

/**
 * A resume snapshot: the persisted answers + variable state a paused/cross-device
 * session rehydrates from (E-OFF-1). `responses` seed the runtime's response
 * pipeline and skip set; `variables` restore {{var}} interpolation; the optional
 * cursor hints position the progress display before the runtime recomputes the
 * true first-unanswered item.
 */
export interface ResumeSnapshot {
	responses: Response[];
	variables: Record<string, unknown>;
	itemIndex?: number;
	pageId?: string;
}

/**
 * Inverse of the persistence field mapping (ResponsePersistenceService.saveResponse
 * → OfflineResponsePersistence.saveResponse). A runtime {@link Response} is stored as:
 *   reactionTime(ms)   → reactionTimeUs(µs)
 *   stimulusOnset(ms)  → metadata.stimulusOnsetUs(µs) (+ presentedAt ISO)
 *   timestamp(ms)      → metadata.responseTimeUs(µs) (+ answeredAt ISO)
 *   pageId             → metadata.pageId
 * so hydration reads those back. `valid` is not persisted (a stored row was a real
 * submitted answer) → defaults true. Kept here, next to the server-record mapper,
 * so the save path and the resume path stay in lockstep.
 */
export function storedResponseToRuntime(stored: StoredFilloutResponse): Response {
	const meta = (stored.metadata ?? {}) as Record<string, unknown>;
	const metadata = mergeProvenance(meta, stored.timingProvenance);
	return {
		id: stored.clientId,
		questionId: stored.questionId,
		pageId: typeof meta.pageId === 'string' ? meta.pageId : undefined,
		timestamp: usToMs(meta.responseTimeUs) ?? 0,
		value: stored.value,
		reactionTime: stored.reactionTimeUs != null ? stored.reactionTimeUs / 1000 : undefined,
		stimulusOnsetTime: usToMs(meta.stimulusOnsetUs),
		valid: true,
		metadata: metadata as Response['metadata'],
	};
}

/**
 * Map a server-fetched response row (GET /api/sessions/{id}/responses) into the
 * runtime {@link Response} shape for cross-device resume. The server metadata blob
 * is the same one synced from IndexedDB, so it carries the same derived keys
 * (stimulusOnsetUs / responseTimeUs / pageId) the stored mapper reads.
 */
export function serverResponseToRuntime(record: SessionResponseRecord): Response {
	const meta = (record.metadata ?? {}) as Record<string, unknown>;
	return {
		id: record.id,
		questionId: record.question_id,
		pageId: typeof meta.pageId === 'string' ? meta.pageId : undefined,
		timestamp: usToMs(meta.responseTimeUs) ?? 0,
		value: record.value,
		reactionTime: record.reaction_time_us != null ? record.reaction_time_us / 1000 : undefined,
		stimulusOnsetTime: usToMs(meta.stimulusOnsetUs),
		valid: true,
		metadata: meta as Response['metadata'],
	};
}

/** Flatten offline variable rows to the name→value map the runtime interpolates against. */
export function storedVariablesToRecord(vars: FilloutVariable[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const v of vars) out[v.name] = v.value;
	return out;
}

/** Flatten server variable rows (GET /api/sessions/{id}/variables) to a name→value map. */
export function serverVariablesToRecord(vars: SessionVariableRecord[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const v of vars) out[v.variable_name] = v.variable_value;
	return out;
}

function usToMs(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value / 1000 : undefined;
}

/**
 * The stored row carries timing provenance both as a top-level field and possibly
 * already inside metadata; surface it on the runtime response's metadata so
 * downstream audit keeps it after a resume.
 */
function mergeProvenance(
	meta: Record<string, unknown>,
	provenance: StoredFilloutResponse['timingProvenance']
): Record<string, unknown> {
	if (!provenance || meta.timingProvenance) return meta;
	return { ...meta, timingProvenance: provenance };
}
