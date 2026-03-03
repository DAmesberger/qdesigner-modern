/**
 * Response Export Service
 * Exports questionnaire response data (ExportRow[]) to various formats.
 * - Excel (.xlsx): multi-sheet workbook
 * - SPSS, R, Stata, SAS, Python: CSV + companion analysis script bundled as .zip
 */

import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ExportRow } from '$lib/types/api';

export type ScriptFormat = 'spss' | 'r' | 'stata' | 'sas' | 'python';
export type ResponseExportFormat = 'xlsx' | ScriptFormat;

// Column metadata used across all script generators
const COLUMNS = [
	{ key: 'session_id', label: 'Session ID', type: 'string' as const },
	{ key: 'participant_id', label: 'Participant ID', type: 'string' as const },
	{ key: 'session_status', label: 'Session Status', type: 'string' as const },
	{ key: 'started_at', label: 'Started At', type: 'datetime' as const },
	{ key: 'completed_at', label: 'Completed At', type: 'datetime' as const },
	{ key: 'question_id', label: 'Question ID', type: 'string' as const },
	{ key: 'value', label: 'Response Value', type: 'string' as const },
	{ key: 'reaction_time_us', label: 'Reaction Time (microseconds)', type: 'numeric' as const },
	{ key: 'presented_at', label: 'Presented At', type: 'datetime' as const },
	{ key: 'answered_at', label: 'Answered At', type: 'datetime' as const },
] as const;

function rowToRecord(row: ExportRow): Record<string, string | number | null> {
	return {
		session_id: row.session_id,
		participant_id: row.participant_id,
		session_status: row.session_status,
		started_at: row.started_at,
		completed_at: row.completed_at,
		question_id: row.question_id,
		value: row.value === null || row.value === undefined ? null : typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value),
		reaction_time_us: row.reaction_time_us,
		presented_at: row.presented_at,
		answered_at: row.answered_at,
	};
}

function rowsToCsv(rows: ExportRow[]): string {
	const headers = COLUMNS.map((c) => c.key);
	const lines = [headers.join(',')];
	for (const row of rows) {
		const rec = rowToRecord(row);
		const vals = headers.map((h) => {
			const v = rec[h];
			if (v === null || v === undefined) return '';
			const s = String(v);
			if (s.includes(',') || s.includes('"') || s.includes('\n')) {
				return `"${s.replace(/"/g, '""')}"`;
			}
			return s;
		});
		lines.push(vals.join(','));
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

// ─── Excel Export ────────────────────────────────────────────────────────────

export async function exportToExcel(rows: ExportRow[], questionnaireName: string): Promise<void> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'QDesigner Modern';
	workbook.created = new Date();

	// Sheet 1: Responses
	const responsesSheet = workbook.addWorksheet('Responses');
	responsesSheet.columns = COLUMNS.map((c) => ({
		header: c.label,
		key: c.key,
		width: c.type === 'datetime' ? 28 : c.type === 'numeric' ? 22 : 24,
	}));

	for (const row of rows) {
		responsesSheet.addRow(rowToRecord(row));
	}

	// Style the header row
	const headerRow = responsesSheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FFE8EDF5' },
	};
	headerRow.alignment = { vertical: 'middle' };

	// Sheet 2: Sessions (deduplicated)
	const sessionsSheet = workbook.addWorksheet('Sessions');
	const sessionMap = new Map<string, ExportRow>();
	for (const row of rows) {
		if (!sessionMap.has(row.session_id)) {
			sessionMap.set(row.session_id, row);
		}
	}
	sessionsSheet.columns = [
		{ header: 'Session ID', key: 'session_id', width: 38 },
		{ header: 'Participant ID', key: 'participant_id', width: 20 },
		{ header: 'Status', key: 'session_status', width: 14 },
		{ header: 'Started At', key: 'started_at', width: 28 },
		{ header: 'Completed At', key: 'completed_at', width: 28 },
		{ header: 'Response Count', key: 'response_count', width: 16 },
	];
	for (const [sid, row] of sessionMap) {
		const count = rows.filter((r) => r.session_id === sid).length;
		sessionsSheet.addRow({
			session_id: row.session_id,
			participant_id: row.participant_id,
			session_status: row.session_status,
			started_at: row.started_at,
			completed_at: row.completed_at,
			response_count: count,
		});
	}
	const sessHeaderRow = sessionsSheet.getRow(1);
	sessHeaderRow.font = { bold: true };
	sessHeaderRow.fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FFE8EDF5' },
	};

	// Sheet 3: Summary Statistics
	const summarySheet = workbook.addWorksheet('Summary');
	summarySheet.columns = [
		{ header: 'Metric', key: 'metric', width: 30 },
		{ header: 'Value', key: 'value', width: 30 },
	];
	const totalSessions = sessionMap.size;
	const completedSessions = [...sessionMap.values()].filter((s) => s.session_status === 'completed').length;
	const reactionTimes = rows.map((r) => r.reaction_time_us).filter((v): v is number => v !== null);
	const meanRT = reactionTimes.length > 0 ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length : null;
	const sortedRT = [...reactionTimes].sort((a, b) => a - b);
	const medianRT = sortedRT.length > 0 ? sortedRT[Math.floor(sortedRT.length / 2)] : null;

	const summaryRows = [
		{ metric: 'Questionnaire', value: questionnaireName },
		{ metric: 'Export Date', value: new Date().toISOString() },
		{ metric: 'Total Responses', value: rows.length },
		{ metric: 'Total Sessions', value: totalSessions },
		{ metric: 'Completed Sessions', value: completedSessions },
		{ metric: 'Completion Rate', value: totalSessions > 0 ? `${((completedSessions / totalSessions) * 100).toFixed(1)}%` : 'N/A' },
		{ metric: 'Responses with Reaction Time', value: reactionTimes.length },
		{ metric: 'Mean Reaction Time (us)', value: meanRT !== null ? Math.round(meanRT) : 'N/A' },
		{ metric: 'Median Reaction Time (us)', value: medianRT !== null ? medianRT : 'N/A' },
		{ metric: 'Min Reaction Time (us)', value: sortedRT.length > 0 ? sortedRT[0] : 'N/A' },
		{ metric: 'Max Reaction Time (us)', value: sortedRT.length > 0 ? sortedRT[sortedRT.length - 1] : 'N/A' },
	];
	for (const r of summaryRows) {
		summarySheet.addRow(r);
	}
	const sumHeaderRow = summarySheet.getRow(1);
	sumHeaderRow.font = { bold: true };
	sumHeaderRow.fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FFE8EDF5' },
	};

	const buffer = await workbook.xlsx.writeBuffer();
	const blob = new Blob([buffer], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	});
	const filename = `${sanitizeFilename(questionnaireName)}_${dateStamp()}.xlsx`;
	triggerDownload(blob, filename);
}

