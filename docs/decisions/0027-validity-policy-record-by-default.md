# 0027 — Timing-validity problems record by default; stopping is opt-in

Status: accepted (2026-07-10, grilling session)

When timing validity degrades mid-study — a backgrounded/blurred tab during
a trial, `crossOriginIsolated === false` (timer resolution clamped to
~100µs), throttled timers, context loss — the default behaviour is to
**record and continue**: the affected trial/session carries explicit
provenance (`invalidated: 'visibility'`, `crossOriginIsolated: false`,
measured timer resolution, ballooned-phase deltas) and analytics surfaces
it loudly, but the participant is never stopped. A per-study **ValidityPolicy**
(`record` | `enforce`, default `record`) lets authors of
timing-critical studies escalate: under `enforce`, reaction blocks refuse
to run without cross-origin isolation, and a visibility loss aborts the
in-flight trial (flagged, re-queued at block end with a bounded retry cap).

This is the deliberate mirror of ADR 0026: **missing data fails closed;
degraded timing records and continues.** Rationale: media absence changes
what the participant experienced (unfixable post hoc), while timing
degradation is measurable, stampable, and excludable post hoc — and
hard-stopping by default would brick studies over ops hiccups and punish
participants for deployment mistakes.
