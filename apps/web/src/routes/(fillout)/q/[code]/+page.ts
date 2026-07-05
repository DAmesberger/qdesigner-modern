import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { FilloutOfflineSyncService } from '$lib/fillout/services/FilloutOfflineSyncService';
import { OfflineSessionService } from '$lib/fillout/services/OfflineSessionService';
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
				await FilloutOfflineSyncService.cacheQuestionnaire(payload, code);
				void FilloutOfflineSyncService.pruneDefinitions().catch(() => {});
				void FilloutOfflineSyncService.enforceMediaQuota().catch(() => {});
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
		const cached = await FilloutOfflineSyncService.getLatestOfflineQuestionnaire(code);
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
	let pin: { major: number; minor: number; patch: number } | null = null;

	if (sessionId && navigator.onLine) {
		try {
			const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
			if (sessionResponse.ok) {
				const session = await sessionResponse.json();
				if (session.questionnaire_id === latest.id && session.status !== 'completed') {
					existingSession = session;
					pin = {
						major: session.questionnaire_version_major ?? latest.version_major ?? 1,
						minor: session.questionnaire_version_minor ?? latest.version_minor ?? 0,
						patch: session.questionnaire_version_patch ?? latest.version_patch ?? 0,
					};
				}
			}
		} catch {
			// Session not found — proceed without
		}
	}

	// Offline resume: adopt a local active session's pin (no server round-trip available).
	if (!pin && latest.id) {
		try {
			const local = await OfflineSessionService.findActiveSession(latest.id as string);
			if (local) {
				pin = { major: local.versionMajor, minor: local.versionMinor, patch: local.versionPatch };
			}
		} catch {
			// No local session — proceed as a new session against the latest.
		}
	}

	// Resolve which definition the runtime consumes.
	let effective: QuestionnaireByCode = latest;
	let pinnedFallback = false;
	if (pin) {
		const pinned = await FilloutOfflineSyncService.getPinnedOfflineQuestionnaire(
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

	return {
		questionnaire: shapeQuestionnaire(effective, projectName),
		existingSession,
		code,
		participantId,
		urlParams,
		preview: url.searchParams.get('preview') === 'true',
		isOffline: !navigator.onLine,
		pinnedFallback,
	};
};
