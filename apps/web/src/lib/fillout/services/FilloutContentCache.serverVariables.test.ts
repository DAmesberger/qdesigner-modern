import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, filloutDefinitionKey } from '$lib/services/db/indexeddb';
import { declHash } from '@qdesigner/questionnaire-core';
import { FilloutContentCache } from './FilloutContentCache';

/**
 * SV-offline-sync-inject: cacheServerVariables fetches + caches the version-pinned
 * server aggregates, skips the network within the freshness window (unless forced),
 * short-circuits with zero cost when no declarations exist, and pruneDefinitions()
 * GCs orphaned server-variable rows while sparing protected/latest versions.
 */

const QID = 'qn-sv-cache';
const KEY = filloutDefinitionKey(QID, 1, 0, 0);

const SERVER_DECL = { source: 'variable' as const, key: 'score.anxiety', stat: 'mean' as const };

function questionnaireData(refreshMs?: number) {
	return {
		id: QID,
		version_major: 1,
		version_minor: 0,
		version_patch: 0,
		definition: {
			variables: [
				{ id: 'sv1', name: 'cohortMean', type: 'number', scope: 'global', server: SERVER_DECL },
			],
			settings: refreshMs != null ? { report: { refreshMs } } : {},
		},
	};
}

function statsResponse() {
	return {
		questionnaire_id: QID,
		version: '1.0.0',
		computed_at: '2026-05-05T00:00:00Z',
		fallback_registry: false,
		variables: [
			{
				id: 'sv1',
				name: 'cohortMean',
				source: 'variable',
				key: 'score.anxiety',
				decl_hash: declHash(SERVER_DECL),
				sample_count: 42,
				stats: {
					sample_count: 42,
					mean: 50,
					median: 48,
					std_dev: 10,
					min: 10,
					max: 90,
					p10: 20,
					p25: 30,
					p50: 48,
					p75: 65,
					p90: 80,
					p95: 85,
					p99: 88,
				},
			},
		],
	};
}

function mockFetch(body: unknown) {
	const fn = vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response);
	vi.stubGlobal('fetch', fn);
	return fn;
}

beforeEach(async () => {
	await db.filloutServerVariables.clear();
	await db.filloutQuestionnaires.clear();
	await db.filloutSessions.clear();
	await db.filloutResponses.clear();
	await db.filloutEvents.clear();
	await db.filloutVariables.clear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('FilloutContentCache.cacheServerVariables', () => {
	it('short-circuits with NO fetch when the definition declares no server variables', async () => {
		const fetchFn = mockFetch(statsResponse());
		await FilloutContentCache.cacheServerVariables({
			id: QID,
			version_major: 1,
			version_minor: 0,
			version_patch: 0,
			definition: { variables: [{ id: 'x', name: 'plain', type: 'number', scope: 'global' }] },
		});
		expect(fetchFn).not.toHaveBeenCalled();
		expect(await db.filloutServerVariables.count()).toBe(0);
	});

	it('fetches and writes a [definitionKey+variableId] row with mapped stats', async () => {
		const fetchFn = mockFetch(statsResponse());
		await FilloutContentCache.cacheServerVariables(questionnaireData());
		expect(fetchFn).toHaveBeenCalledTimes(1);

		const row = await db.filloutServerVariables.get([KEY, 'sv1']);
		expect(row).toBeTruthy();
		expect(row!.definitionKey).toBe(KEY);
		expect(row!.n).toBe(42);
		expect(row!.stats?.mean).toBe(50);
		expect(row!.stats?.stdDev).toBe(10);
		expect(row!.stats?.median).toBe(48);
		expect(row!.computedAt).toBe('2026-05-05T00:00:00Z');
		expect(row!.declHash).toBe(declHash(SERVER_DECL));
	});

	it('skips the network within the freshness window, and force bypasses it', async () => {
		const fetchFn = mockFetch(statsResponse());
		// refreshMs is large so a second call within it should skip.
		await FilloutContentCache.cacheServerVariables(questionnaireData(60_000));
		expect(fetchFn).toHaveBeenCalledTimes(1);

		await FilloutContentCache.cacheServerVariables(questionnaireData(60_000));
		expect(fetchFn).toHaveBeenCalledTimes(1); // skipped — still fresh

		await FilloutContentCache.cacheServerVariables(questionnaireData(60_000), undefined, {
			force: true,
		});
		expect(fetchFn).toHaveBeenCalledTimes(2); // forced through
	});

	it('drops an entry whose decl_hash disagrees with the local declaration', async () => {
		const body = statsResponse();
		body.variables[0]!.decl_hash = 'deadbeefmismatch';
		mockFetch(body);
		await FilloutContentCache.cacheServerVariables(questionnaireData());
		expect(await db.filloutServerVariables.count()).toBe(0);
	});
});

describe('FilloutContentCache.pruneDefinitions server-variable GC', () => {
	it('deletes orphaned server-variable rows but keeps rows for the latest/protected version', async () => {
		const latestKey = filloutDefinitionKey(QID, 2, 0, 0);
		const orphanKey = filloutDefinitionKey(QID, 1, 0, 0);

		// A cached definition at v2 → its key is retained as "latest".
		await db.filloutQuestionnaires.put({
			id: latestKey,
			questionnaireId: QID,
			accessCode: 'ABC123',
			versionMajor: 2,
			versionMinor: 0,
			versionPatch: 0,
			data: {},
			syncedAt: Date.now(),
		});

		const mkRow = (definitionKey: string) => ({
			definitionKey,
			variableId: 'sv1',
			name: 'cohortMean',
			declHash: declHash(SERVER_DECL),
			questionnaireId: QID,
			n: 10,
			stats: null,
			computedAt: '2026-05-05T00:00:00Z',
			syncedAt: Date.now(),
		});
		await db.filloutServerVariables.bulkPut([mkRow(latestKey), mkRow(orphanKey)]);

		await FilloutContentCache.pruneDefinitions();

		expect(await db.filloutServerVariables.get([latestKey, 'sv1'])).toBeTruthy();
		expect(await db.filloutServerVariables.get([orphanKey, 'sv1'])).toBeUndefined();
	});
});
