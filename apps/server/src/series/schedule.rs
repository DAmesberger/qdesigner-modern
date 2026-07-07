//! Pure schedule computation for longitudinal / EMA study series
//! (E-FLOW-2, step 4).
//!
//! Three schedule kinds:
//!   * **fixed** — each wave fires at `enrolled_at + offsetSeconds`. The
//!     offsets are absolute (from enrollment), so wave times are
//!     independent of one another. All waves are materialized up front at
//!     enrollment.
//!   * **random-interval** — each wave fires at `prev_wave + U(min, max)`
//!     where the gap is drawn from a seeded RNG. Seeded from
//!     `study_series.random_seed` mixed with the per-enrollment seed, so a
//!     participant's jitter is reproducible / auditable. All waves are
//!     materialized up front (the seed makes them deterministic).
//!   * **event** — only wave 0 is materialized at enrollment; each
//!     subsequent wave's `scheduled_at` is computed from the PRIOR wave's
//!     completion time (`next_event_wave_time`) when the completion
//!     callback fires.
//!
//! This module is deliberately free of any DB / IO so the wave-time math
//! is unit-testable in isolation (see `tests` below and the DB-level
//! `tests/series_scheduling.rs`).

use chrono::{DateTime, Duration, Utc};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use serde_json::Value;

/// How a series schedules its waves.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScheduleKind {
    /// Absolute offsets from enrollment.
    Fixed,
    /// Seeded random gaps between consecutive waves.
    RandomInterval,
    /// Next wave enqueued when the prior wave completes.
    Event,
}

impl ScheduleKind {
    /// Parse the DB `schedule_kind` text. Unknown kinds fall back to
    /// `Fixed` (the safest default: deterministic, no reminders lost).
    pub fn parse(s: &str) -> Self {
        match s {
            "random-interval" => ScheduleKind::RandomInterval,
            "event" => ScheduleKind::Event,
            _ => ScheduleKind::Fixed,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            ScheduleKind::Fixed => "fixed",
            ScheduleKind::RandomInterval => "random-interval",
            ScheduleKind::Event => "event",
        }
    }
}

/// One wave's timing definition, parsed from a `study_series.wave_defs`
/// array element. All fields optional so a bare `{}` is a valid wave (it
/// falls back to a one-day cadence).
#[derive(Debug, Clone, Default)]
pub struct WaveDef {
    pub label: Option<String>,
    /// Fixed: absolute offset from enrollment, in seconds.
    pub offset_seconds: Option<i64>,
    /// Random: minimum gap from the prior wave, in seconds.
    pub min_interval_seconds: Option<i64>,
    /// Random: maximum gap from the prior wave, in seconds.
    pub max_interval_seconds: Option<i64>,
}

/// One day, the default cadence when a wave omits explicit timing.
const DEFAULT_CADENCE_SECONDS: i64 = 86_400;

impl WaveDef {
    /// Parse a single wave-def JSON object. Non-objects yield an empty def
    /// (default cadence), so a malformed row never panics the scheduler.
    pub fn from_json(v: &Value) -> Self {
        let as_i64 = |key: &str| v.get(key).and_then(Value::as_i64);
        WaveDef {
            label: v.get("label").and_then(Value::as_str).map(str::to_string),
            offset_seconds: as_i64("offsetSeconds").or_else(|| as_i64("offset_seconds")),
            min_interval_seconds: as_i64("minIntervalSeconds")
                .or_else(|| as_i64("min_interval_seconds")),
            max_interval_seconds: as_i64("maxIntervalSeconds")
                .or_else(|| as_i64("max_interval_seconds")),
        }
    }

    /// Parse the whole `wave_defs` JSONB array. A non-array (or null) is
    /// treated as "no waves".
    pub fn parse_all(defs: &Value) -> Vec<WaveDef> {
        defs.as_array()
            .map(|arr| arr.iter().map(WaveDef::from_json).collect())
            .unwrap_or_default()
    }
}

/// A materialized wave: its 0-based index and the instant it should fire.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScheduledWave {
    pub wave_index: i32,
    pub scheduled_at: DateTime<Utc>,
}

/// Combine the series-level and enrollment-level seeds into one RNG seed.
/// Kept as a stand-alone fn so the value is reproducible from stored
/// columns alone (auditable).
fn mix_seed(series_seed: i64, enrollment_seed: i64) -> u64 {
    // Simple, stable 64-bit mix (splitmix-style constant). Deterministic
    // across platforms — we only need reproducibility, not cryptographic
    // quality.
    let a = series_seed as u64;
    let b = enrollment_seed as u64;
    a.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(b)
}

/// Draw a gap in `[min, max]` seconds from `rng`. Guards a degenerate
/// range (`max <= min`) by returning `min`.
fn draw_gap(rng: &mut StdRng, min: i64, max: i64) -> i64 {
    let min = min.max(0);
    let max = max.max(min);
    if max == min {
        min
    } else {
        rng.gen_range(min..=max)
    }
}