// ─── Script-based exports (CSV + script in a .zip) ──────────────────────────

export async function exportWithScript(
	rows: ExportRow[],
	questionnaireName: string,
	format: ScriptFormat,
): Promise<void> {
	const csv = rowsToCsv(rows);
	const script = generateScript(rows, format);
	const ext = SCRIPT_EXTENSIONS[format];

	const zip = new JSZip();
	zip.file('data.csv', csv);
	zip.file(`analysis${ext}`, script);
	zip.file('README.txt', generateReadme(format));

	const blob = await zip.generateAsync({ type: 'blob' });
	const filename = `${sanitizeFilename(questionnaireName)}_${format}_${dateStamp()}.zip`;
	triggerDownload(blob, filename);
}

const SCRIPT_EXTENSIONS: Record<ScriptFormat, string> = {
	spss: '.sps',
	r: '.R',
	stata: '.do',
	sas: '.sas',
	python: '.py',
};

function generateScript(rows: ExportRow[], format: ScriptFormat): string {
	const timestamp = new Date().toISOString();
	switch (format) {
		case 'spss':
			return generateSPSS(timestamp);
		case 'r':
			return generateR(timestamp);
		case 'stata':
			return generateStata(timestamp);
		case 'sas':
			return generateSAS(timestamp);
		case 'python':
			return generatePython(timestamp);
	}
}

function generateReadme(format: ScriptFormat): string {
	const names: Record<ScriptFormat, string> = {
		spss: 'SPSS',
		r: 'R',
		stata: 'Stata',
		sas: 'SAS',
		python: 'Python (pandas)',
	};
	const exts = SCRIPT_EXTENSIONS;
	return `QDesigner Modern - Data Export
================================

This archive contains:

  data.csv          - Response data in CSV format
  analysis${exts[format]}  - ${names[format]} analysis script

Instructions:
1. Extract both files to the same directory.
2. Open the analysis script in ${names[format]}.
3. The script will read data.csv and set up a properly typed dataset.

Column descriptions:
  session_id        - Unique identifier for the participant session (UUID)
  participant_id    - Optional participant identifier
  session_status    - Session status: active, completed, or abandoned
  started_at        - ISO 8601 timestamp when the session started
  completed_at      - ISO 8601 timestamp when the session completed
  question_id       - Identifier of the question being answered
  value             - The participant's response value
  reaction_time_us  - Reaction time in microseconds (high-precision timing)
  presented_at      - ISO 8601 timestamp when the question was presented
  answered_at       - ISO 8601 timestamp when the question was answered

Generated by QDesigner Modern on ${new Date().toISOString()}
`;
}

