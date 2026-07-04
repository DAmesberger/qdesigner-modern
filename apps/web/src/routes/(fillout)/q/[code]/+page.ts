import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { FilloutOfflineSyncService } from '$lib/fillout/services/FilloutOfflineSyncService';
import { OfflineSessionService } from '$lib/fillout/services/OfflineSessionService';

export const ssr = false;

// Normalize a raw by-code / cached questionnaire JSON into the runtime-facing shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeQuestionnaire(raw: any, projectName?: string) {
	return {
		id: raw.id,
		name: raw.name,
		definition: raw.definition,
		variables: raw.variables || {},
		globalScripts: raw.global_scripts || {},
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let latest: any = null;

	// Try online first
	if (navigator.onLine) {
		try {
			const response = await fetch(`/api/questionnaires/by-code/${code}`);
			if (response.ok) {
				latest = await response.json();
				// Cache the latest as a VERSIONED row — this adds a new (id, version) snapshot and
				// never overwrites the version an in-flight session pinned. Then opportunistically
				// GC unreferenced versions and bound the media cache (both fire-and-forget).
				await FilloutOfflineSyncService.cacheQuestionnaire(latest, code);
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
		latest = cached;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let existingSession: any = null;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let effective: any = latest;
	let pinnedFallback = false;
	if (pin) {
		const pinned = await FilloutOfflineSyncService.getPinnedOfflineQuestionnaire(
			latest.id as string,
			pin.major,
			pin.minor,
			pin.patch
		);
		if (pinned) {
			effective = pinned;
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
