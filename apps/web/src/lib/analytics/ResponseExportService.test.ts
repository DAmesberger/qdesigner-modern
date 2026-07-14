/**
 * The response-export contract, asserted on the real artifacts the producers
 * emit — the CSV bytes, the five stats-script bundles unzipped, and the XLSX
 * workbook re-read through ExcelJS.
 *
 * Two properties are load-bearing:
 *  - Reproducibility: every path carries the questionnaire version pin and the
 *    per-response timing provenance, or the export cannot be replicated / trusted.
 *  - Safety: a participant-supplied value is never live in a researcher's
 *    spreadsheet.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ExportRow } from '$lib/shared/types/api';
import {
	COLUMNS,
	exportToExcel,
	exportWithScript,
	rowToRecord,
	rowsToCsv,
	type ScriptFormat,
} from './ResponseExportService';

const SCRIPT_FORMATS: ScriptFormat[] = ['spss', 'r', 'stata', 'sas', 'python'];

/** The payload a hostile participant supplies as their id / free-text answer. */
const INJECTION = "=cmd|'/c calc'!A1";

const PROVENANCE = {
	onsetMethod: 'raf',
	responseMethod: 'event.timeStamp',
	displayLatencyMs: 8.3,
	frameStats: { fps: 60, droppedFrames: 0, jitter: 0.4 },
};

function baseRow(overrides: Partial<ExportRow> = {}): ExportRow {
	return {
		session_id: 'sess-1',
		participant_id: 'p-1',
		session_status: 'completed',
		started_at: '2026-07-14T10:00:00Z',
		completed_at: '2026-07-14T10:05:00Z',
		question_id: 'q-1',
		value: 'congruent',
		reaction_time_us: 420_000,
		presented_at: '2026-07-14T10:01:00Z',
		answered_at: '2026-07-14T10:01:01Z',
		questionnaire_version_major: 1,
		questionnaire_version_minor: 4,
		questionnaire_version_patch: 2,
		timing_provenance: PROVENANCE,
		...overrides,
	};
}

/**
 * Capture the Blob a producer hands to the download trigger. jsdom implements
 * neither createObjectURL nor anchor navigation, so we stub both and keep the
 * Blob — the artifact under test.
 */
let captured: Blob[] = [];

beforeEach(() => {
	captured = [];
	URL.createObjectURL = vi.fn((blob: Blob) => {
		captured.push(blob);
		return 'blob:mock';
	});
	URL.revokeObjectURL = vi.fn();
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** jsdom's Blob implements no `arrayBuffer()`; FileReader is the supported path. */
function blobBytes(blob: Blob): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(reader.error);
		reader.readAsArrayBuffer(blob);
	});
}

function onlyBlobBytes(): Promise<ArrayBuffer> {
	expect(captured).toHaveLength(1);
	return blobBytes(captured[0]!);
}

describe('export column contract', () => {
	it('carries the version pin and timing provenance, in a stable order', () => {
		expect(COLUMNS.map((c) => c.key)).toEqual([
			'session_id',
			'participant_id',
			'session_status',
			'questionnaire_version',
			'started_at',
			'completed_at',
			'question_id',
			'value',
			'reaction_time_us',
			'presented_at',
			'answered_at',
			'timing_provenance',
		]);
	});

	it('renders the pin as semver and the provenance as JSON on the record', () => {
		const rec = rowToRecord(baseRow());
		expect(rec.questionnaire_version).toBe('1.4.2');
		expect(rec.timing_provenance).toBe(JSON.stringify(PROVENANCE));
	});

	it('leaves the version cell empty rather than inventing one for an unpinned row', () => {
		const rec = rowToRecord(
			baseRow({
				questionnaire_version_major: undefined,
				questionnaire_version_minor: undefined,
				questionnaire_version_patch: undefined,
			})
		);
		expect(rec.questionnaire_version).toBeNull();
	});
});

describe('rowsToCsv', () => {
	it('emits the version pin and provenance in the data line', () => {
		const csv = rowsToCsv([baseRow()]);
		const [header, data] = csv.split('\n');
		expect(header).toBe(COLUMNS.map((c) => c.key).join(','));
		expect(header).toContain('questionnaire_version');
		expect(header).toContain('timing_provenance');
		// The pin is a real value in the row, not just a header.
		expect(data).toContain('1.4.2');
		expect(data).toContain('onsetMethod');
	});

	it('never emits a live formula for a participant-supplied id or answer', () => {
		const csv = rowsToCsv([baseRow({ participant_id: INJECTION, value: '=1+1' })]);
		const data = csv.split('\n')[1]!;
		const cells = data.split(',');

		// The defining assertion: no cell in the emitted row STARTS a formula.
		for (const cell of cells) {
			expect(cell.startsWith('='), `live formula in cell: ${cell}`).toBe(false);
			expect(cell.startsWith('@'), `live formula in cell: ${cell}`).toBe(false);
		}
		// And the payload survives as inert text (quoted because it contains a comma
		// is not the case here; it is prefixed).
		expect(csv).toContain(`'${INJECTION}`);
		expect(csv).toContain("'=1+1");
	});

	it('quotes a lone carriage return so the row does not split', () => {
		const csv = rowsToCsv([baseRow({ value: 'yes\rno' })]);
		// 1 header + exactly 1 data line — the CR must not have created a record break.
		const lines = csv.split('\n');
		expect(lines).toHaveLength(2);
		expect(lines[1]).toContain('"yes\rno"');
	});

	it('preserves a negative reaction-time value unmangled', () => {
		const csv = rowsToCsv([baseRow({ value: -14.2 })]);
		expect(csv.split('\n')[1]).toContain('-14.2');
		expect(csv).not.toContain("'-14.2");
	});
});