// ─── SPSS ────────────────────────────────────────────────────────────────────

function generateSPSS(timestamp: string): string {
	return `* ============================================================================.
* QDesigner Modern - SPSS Analysis Script
* Generated: ${timestamp}
* ============================================================================.

* Import the CSV data.
GET DATA
  /TYPE=TXT
  /FILE='data.csv'
  /DELIMITERS=','
  /QUALIFIER='"'
  /FIRSTCASE=2
  /VARIABLES=
    session_id A36
    participant_id A255
    session_status A20
    started_at A30
    completed_at A30
    question_id A255
    value A1000
    reaction_time_us F12.0
    presented_at A30
    answered_at A30.
EXECUTE.

* Variable labels.
VARIABLE LABELS
  session_id 'Session ID'
  participant_id 'Participant ID'
  session_status 'Session Status'
  started_at 'Started At (ISO 8601)'
  completed_at 'Completed At (ISO 8601)'
  question_id 'Question ID'
  value 'Response Value'
  reaction_time_us 'Reaction Time (microseconds)'
  presented_at 'Presented At (ISO 8601)'
  answered_at 'Answered At (ISO 8601)'.

* Value labels for session_status.
VALUE LABELS session_status
  'active' 'Active'
  'completed' 'Completed'
  'abandoned' 'Abandoned'.

* Set measurement levels.
VARIABLE LEVEL session_id participant_id question_id value (NOMINAL).
VARIABLE LEVEL session_status (NOMINAL).
VARIABLE LEVEL reaction_time_us (SCALE).

* Descriptive statistics for reaction times.
DESCRIPTIVES VARIABLES=reaction_time_us
  /STATISTICS=MEAN STDDEV MIN MAX.

* Frequency table of session statuses.
FREQUENCIES VARIABLES=session_status
  /ORDER=ANALYSIS.

* Cross-tabulation: session_status by question_id.
CROSSTABS
  /TABLES=session_status BY question_id
  /CELLS=COUNT ROW COLUMN.

* Save as SPSS dataset.
SAVE OUTFILE='qdesigner_data.sav'.
`;
}

// ─── R ───────────────────────────────────────────────────────────────────────

function generateR(timestamp: string): string {
	return `# ============================================================================
# QDesigner Modern - R Analysis Script
# Generated: ${timestamp}
# ============================================================================

# Read the CSV data
df <- read.csv("data.csv", stringsAsFactors = FALSE, na.strings = c("", "NA"))

# Set proper data types
df$session_status <- factor(df$session_status,
  levels = c("active", "completed", "abandoned"),
  labels = c("Active", "Completed", "Abandoned")
)

# Parse datetime columns
datetime_cols <- c("started_at", "completed_at", "presented_at", "answered_at")
for (col in datetime_cols) {
  df[[col]] <- as.POSIXct(df[[col]], format = "%Y-%m-%dT%H:%M:%S", tz = "UTC")
}

# Convert reaction time to numeric (already numeric from CSV, but ensure)
df$reaction_time_us <- as.numeric(df$reaction_time_us)

# Variable labels (stored as attributes)
attr(df$session_id, "label") <- "Session ID"
attr(df$participant_id, "label") <- "Participant ID"
attr(df$session_status, "label") <- "Session Status"
attr(df$started_at, "label") <- "Started At"
attr(df$completed_at, "label") <- "Completed At"
attr(df$question_id, "label") <- "Question ID"
attr(df$value, "label") <- "Response Value"
attr(df$reaction_time_us, "label") <- "Reaction Time (microseconds)"
attr(df$presented_at, "label") <- "Presented At"
attr(df$answered_at, "label") <- "Answered At"

# ── Summary ──────────────────────────────────────────────────────────────────

cat("\\n=== Dataset Overview ===\\n")
str(df)

cat("\\n=== Summary Statistics ===\\n")
summary(df)

# ── Session-level statistics ─────────────────────────────────────────────────

sessions <- unique(df[, c("session_id", "participant_id", "session_status",
                           "started_at", "completed_at")])
cat("\\n=== Session Counts ===\\n")
print(table(sessions$session_status))

# ── Reaction time analysis ───────────────────────────────────────────────────

rt <- df$reaction_time_us[!is.na(df$reaction_time_us)]
if (length(rt) > 0) {
  cat("\\n=== Reaction Time Statistics (microseconds) ===\\n")
  cat(sprintf("  N:      %d\\n", length(rt)))
  cat(sprintf("  Mean:   %.1f\\n", mean(rt)))
  cat(sprintf("  Median: %.1f\\n", median(rt)))
  cat(sprintf("  SD:     %.1f\\n", sd(rt)))
  cat(sprintf("  Min:    %d\\n", min(rt)))
  cat(sprintf("  Max:    %d\\n", max(rt)))

  # Histogram of reaction times
  if (requireNamespace("ggplot2", quietly = TRUE)) {
    library(ggplot2)
    p <- ggplot(df[!is.na(df$reaction_time_us), ], aes(x = reaction_time_us / 1000)) +
      geom_histogram(bins = 30, fill = "#3B82F6", color = "white") +
      labs(
        title = "Distribution of Reaction Times",
        x = "Reaction Time (ms)",
        y = "Count"
      ) +
      theme_minimal()
    ggsave("reaction_times.png", p, width = 8, height = 5, dpi = 150)
    cat("  Plot saved: reaction_times.png\\n")
  }
}

# Save processed data
save(df, sessions, file = "qdesigner_data.RData")
cat("\\nProcessed data saved to qdesigner_data.RData\\n")
`;
}

