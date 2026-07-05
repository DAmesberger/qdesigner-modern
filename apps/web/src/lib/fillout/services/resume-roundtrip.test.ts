import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/services/db/indexeddb';
import { OfflineResponsePersistence } from './OfflineResponsePersistence';
import {
	storedResponseToRuntime,
	serverResponseToRuntime,
	storedVariablesToRecord,
	serverVariablesToRecord,
} from '../runtime/responseMapping';
import type { SessionResponseRecord, SessionVariableRecord } from '$lib/shared/types/api';

/**
 * E-OFF-1: the offline resume roundtrip. A response persisted the way the live save path
 * writes it (ResponsePersistenceService.saveResponse → OfflineResponsePersistence.saveResponse:
 * ms→µs, derived timing keys folded into metadata) must map cleanly back into the runtime
 * Response shape so a rehydrated session sees the same answers. Save and hydrate stay in
 * lockstep through responseMapping.ts.
 */
describe('resume roundtrip — offline (IndexedDB)', () => {
	const sessionId = 'sess-resume-1';

	beforeEach(async () => {
		await db.filloutResponses.clear();
		await db.filloutVariables.clear();
	});

	async function saveLikeLivePath(input: {
		questionId: string;
		value: unknown;
		stimulusOnsetMs: number;
		responseTimeMs: number;
		reactionTimeMs: number;
		pageId: string;
	}): Promise<void> {
		const origin = typeof performance !== 'undefined' ? performance.timeOrigin : 0;
		// Field shape produced by ResponsePersistenceService.saveResponse (the forward half
		// of the mapping this test asserts is invertible).
		await OfflineResponsePersistence.saveResponse(sessionId, {
			questionId: input.questionId,
			value: input.value,
			reactionTimeUs: Math.floor(input.reactionTimeMs * 1000),
			presentedAt: new Date(origin + input.stimulusOnsetMs).toISOString(),
			answeredAt: new Date(origin + input.responseTimeMs).toISOString(),
			metadata: {
				pageId: input.pageId,
				stimulusOnsetUs: Math.floor(input.stimulusOnsetMs * 1000),
				responseTimeUs: Math.floor(input.responseTimeMs * 1000),
				timeOnQuestionMs: input.responseTimeMs - input.stimulusOnsetMs,
				questionType: 'single-choice',
			},
		});
	}

	it('maps a persisted response back into the runtime Response shape without loss', async () => {
		await saveLikeLivePath({
			questionId: 'q1',
			value: 'apple',
			stimulusOnsetMs: 1000,
			responseTimeMs: 1450,
			reactionTimeMs: 450,
			pageId: 'p1',
		});

		const stored = await OfflineResponsePersistence.getSessionResponses(sessionId);
		expect(stored).toHaveLength(1);

		const response = storedResponseToRuntime(stored[0]!);
		expect(response.questionId).toBe('q1');
		expect(response.value).toBe('apple');
		expect(response.reactionTime).toBe(450);
		expect(response.stimulusOnsetTime).toBe(1000);
		expect(response.timestamp).toBe(1450);
		expect(response.pageId).toBe('p1');
		// `valid` is not persisted (a stored row was a real submitted answer) → restored true.
		expect(response.valid).toBe(true);
		// The clientId UUID becomes the stable runtime response id.
		expect(response.id).toBe(stored[0]!.clientId);
	});

	it('restores several answers and their variable state for a mid-session resume', async () => {
		await saveLikeLivePath({
			questionId: 'q1',
			value: 'a',
			stimulusOnsetMs: 100,
			responseTimeMs: 300,
			reactionTimeMs: 200,
			pageId: 'p1',
		});
		await saveLikeLivePath({
			questionId: 'q2',
			value: 7,
			stimulusOnsetMs: 400,
			responseTimeMs: 900,
			reactionTimeMs: 500,
			pageId: 'p1',
		});

		await OfflineResponsePersistence.saveVariable(sessionId, 'score', 12);
		await OfflineResponsePersistence.saveVariable(sessionId, 'q1', 'a');

		const stored = await OfflineResponsePersistence.getSessionResponses(sessionId);
		const responses = stored.map(storedResponseToRuntime);
		const answeredIds = new Set(responses.map((r) => r.questionId));
		expect(answeredIds).toEqual(new Set(['q1', 'q2']));
		expect(responses.find((r) => r.questionId === 'q2')?.value).toBe(7);

		const variables = storedVariablesToRecord(
			await OfflineResponsePersistence.getSessionVariables(sessionId)
		);
		expect(variables.score).toBe(12);
		expect(variables.q1).toBe('a');
	});
});

/**
 * E-OFF-1: the cross-device resume roundtrip. Server rows (GET /api/sessions/{id}/responses
 * and /variables) carry the same metadata blob synced from IndexedDB, so the server mapper
 * reconstructs the same runtime Response shape.
 */
describe('resume roundtrip — cross-device (server rows)', () => {
	it('maps a server response record into the runtime Response shape', () => {
		const record: SessionResponseRecord = {
			id: 'server-resp-1',
			session_id: 'sess-x',
			question_id: 'q3',
			value: 'banana',
			reaction_time_us: 620_000,
			presented_at: null,
			answered_at: null,
			metadata: { pageId: 'p2', stimulusOnsetUs: 2_000_000, responseTimeUs: 2_620_000 },
			created_at: null,
		};

		const response = serverResponseToRuntime(record);
		expect(response.id).toBe('server-resp-1');
		expect(response.questionId).toBe('q3');
		expect(response.value).toBe('banana');
		expect(response.reactionTime).toBe(620);
		expect(response.stimulusOnsetTime).toBe(2000);
		expect(response.timestamp).toBe(2620);
		expect(response.pageId).toBe('p2');
		expect(response.valid).toBe(true);
	});

	it('flattens server variable records to a name→value map', () => {
		const rows: SessionVariableRecord[] = [
			{ id: '1', session_id: 's', variable_name: 'score', variable_value: 5, updated_at: null },
			{ id: '2', session_id: 's', variable_name: 'group', variable_value: 'A', updated_at: null },
		];
		expect(serverVariablesToRecord(rows)).toEqual({ score: 5, group: 'A' });
	});
});