/// Effective offset for a fixed wave: explicit `offsetSeconds`, else a
/// running one-day cadence (`index * 86400`).
fn fixed_offset(def: &WaveDef, index: usize) -> i64 {
    def.offset_seconds
        .unwrap_or_else(|| index as i64 * DEFAULT_CADENCE_SECONDS)
}

/// Effective random gap bounds for a wave: explicit min/max, else a
/// one-day ± 0 default.
fn random_bounds(def: &WaveDef) -> (i64, i64) {
    let min = def.min_interval_seconds.unwrap_or(DEFAULT_CADENCE_SECONDS);
    let max = def
        .max_interval_seconds
        .unwrap_or(min.max(DEFAULT_CADENCE_SECONDS));
    (min, max)
}

/// Compute the full set of waves to materialize at enrollment time.
///
/// * `Fixed` / `RandomInterval` return one [`ScheduledWave`] per wave def.
/// * `Event` returns only wave 0 (subsequent waves are enqueued lazily by
///   [`next_event_wave_time`] on completion).
///
/// An empty `waves` slice yields no scheduled waves.
pub fn compute_wave_schedule(
    kind: ScheduleKind,
    waves: &[WaveDef],
    enrolled_at: DateTime<Utc>,
    series_seed: i64,
    enrollment_seed: i64,
) -> Vec<ScheduledWave> {
    if waves.is_empty() {
        return Vec::new();
    }

    match kind {
        ScheduleKind::Fixed => waves
            .iter()
            .enumerate()
            .map(|(i, def)| ScheduledWave {
                wave_index: i as i32,
                scheduled_at: enrolled_at + Duration::seconds(fixed_offset(def, i)),
            })
            .collect(),

        ScheduleKind::RandomInterval => {
            let mut rng = StdRng::seed_from_u64(mix_seed(series_seed, enrollment_seed));
            let mut cursor = enrolled_at;
            let mut out = Vec::with_capacity(waves.len());
            for (i, def) in waves.iter().enumerate() {
                let (min, max) = random_bounds(def);
                cursor += Duration::seconds(draw_gap(&mut rng, min, max));
                out.push(ScheduledWave {
                    wave_index: i as i32,
                    scheduled_at: cursor,
                });
            }
            out
        }

        ScheduleKind::Event => {
            // Only the first wave is scheduled at enrollment; the rest are
            // driven by completion. Wave 0 honours its explicit offset (a
            // baseline usually fires immediately → offset 0).
            let def = &waves[0];
            let offset = def.offset_seconds.unwrap_or(0);
            vec![ScheduledWave {
                wave_index: 0,
                scheduled_at: enrolled_at + Duration::seconds(offset),
            }]
        }
    }
}