// ─── Stata ───────────────────────────────────────────────────────────────────

function generateStata(timestamp: string): string {
	return `* ============================================================================
* QDesigner Modern - Stata Analysis Script
* Generated: ${timestamp}
* ============================================================================

clear all
set more off

* Import CSV data
import delimited "data.csv", varnames(1) clear

* ── Variable labels ──────────────────────────────────────────────────────────

label variable session_id "Session ID"
label variable participant_id "Participant ID"
label variable session_status "Session Status"
label variable started_at "Started At (ISO 8601)"
label variable completed_at "Completed At (ISO 8601)"
label variable question_id "Question ID"
label variable value "Response Value"
label variable reaction_time_us "Reaction Time (microseconds)"
label variable presented_at "Presented At (ISO 8601)"
label variable answered_at "Answered At (ISO 8601)"

* ── Value labels for session_status ──────────────────────────────────────────

encode session_status, generate(status_coded)
label define status_lbl 1 "Active" 2 "Completed" 3 "Abandoned"

* ── Convert reaction time to numeric if needed ───────────────────────────────

capture destring reaction_time_us, replace force

* ── Data overview ────────────────────────────────────────────────────────────

describe
summarize

* ── Session-level analysis ───────────────────────────────────────────────────

preserve
duplicates drop session_id, force
tab session_status
display "Total sessions: " _N
restore

* ── Reaction time analysis ───────────────────────────────────────────────────

summarize reaction_time_us, detail

histogram reaction_time_us if reaction_time_us != ., ///
    title("Distribution of Reaction Times") ///
    xtitle("Reaction Time (microseconds)") ///
    ytitle("Frequency") ///
    color(blue%60)
graph export "reaction_times.png", replace

* ── Save as Stata dataset ────────────────────────────────────────────────────

save "qdesigner_data.dta", replace
display "Data saved to qdesigner_data.dta"
`;
}

// ─── SAS ─────────────────────────────────────────────────────────────────────

