/**
 * Shared cell primitives for every client-side export producer.
 *
 * There are three CSV writers and two XLSX writers on the client (the response
 * export, the reaction-trial export, and the project analytics page's plain CSV
 * button). They previously each forked their own escaping logic, and all of them
 * shared the same two bugs: no formula-injection guard, and a quoting predicate
 * that missed a lone `\r`. This module is the ONE place that decides how an
 * arbitrary value becomes a cell, so a fix lands everywhere at once.
 */

/**
 * Leading characters that make a spreadsheet treat a CSV cell as a formula or a
 * command rather than as text. `\t` and `\r` are included because Excel strips
 * them on paste/import and then re-reads whatever follows — so a value of
 * `"\t=cmd|..."` still lands as a formula.
 */
const FORMULA_LEAD = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * A plain decimal or scientific numeric literal. `-5`, `+3`, `-1.5e-3` are
 * legitimate negative/signed numbers and must NOT be prefixed — mangling them
 * would silently corrupt every negative reaction-time delta in the dataset.
 */
const NUMERIC_LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Render a string inert for a spreadsheet by prefixing the standard single
 * quote, which forces text interpretation. Numeric literals and anything not
 * starting with a trigger character are returned untouched.
 */
export function neutralizeFormula(value: string): string {
	if (value.length === 0) return value;
	if (!FORMULA_LEAD.has(value.charAt(0))) return value;
	if (NUMERIC_LITERAL.test(value)) return value;
	return `'${value}`;
}

/** Flatten an arbitrary export value to its string rendering (no escaping). */
export function toCellString(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/**
 * Serialize one value as a CSV cell: neutralize a formula lead-in, then quote if
 * the result carries a delimiter, a quote, or ANY line terminator — including a
 * lone `\r`, which the previous escapers missed and which breaks the row for any
 * reader that treats a bare CR as a record separator.
 */
export function csvCell(value: unknown): string {
	const raw = toCellString(value);
	if (raw === '') return '';
	const safe = neutralizeFormula(raw);
	if (/[",\n\r]/.test(safe)) {
		return `"${safe.replace(/"/g, '""')}"`;
	}
	return safe;
}

/**
 * Coerce one value for an ExcelJS cell. Numbers, booleans and dates stay typed
 * so Excel keeps treating them as numbers/dates; strings get the formula guard.
 *
 * Note ExcelJS writes a leading-`=` string as a *string* cell, not a formula
 * element, so an .xlsx sheet is not the live-execution vector a CSV is. The
 * guard is applied anyway: researchers routinely re-export a sheet to CSV, and
 * that is the point at which an unguarded value becomes live.
 */
export function xlsxCell(value: unknown): unknown {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
		return value;
	}
	if (typeof value === 'object') return neutralizeFormula(JSON.stringify(value));
	return neutralizeFormula(String(value));
}

/**
 * Apply {@link xlsxCell} across a whole row record destined for `sheet.addRow`.
 * Generic over the row shape so interface-typed rows (which TypeScript will not
 * implicitly widen to an index signature) pass through unchanged.
 */
export function xlsxRow<T extends object>(record: T): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		out[key] = xlsxCell(value);
	}
	return out;
}

/** The semver pin fields a session records for the version it was filled against. */
export interface VersionPinned {
	questionnaire_version_major?: number | null;
	questionnaire_version_minor?: number | null;
	questionnaire_version_patch?: number | null;
}

/**
 * Render the questionnaire version a session was filled out against as a semver
 * string (`"1.4.2"`). Returns null when the pin is absent, so the export shows an
 * empty cell rather than inventing a version — an unpinned row is a real,
 * reportable state, not a `0.0.0`.
 */
export function formatQuestionnaireVersion(row: VersionPinned): string | null {
	const major = row.questionnaire_version_major;
	const minor = row.questionnaire_version_minor;
	const patch = row.questionnaire_version_patch;
	if (typeof major !== 'number' || typeof minor !== 'number' || typeof patch !== 'number') {
		return null;
	}
	return `${major}.${minor}.${patch}`;
}

/**
 * Serialize the per-response `timing_provenance` blob for a flat cell. Already-
 * serialized strings pass through; anything unserializable degrades to null
 * rather than throwing mid-export.
 */
export function formatTimingProvenance(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value);
	} catch {
		return null;
	}
}