/// Compute the `scheduled_at` for the wave AFTER `completed_wave_index`,
/// given when that prior wave was completed. Used by the completion
/// callback for `Event` schedules (and as a fallback recompute for the
/// others). Returns `None` when there is no next wave.
///
/// The next wave (index `completed_wave_index + 1`) uses:
///   * its explicit `offsetSeconds` interpreted as a gap from completion
///     (event semantics: "N seconds after you finished the last one"), or
///   * a seeded random gap from `[min, max]` when the wave declares
///     interval bounds, or
///   * the default one-day cadence.
pub fn next_event_wave_time(
    waves: &[WaveDef],
    completed_wave_index: i32,
    completed_at: DateTime<Utc>,
    series_seed: i64,
    enrollment_seed: i64,
) -> Option<ScheduledWave> {
    let next_index = completed_wave_index + 1;
    if next_index < 0 || next_index as usize >= waves.len() {
        return None;
    }
    let def = &waves[next_index as usize];

    let gap = if def.min_interval_seconds.is_some() || def.max_interval_seconds.is_some() {
        // Seed per (enrollment, wave) so the draw is deterministic even
        // though it happens at completion time (auditable replay).
        let mut rng = StdRng::seed_from_u64(
            mix_seed(series_seed, enrollment_seed).wrapping_add(next_index as u64),
        );
        let (min, max) = random_bounds(def);
        draw_gap(&mut rng, min, max)
    } else {
        def.offset_seconds.unwrap_or(DEFAULT_CADENCE_SECONDS)
    };

    Some(ScheduledWave {
        wave_index: next_index,
        scheduled_at: completed_at + Duration::seconds(gap),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn t0() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 9, 0, 0).unwrap()
    }

    fn waves_json() -> Value {
        serde_json::json!([
            { "label": "Baseline", "offsetSeconds": 0 },
            { "label": "Day 1", "offsetSeconds": 86400 },
            { "label": "Day 2", "offsetSeconds": 172800 }
        ])
    }

    #[test]
    fn parses_schedule_kinds() {
        assert_eq!(ScheduleKind::parse("fixed"), ScheduleKind::Fixed);
        assert_eq!(
            ScheduleKind::parse("random-interval"),
            ScheduleKind::RandomInterval
        );
        assert_eq!(ScheduleKind::parse("event"), ScheduleKind::Event);
        // Unknown → Fixed.
        assert_eq!(ScheduleKind::parse("garbage"), ScheduleKind::Fixed);
    }

    #[test]
    fn fixed_schedule_uses_absolute_offsets() {
        let waves = WaveDef::parse_all(&waves_json());
        let schedule = compute_wave_schedule(ScheduleKind::Fixed, &waves, t0(), 0, 0);
        assert_eq!(schedule.len(), 3);
        assert_eq!(schedule[0].wave_index, 0);
        assert_eq!(schedule[0].scheduled_at, t0());
        assert_eq!(schedule[1].scheduled_at, t0() + Duration::seconds(86_400));
        assert_eq!(schedule[2].scheduled_at, t0() + Duration::seconds(172_800));
    }

    #[test]
    fn fixed_schedule_defaults_to_daily_cadence_when_offset_missing() {
        let waves = WaveDef::parse_all(&serde_json::json!([{}, {}, {}]));
        let schedule = compute_wave_schedule(ScheduleKind::Fixed, &waves, t0(), 0, 0);
        assert_eq!(schedule[0].scheduled_at, t0());
        assert_eq!(schedule[1].scheduled_at, t0() + Duration::seconds(86_400));
        assert_eq!(schedule[2].scheduled_at, t0() + Duration::seconds(172_800));
    }

    #[test]
    fn random_interval_is_reproducible_for_same_seed() {
        let waves = WaveDef::parse_all(&serde_json::json!([
            { "minIntervalSeconds": 3600, "maxIntervalSeconds": 7200 },
            { "minIntervalSeconds": 3600, "maxIntervalSeconds": 7200 },
            { "minIntervalSeconds": 3600, "maxIntervalSeconds": 7200 }
        ]));
        let a = compute_wave_schedule(ScheduleKind::RandomInterval, &waves, t0(), 42, 7);
        let b = compute_wave_schedule(ScheduleKind::RandomInterval, &waves, t0(), 42, 7);
        assert_eq!(a, b, "same seed → identical schedule (auditable)");

        // Monotonic non-decreasing and within cumulative bounds.
        assert!(a[0].scheduled_at >= t0() + Duration::seconds(3600));
        assert!(a[0].scheduled_at <= t0() + Duration::seconds(7200));
        assert!(a[1].scheduled_at > a[0].scheduled_at);
        assert!(a[2].scheduled_at > a[1].scheduled_at);
    }

    #[test]
    fn random_interval_differs_across_enrollment_seeds() {
        let waves = WaveDef::parse_all(&serde_json::json!([
            { "minIntervalSeconds": 0, "maxIntervalSeconds": 100000 }
        ]));
        let a = compute_wave_schedule(ScheduleKind::RandomInterval, &waves, t0(), 1, 1);
        let b = compute_wave_schedule(ScheduleKind::RandomInterval, &waves, t0(), 1, 2);
        assert_ne!(
            a[0].scheduled_at, b[0].scheduled_at,
            "distinct enrollment seeds should (almost surely) diverge"
        );
    }

    #[test]
    fn event_schedule_only_materializes_wave_zero() {
        let waves = WaveDef::parse_all(&waves_json());
        let schedule = compute_wave_schedule(ScheduleKind::Event, &waves, t0(), 0, 0);
        assert_eq!(schedule.len(), 1);
        assert_eq!(schedule[0].wave_index, 0);
        assert_eq!(schedule[0].scheduled_at, t0());
    }

    #[test]
    fn next_event_wave_advances_from_completion() {
        let waves = WaveDef::parse_all(&serde_json::json!([
            {},
            { "offsetSeconds": 3600 },
            { "offsetSeconds": 7200 }
        ]));
        let completed_at = t0() + Duration::seconds(5000);
        let next = next_event_wave_time(&waves, 0, completed_at, 0, 0).unwrap();
        assert_eq!(next.wave_index, 1);
        assert_eq!(next.scheduled_at, completed_at + Duration::seconds(3600));
    }

    #[test]
    fn next_event_wave_is_none_past_last() {
        let waves = WaveDef::parse_all(&waves_json());
        assert!(next_event_wave_time(&waves, 2, t0(), 0, 0).is_none());
    }

    #[test]
    fn empty_waves_yield_empty_schedule() {
        let schedule = compute_wave_schedule(ScheduleKind::Fixed, &[], t0(), 0, 0);
        assert!(schedule.is_empty());
    }
}
