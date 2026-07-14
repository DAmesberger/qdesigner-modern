//! Shared CSV field rendering for every server-side export producer.
//!
//! Two CSV writers previously lived in this binary — one in `questionnaires.rs`
//! (the researcher export) and one in `api_keys.rs` (the machine export) — each
//! with its own `csv_escape`, and they had diverged: only one of them quoted a
//! lone `\r`, and neither guarded against spreadsheet formula injection. Two
//! divergent escapers in one binary is how that class of bug persists, so this
//! module is the single place a value becomes a CSV field.
//!
//! The semantics deliberately mirror the client-side `neutralizeFormula` /
//! `csvCell` pair in `apps/web/src/lib/analytics/exportCell.ts`, so a CSV
//! downloaded straight from the API and one produced in the browser are escaped
//! identically.

/// Leading characters that make a spreadsheet treat a CSV cell as a formula or
/// a command rather than as text. `\t` and `\r` are included because Excel
/// strips them before parsing and then re-reads whatever follows, so a value of
/// `"\t=cmd|..."` still lands as a live formula.
const FORMULA_LEAD: [char; 6] = ['=', '+', '-', '@', '\t', '\r'];

/// True for a plain signed decimal / scientific numeric literal.
///
/// This is the exemption that keeps the guard from corrupting real data: a
/// reaction-time delta or a z-score is routinely negative, and blindly prefixing
/// everything that starts with `-` would mangle every one of them. Rust's `f64`
/// parser accepts exactly the forms worth exempting (`-5`, `+3`, `-1.5e-3`,
/// `-.5`) and rejects anything with a formula payload after the sign (e.g.
/// `-2+3+cmd|calc`). A numeric literal is safe to leave unprefixed by
/// definition: evaluating it as a formula yields the number itself.
fn is_numeric_literal(field: &str) -> bool {
    field.parse::<f64>().is_ok()
}

/// Render a value inert for a spreadsheet by prefixing a single quote, which
/// forces text interpretation. Numeric literals and values not starting with a
/// trigger character are returned unchanged.
pub fn neutralize_formula(field: &str) -> String {
    match field.chars().next() {
        Some(first) if FORMULA_LEAD.contains(&first) && !is_numeric_literal(field) => {
            format!("'{field}")
        }
        _ => field.to_string(),
    }
}

/// Render one value as a CSV field: neutralize a formula lead-in, then quote if
/// the result contains a comma, a quote, or ANY line terminator — including a
/// lone `\r`, which a bare-CR-aware reader treats as a record separator and
/// which the `questionnaires.rs` escaper previously let through unquoted.
pub fn csv_field(field: &str) -> String {
    let safe = neutralize_formula(field);
    if safe.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", safe.replace('"', "\"\""))
    } else {
        safe
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The canonical payloads a spreadsheet executes when the file is opened.
    const INJECTION_PAYLOADS: [&str; 6] = [
        "=cmd|'/c calc'!A1",
        "=1+1",
        "@SUM(1+1)",
        "+cmd|calc",
        "-2+3+cmd|calc",
        "=HYPERLINK(\"http://evil.test\",\"click\")",
    ];

    #[test]
    fn neutralizes_every_formula_payload() {
        for payload in INJECTION_PAYLOADS {
            let out = neutralize_formula(payload);
            assert_eq!(out, format!("'{payload}"), "payload not neutralized: {payload}");
            // The defining property: the field no longer STARTS a formula.
            assert!(
                !out.starts_with(['=', '+', '-', '@']),
                "live formula survived: {out}"
            );
        }
    }

    #[test]
    fn neutralizes_leading_tab_and_carriage_return() {
        assert_eq!(neutralize_formula("\t=1+1"), "'\t=1+1");
        assert_eq!(neutralize_formula("\r=1+1"), "'\r=1+1");
    }

    #[test]
    fn does_not_mangle_legitimate_negative_numbers() {
        // Negative RT deltas and z-scores are real data; prefixing them would
        // silently corrupt the dataset.
        for numeric in ["-5", "-14.2", "+3", "-0.004", "-1.5e-3", "+2.5E4", "-.5"] {
            assert_eq!(neutralize_formula(numeric), numeric, "mangled {numeric}");
        }
    }

    #[test]
    fn leaves_ordinary_text_alone() {
        assert_eq!(neutralize_formula("congruent"), "congruent");
        assert_eq!(neutralize_formula(""), "");
        assert_eq!(neutralize_formula("a=b"), "a=b");
    }

    #[test]
    fn quotes_a_lone_carriage_return() {
        // The bug in the questionnaires.rs escaper: it tested ',' '"' '\n' only,
        // so a bare CR passed through unquoted and split the record.
        assert_eq!(csv_field("line-one\rline-two"), "\"line-one\rline-two\"");
    }

    #[test]
    fn quotes_delimiters_newlines_and_doubles_quotes() {
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("a\nb"), "\"a\nb\"");
        assert_eq!(csv_field("a\r\nb"), "\"a\r\nb\"");
        assert_eq!(csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
    }

    #[test]
    fn neutralizes_and_quotes_a_payload_that_also_needs_escaping() {
        // Order matters: the apostrophe must land inside the quotes.
        assert_eq!(csv_field("=cmd|calc,1"), "\"'=cmd|calc,1\"");
    }

    #[test]
    fn passes_plain_values_through_unquoted() {
        assert_eq!(csv_field("completed"), "completed");
        assert_eq!(csv_field("-14.2"), "-14.2");
        assert_eq!(csv_field(""), "");
    }

    /// The `api_keys.rs` machine export previously had its OWN escaper, and unlike
    /// the `questionnaires.rs` one it was already correct: it escaped every field
    /// and it handled a lone `\r`. Collapsing two implementations onto one risks
    /// the better one silently losing a property the worse one never had, so this
    /// pins the guarantee: on every input that is not a formula lead-in, `csv_field`
    /// is byte-for-byte the legacy escaper. The ONLY intended difference is the
    /// added neutralization — a strict superset, never a regression.
    #[test]
    fn unification_preserves_the_legacy_machine_export_escaper() {
        /// Verbatim copy of the escaper that used to live in `api_keys.rs`.
        fn legacy_csv_escape(field: &str) -> String {
            if field.contains([',', '"', '\n', '\r']) {
                format!("\"{}\"", field.replace('"', "\"\""))
            } else {
                field.to_string()
            }
        }

        let corpus = [
            "",
            "completed",
            "p-1",
            "a,b",
            "a\"b",
            "say \"hi\"",
            "line\nbreak",
            "bare\rcr",
            "crlf\r\nrow",
            "{\"onsetMethod\":\"raf\"}",
            "420000",
            "-14.2",
            "+3",
            "2026-07-14T10:00:00+00:00",
            "00000000-0000-0000-0000-000000000000",
            "unicode — ✓",
        ];

        for field in corpus {
            assert_eq!(
                csv_field(field),
                legacy_csv_escape(field),
                "unification changed behaviour for a non-formula field: {field:?}"
            );
        }

        // And on a formula lead-in, the ONLY difference is the added guard: strip
        // the apostrophe and the legacy escaping is recovered exactly.
        for payload in INJECTION_PAYLOADS {
            let guarded = csv_field(payload);
            let unguarded = guarded.replacen('\'', "", 1);
            assert_eq!(
                unguarded,
                legacy_csv_escape(payload),
                "guard altered more than the leading apostrophe for {payload:?}"
            );
        }
    }
}
