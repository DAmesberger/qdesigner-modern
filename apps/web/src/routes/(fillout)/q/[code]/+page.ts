import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { FilloutContentCache } from '$lib/fillout/services/FilloutContentCache';
import { OfflineSessionService } from '$lib/fillout/services/OfflineSessionService';
import { OfflineResponsePersistence } from '$lib/fillout/services/OfflineResponsePersistence';
import {
	storedResponseToRuntime,
	serverResponseToRuntime,
	storedVariablesToRecord,
	serverVariablesToRecord,
	type ResumeSnapshot,
} from '$lib/fillout/runtime/responseMapping';
import { api } from '$lib/services/api';
import type { FilloutSession } from '$lib/services/db/indexeddb';
import type { Response as RuntimeResponse } from '$lib/shared';
import type { QuestionnaireByCode, Session } from '$lib/api/generated/types.gen';
import type { FilloutDefinition, FilloutQuestionnairePayload } from '$lib/fillout/types';

export const ssr = false;

// Normalize a raw by-code / cached questionnaire JSON into the runtime-facing shape.
// The by-code payload types `definition` / `variables` / `global_scripts` as `unknown`
// (the JSONB columns are open-schema); we narrow `definition` to the concrete
// FilloutDefinition the page reads, and coerce the two script/variable maps.
function shapeQuestionnaire(
	raw: QuestionnaireByCode,
	projectName?: string
): FilloutQuestionnairePayload {
	return {
		id: raw.id,
		name: raw.name,
		definition: raw.definition as FilloutDefinition,
		variables: (raw.variables as Record<string, unknown>) || {},
		globalScripts: (raw.global_scripts as Record<string, unknown>) || {},
		projectName,
		versionMajor: raw.version_major ?? 1,
		versionMinor: raw.version_minor ?? 0,
		versionPatch: raw.version_patch ?? 0,
	};
}