function generateSAS(timestamp: string): string {
	return `/******************************************************************************
 * QDesigner Modern - SAS Analysis Script
 * Generated: ${timestamp}
 ******************************************************************************/

/* Import CSV data */
proc import datafile="data.csv"
    out=work.qdesigner_data
    dbms=csv
    replace;
    getnames=yes;
    guessingrows=max;
run;

/* Display dataset contents */
proc contents data=work.qdesigner_data;
    title "Dataset Structure";
run;

/* Variable labels */
data work.qdesigner_data;
    set work.qdesigner_data;
    label
        session_id = "Session ID"
        participant_id = "Participant ID"
        session_status = "Session Status"
        started_at = "Started At (ISO 8601)"
        completed_at = "Completed At (ISO 8601)"
        question_id = "Question ID"
        value = "Response Value"
        reaction_time_us = "Reaction Time (microseconds)"
        presented_at = "Presented At (ISO 8601)"
        answered_at = "Answered At (ISO 8601)";
run;

/* Basic descriptive statistics */
proc means data=work.qdesigner_data n mean median std min max;
    var reaction_time_us;
    title "Reaction Time Statistics";
run;

/* Frequency table for session status */
proc freq data=work.qdesigner_data;
    tables session_status / nocum;
    title "Session Status Distribution";
run;

/* Session-level summary */
proc sql;
    title "Session Summary";
    select session_status,
           count(distinct session_id) as n_sessions
    from work.qdesigner_data
    group by session_status;
quit;

/* Cross-tabulation */
proc freq data=work.qdesigner_data;
    tables session_status * question_id / norow nocol;
    title "Responses by Status and Question";
run;

/* Histogram of reaction times */
proc sgplot data=work.qdesigner_data;
    where reaction_time_us is not missing;
    histogram reaction_time_us / fillattrs=(color=CX3B82F6);
    xaxis label="Reaction Time (microseconds)";
    yaxis label="Frequency";
    title "Distribution of Reaction Times";
run;

/* Save as permanent SAS dataset */
libname out ".";
data out.qdesigner_data;
    set work.qdesigner_data;
run;

%put NOTE: Data saved to qdesigner_data.sas7bdat;
`;
}

// ─── Python ──────────────────────────────────────────────────────────────────

function generatePython(timestamp: string): string {
	return `#!/usr/bin/env python3
"""
QDesigner Modern - Python Analysis Script
Generated: ${timestamp}

Requirements:
    pip install pandas matplotlib seaborn
"""

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ── Load data ────────────────────────────────────────────────────────────────

df = pd.read_csv("data.csv")

# ── Data types ───────────────────────────────────────────────────────────────

# Parse datetime columns
datetime_cols = ["started_at", "completed_at", "presented_at", "answered_at"]
for col in datetime_cols:
    df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)

# Ensure reaction_time_us is numeric
df["reaction_time_us"] = pd.to_numeric(df["reaction_time_us"], errors="coerce")

# Set categorical type for session_status
df["session_status"] = pd.Categorical(
    df["session_status"],
    categories=["active", "completed", "abandoned"],
    ordered=True,
)

# ── Overview ─────────────────────────────────────────────────────────────────

print("=== Dataset Info ===")
print(df.info())
print()

print("=== First 5 Rows ===")
print(df.head())
print()

print("=== Descriptive Statistics ===")
print(df.describe(include="all"))
print()

# ── Session-level analysis ───────────────────────────────────────────────────

sessions = df.drop_duplicates(subset=["session_id"])[
    ["session_id", "participant_id", "session_status", "started_at", "completed_at"]
].copy()

print("=== Session Counts ===")
print(sessions["session_status"].value_counts())
print(f"Total sessions: {len(sessions)}")
completed = (sessions["session_status"] == "completed").sum()
print(f"Completion rate: {completed / len(sessions) * 100:.1f}%")
print()

# ── Reaction time analysis ───────────────────────────────────────────────────

rt = df["reaction_time_us"].dropna()
if len(rt) > 0:
    print("=== Reaction Time Statistics (microseconds) ===")
    print(f"  N:      {len(rt)}")
    print(f"  Mean:   {rt.mean():.1f}")
    print(f"  Median: {rt.median():.1f}")
    print(f"  SD:     {rt.std():.1f}")
    print(f"  Min:    {rt.min():.0f}")
    print(f"  Max:    {rt.max():.0f}")
    print()

    # Plot
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    axes[0].hist(rt / 1000, bins=30, color="#3B82F6", edgecolor="white")
    axes[0].set_xlabel("Reaction Time (ms)")
    axes[0].set_ylabel("Count")
    axes[0].set_title("Distribution of Reaction Times")

    axes[1].boxplot(rt / 1000, vert=True)
    axes[1].set_ylabel("Reaction Time (ms)")
    axes[1].set_title("Reaction Time Box Plot")

    plt.tight_layout()
    plt.savefig("reaction_times.png", dpi=150, bbox_inches="tight")
    print("Plot saved: reaction_times.png")
    print()

# ── Save processed data ─────────────────────────────────────────────────────

df.to_pickle("qdesigner_data.pkl")
df.to_csv("qdesigner_data_processed.csv", index=False)
print("Processed data saved to:")
print("  - qdesigner_data.pkl")
print("  - qdesigner_data_processed.csv")
`;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
}

function dateStamp(): string {
	return new Date().toISOString().slice(0, 10);
}