describe('exportWithScript', () => {
	it.each(SCRIPT_FORMATS)(
		'the %s bundle carries the version pin and provenance through to the script',
		async (format) => {
			await exportWithScript([baseRow()], 'Study', format);
			const zip = await JSZip.loadAsync(await onlyBlobBytes());

			const csv = await zip.file('data.csv')!.async('string');
			expect(csv).toContain('questionnaire_version');
			expect(csv).toContain('timing_provenance');
			expect(csv).toContain('1.4.2');

			// The script must actually reference the new columns — a CSV column the
			// analysis script never declares is a column the researcher never sees.
			const scriptName = Object.keys(zip.files).find((f) => f.startsWith('analysis'))!;
			const script = await zip.file(scriptName)!.async('string');
			expect(script, `${format} script drops questionnaire_version`).toContain(
				'questionnaire_version'
			);
			expect(script, `${format} script drops timing_provenance`).toContain('timing_provenance');

			const readme = await zip.file('README.txt')!.async('string');
			expect(readme).toContain('questionnaire_version');
			expect(readme).toContain('timing_provenance');
		}
	);

	it('the bundled CSV is injection-safe', async () => {
		await exportWithScript([baseRow({ participant_id: INJECTION })], 'Study', 'r');
		const zip = await JSZip.loadAsync(await onlyBlobBytes());
		const csv = await zip.file('data.csv')!.async('string');
		const data = csv.split('\n')[1]!;
		expect(data.split(',').some((c) => c.startsWith('='))).toBe(false);
		expect(csv).toContain(`'${INJECTION}`);
	});
});

describe('exportToExcel', () => {
	async function loadSheets(): Promise<ExcelJS.Workbook> {
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(await onlyBlobBytes());
		return wb;
	}

	it('writes the version pin and provenance onto the Responses sheet', async () => {
		await exportToExcel([baseRow()], 'Study');
		const sheet = (await loadSheets()).getWorksheet('Responses')!;

		const headers = sheet.getRow(1).values as unknown[];
		expect(headers).toContain('Questionnaire Version');
		expect(headers).toContain('Timing Provenance (JSON)');

		const versionCol = COLUMNS.findIndex((c) => c.key === 'questionnaire_version') + 1;
		const provenanceCol = COLUMNS.findIndex((c) => c.key === 'timing_provenance') + 1;
		expect(sheet.getRow(2).getCell(versionCol).value).toBe('1.4.2');
		expect(String(sheet.getRow(2).getCell(provenanceCol).value)).toContain('onsetMethod');
	});

	it('does not leave a participant-supplied formula live in a cell', async () => {
		await exportToExcel([baseRow({ participant_id: INJECTION, value: '=1+1' })], 'Study');
		const wb = await loadSheets();

		for (const name of ['Responses', 'Sessions']) {
			const sheet = wb.getWorksheet(name)!;
			sheet.eachRow((row) => {
				row.eachCell((cell) => {
					// Neither a formula element nor a string that a CSV re-export would
					// turn back into one.
					expect(cell.formula, `formula cell in ${name}`).toBeUndefined();
					if (typeof cell.value === 'string') {
						expect(cell.value.startsWith('='), `live formula text in ${name}`).toBe(false);
					}
				});
			});
		}
		const responses = wb.getWorksheet('Responses')!;
		const participantCol = COLUMNS.findIndex((c) => c.key === 'participant_id') + 1;
		expect(responses.getRow(2).getCell(participantCol).value).toBe(`'${INJECTION}`);
	});

	it('keeps reaction times numeric so Excel still treats the column as numbers', async () => {
		await exportToExcel([baseRow()], 'Study');
		const sheet = (await loadSheets()).getWorksheet('Responses')!;
		const rtCol = COLUMNS.findIndex((c) => c.key === 'reaction_time_us') + 1;
		expect(sheet.getRow(2).getCell(rtCol).value).toBe(420_000);
	});

	it('discloses the versions the dataset spans on the Summary sheet', async () => {
		await exportToExcel(
			[
				baseRow({ session_id: 's1' }),
				baseRow({
					session_id: 's2',
					questionnaire_version_major: 2,
					questionnaire_version_minor: 0,
					questionnaire_version_patch: 0,
				}),
			],
			'Study'
		);
		const summary = (await loadSheets()).getWorksheet('Summary')!;
		const metrics = new Map<string, unknown>();
		summary.eachRow((row) => {
			metrics.set(String(row.getCell(1).value), row.getCell(2).value);
		});
		// A dataset pooled across a MAJOR bump must say so.
		expect(metrics.get('Questionnaire Version(s)')).toBe('1.4.2, 2.0.0');
	});
});