export const load: PageLoad = async ({ params, url, fetch }) => {
	const code = params.code.toUpperCase();

	// Validate code format
	if (!code || !/^[A-Z0-9]{6,12}$/.test(code)) {
		throw error(404, 'Invalid questionnaire code');
	}

	// The latest published version (drives new sessions and validity gates).
	let latest: QuestionnaireByCode | null = null;

	// Try online first
	if (navigator.onLine) {
		try {
			const response = await fetch(`/api/questionnaires/by-code/${code}`);
			if (response.ok) {
				const payload = (await response.json()) as QuestionnaireByCode;
				latest = payload;
				// Cache the latest as a VERSIONED row — this adds a new (id, version) snapshot and
				// never overwrites the version an in-flight session pinned. Then opportunistically
				// GC unreferenced versions and bound the media cache (both fire-and-forget).
				await FilloutContentCache.cacheQuestionnaire(payload, code);
				void FilloutContentCache.pruneDefinitions().catch(() => {});
				void FilloutContentCache.enforceMediaQuota().catch(() => {});
			} else if (response.status === 404) {
				throw error(404, 'Questionnaire not found');
			} else {
				throw error(response.status, 'Failed to load questionnaire');
			}
		} catch (err) {
			// If it's a SvelteKit error, rethrow
			if (err && typeof err === 'object' && 'status' in err) {
				throw err;
			}
			// Network error — fall through to offline
			console.warn('Network error, trying offline cache:', err);
		}
	}

	// Offline fallback: load the latest cached version from IndexedDB.
	if (!latest) {
		const cached = await FilloutContentCache.getLatestOfflineQuestionnaire(code);
		if (!cached) {
			throw error(404, 'Questionnaire not available offline');
		}
		// The cached Dexie row stores the same by-code JSON, typed loosely as
		// Record<string, unknown>; it carries the QuestionnaireByCode shape.
		latest = cached as unknown as QuestionnaireByCode;
	}

	// Validate questionnaire is active (version-agnostic gate — checked against latest metadata)
	if (!latest.is_active) {
		throw error(403, 'This questionnaire is no longer active');
	}

	// Check date restrictions
	const now = new Date();
	if (latest.start_date && new Date(latest.start_date) > now) {
		throw error(403, 'This questionnaire is not yet available');
	}
	if (latest.end_date && new Date(latest.end_date) < now) {
		throw error(403, 'This questionnaire has ended');
	}

	// Extract all URL search params for distribution/variable mapping
	const urlParams: Record<string, string> = {};
	for (const [key, value] of url.searchParams.entries()) {
		urlParams[key] = value;
	}

	// Check for existing participant session via URL params
	const participantId = url.searchParams.get('pid');
	const sessionId = url.searchParams.get('sid');

	// Extract project name safely
	let projectName: string | undefined;
	if (latest.project) {
		if (Array.isArray(latest.project) && latest.project.length > 0) {
			projectName = latest.project[0]?.name;
		} else if (typeof latest.project === 'object' && 'name' in latest.project) {
			projectName = (latest.project as Record<string, unknown>).name as string;
		}
	}

	// ── Resume + version pinning (slice 2.2) ──────────────────────────────
	// A resumed/offline session must run against the EXACT version it started on, never the
	// latest. Resolve the pin from the server session addressed by ?sid= (online) or a local
	// active session (offline), then hand the runtime that pinned snapshot. Fresh sessions
	// pin the latest (resolved at create time in +page.svelte).
	let existingSession: Session | null = null;
	// The fetched server session regardless of status — a `completed` one is not an
	// `existingSession` (we don't re-run it) but still drives the completion short-circuit.
	let fetchedSession: Session | null = null;
	let pin: { major: number; minor: number; patch: number } | null = null;

	if (sessionId && navigator.onLine) {
		try {
			const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
			if (sessionResponse.ok) {
				const session = await sessionResponse.json();
				if (session.questionnaire_id === latest.id) {
					fetchedSession = session;
					if (session.status !== 'completed') {
						existingSession = session;
						pin = {
							major: session.questionnaire_version_major ?? latest.version_major ?? 1,
							minor: session.questionnaire_version_minor ?? latest.version_minor ?? 0,
							patch: session.questionnaire_version_patch ?? latest.version_patch ?? 0,
						};
					}
				}
			}
		} catch {
			// Session not found — proceed without
		}
	}

	// Offline resume: adopt a local active session's pin (no server round-trip available).
	// Hoisted so the resume-snapshot assembly below can reuse it (id + durable cursor).
	let localActive: FilloutSession | null = null;
	if (latest.id) {
		try {
			localActive = await OfflineSessionService.findActiveSession(latest.id as string);
		} catch {
			// No local session — proceed as a new session against the latest.
		}
	}
	if (!pin && localActive) {
		pin = {
			major: localActive.versionMajor,
			minor: localActive.versionMinor,
			patch: localActive.versionPatch,
		};
	}

	// Resolve which definition the runtime consumes.
	let effective: QuestionnaireByCode = latest;
	let pinnedFallback = false;
	if (pin) {
		const pinned = await FilloutContentCache.getPinnedOfflineQuestionnaire(
			latest.id as string,
			pin.major,
			pin.minor,
			pin.patch
		);
		if (pinned) {
			// Same cached-row shape as the offline fallback above.
			effective = pinned as unknown as QuestionnaireByCode;
		} else {
			// The session pinned a version this device never cached (started elsewhere or the
			// version was GC'd). We cannot reconstruct it — fall back to the latest snapshot but
			// keep the pinned version numbers so the session record stays coherent.
			pinnedFallback = true;
			effective = {
				...latest,
				version_major: pin.major,
				version_minor: pin.minor,
				version_patch: pin.patch,
			};
		}
	}

	// ── Resumable session hydration (E-OFF-1) ─────────────────────────────
	// Assemble the snapshot the runtime rehydrates from so an interrupted session
	// continues exactly where it left off. Prefer the local IndexedDB copy (same-device
	// reload / offline — zero network); fall back to the server's copy for a true
	// cross-device resume. A completed session short-circuits straight to the completion
	// screen (see +page.svelte) instead of re-running.
	let resumeSnapshot: ResumeSnapshot | null = null;
	let resumeCompleted = false;
	let resumeFromDevice = false;

	const resumeSessionId = fetchedSession?.id ?? localActive?.id ?? null;
	if (resumeSessionId) {
		let localRow: FilloutSession | undefined =
			localActive && localActive.id === resumeSessionId ? localActive : undefined;
		if (!localRow) {
			try {
				localRow = await OfflineSessionService.getSession(resumeSessionId);
			} catch {
				localRow = undefined;
			}
		}
		if (fetchedSession?.status === 'completed' || localRow?.status === 'completed') {
			resumeCompleted = true;
		}

		if (!resumeCompleted) {
			// 1. Same-device / offline: rehydrate from IndexedDB with zero network.
			let responses: RuntimeResponse[] = [];
			let variables: Record<string, unknown> = {};
			try {
				const [storedResponses, storedVariables] = await Promise.all([
					OfflineResponsePersistence.getSessionResponses(resumeSessionId),
					OfflineResponsePersistence.getSessionVariables(resumeSessionId),
				]);
				responses = storedResponses.map(storedResponseToRuntime);
				variables = storedVariablesToRecord(storedVariables);
			} catch {
				// IndexedDB unavailable — fall through to the server path when online.
			}

			// 2. Cross-device: nothing local but the server holds this session's answers.
			//    Reuses the existing get responses/variables handlers (auth-gated, so this
			//    path is available to authenticated resumers; anonymous participants stay
			//    limited to same-device IndexedDB resume).
			if (responses.length === 0 && navigator.onLine && existingSession) {
				try {
					const [serverResponses, serverVariables] = await Promise.all([
						api.sessions.getResponses(resumeSessionId),
						api.sessions.getVariables(resumeSessionId),
					]);
					responses = serverResponses.map(serverResponseToRuntime);
					variables = serverVariablesToRecord(serverVariables);
					resumeFromDevice = responses.length > 0;
				} catch {
					// Not readable over the API (anonymous / RLS) — same-device resume only.
				}
			}

			if (responses.length > 0) {
				resumeSnapshot = {
					responses,
					variables,
					itemIndex:
						typeof localRow?.lastItemIndex === 'number' ? localRow.lastItemIndex : undefined,
					pageId: typeof localRow?.lastPageId === 'string' ? localRow.lastPageId : undefined,
				};
			}
		}
	}

	return {
		questionnaire: shapeQuestionnaire(effective, projectName),
		existingSession,
		code,
		participantId,
		urlParams,
		preview: url.searchParams.get('preview') === 'true',
		isOffline: !navigator.onLine,
		pinnedFallback,
		resumeSnapshot,
		resumeCompleted,
		resumeFromDevice,
		// The session id to continue when resuming without a server `existingSession`
		// (offline reload, or an anonymous same-device reload the API won't return).
		// Only set when there is progress to restore, so a fresh start still creates
		// a new session rather than adopting an empty local one.
		resumeSessionId: resumeSnapshot ? resumeSessionId : null,
	};
};
