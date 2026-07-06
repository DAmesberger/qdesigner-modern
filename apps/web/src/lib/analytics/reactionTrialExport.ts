/**
 * Long-format ("tidy") reaction-trial export (E-REACT-5).
 *
 * A reaction question persists its full per-trial detail in `responses.value`
 * as `{ responses: ReactionTrialRecord[], ... }`. The default response export is
 * one row per session/question with a rolled-up RT — it discards the per-trial
 * structure. This module flattens each such {@link ExportRow} into ONE
 * {@link ReactionTrialRow} per trial via {@link buildTrialRow}, then serializes
 * the result with a stable column order (from {@link TRIAL_ROW_COLUMNS}) for CSV
 * and XLSX. The output is the defensible per-trial table SOTA reanalysis needs.
 */

import ExcelJS from 'exceljs';
import type { ExportRow } from '$lib/shared/types/api';
import {
  buildTrialRow,
  TRIAL_ROW_COLUMNS,
  type ReactionTrialRecord,
  type ReactionTrialRow,
} from '$lib/modules/questions/reaction-time/model/trialRow';

/**
 * Extract the persisted per-trial records from an export row's `value`, or null
 * when the row is not a reaction question (no `responses` array).
 */
function extractTrialRecords(value: unknown): ReactionTrialRecord[] | null {
  if (!value || typeof value !== 'object') return null;
  const responses = (value as { responses?: unknown }).responses;
  if (!Array.isArray(responses)) return null;
  // A reaction record is an object carrying a numeric trialNumber; guard so a
  // form question that happens to carry a `responses` array is skipped.
  const records = responses.filter(
    (r): r is ReactionTrialRecord =>
      !!r && typeof r === 'object' && typeof (r as { trialNumber?: unknown }).trialNumber === 'number'
  );
  return records.length > 0 ? records : null;
}

/** True when at least one export row carries per-trial reaction data. */
export function hasReactionTrialData(rows: ExportRow[]): boolean {
  return rows.some((row) => extractTrialRecords(row.value) !== null);
}

/**
 * Flatten every reaction export row into long-format tidy rows — exactly one row
 * per trial, in row-then-trial order. Non-reaction rows are skipped. The result
 * has stable columns ({@link TRIAL_ROW_COLUMNS}).
 */
export function buildReactionTrialRows(rows: ExportRow[]): ReactionTrialRow[] {
  const out: ReactionTrialRow[] = [];
  for (const row of rows) {
    const records = extractTrialRecords(row.value);
    if (!records) continue;
    for (const record of records) {
      out.push(
        buildTrialRow(record, {
          sessionId: row.session_id,
          participantId: row.participant_id,
          questionId: row.question_id,
        })
      );
    }
  }
  return out;
}

/** Serialize one cell value for CSV, quoting when it contains a delimiter. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize tidy rows to CSV with the canonical column order. N trials -> N data
 * lines plus one header line.
 */
export function reactionTrialRowsToCsv(rows: ReactionTrialRow[]): string {
  const headers = TRIAL_ROW_COLUMNS.map((c) => c.header);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(TRIAL_ROW_COLUMNS.map((c) => csvCell(row[c.key])).join(','));
  }
  return lines.join('\n');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Export the flattened long-format trial table as a CSV download. Returns the
 * number of trial rows written (0 when the dataset has no reaction trials).
 */
export function exportReactionTrialsCsv(rows: ExportRow[], questionnaireName: string): number {
  const trialRows = buildReactionTrialRows(rows);
  const csv = reactionTrialRowsToCsv(trialRows);
  const blob = new Blob([csv], { type: 'text/csv' });
  triggerDownload(blob, `${sanitizeFilename(questionnaireName)}_trials_${dateStamp()}.csv`);
  return trialRows.length;
}

/**
 * Export the flattened long-format trial table as a single-sheet XLSX download.
 * Returns the number of trial rows written.
 */
export async function exportReactionTrialsXlsx(
  rows: ExportRow[],
  questionnaireName: string
): Promise<number> {
  const trialRows = buildReactionTrialRows(rows);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QDesigner Modern';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Trials');
  sheet.columns = TRIAL_ROW_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 18 }));
  for (const row of trialRows) {
    sheet.addRow(row);
  }
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `${sanitizeFilename(questionnaireName)}_trials_${dateStamp()}.xlsx`);
  return trialRows.length;
}
