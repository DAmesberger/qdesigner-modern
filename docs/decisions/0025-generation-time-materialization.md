# 0025 — Trials materialize at generation time; the engine never samples

Status: accepted (2026-07-10, grilling session)

Every randomizable quantity in a reaction task — TimingSpec distributions
(foreperiod/ISI jitter, ITI ranges), stimulus sequences, counterbalancing —
is sampled by the seeded generator when trials are **materialized**, before
the block runs. The engine receives only concrete per-trial values and
executes them; it contains no RNG. Authoring-side "fully programmable
timings" therefore means richer TimingSpecs at the generation layer
(uniform min/max now, spec shaped to admit named distributions like
exponential later), not engine changes.

Why: reproducibility (seed + sessionId ⇒ identical trial sequence),
auditable exports (the sampled value is trial data, not a runtime accident),
and a hot timing path free of sampling logic. Rejected: runtime sampling
(more flexible for adaptive timing, but breaks replay/provenance) and
per-trial duration formulas via the scripting engine (sandbox in the hot
path; same rationale as ADR 0024's rejection of scripted response
validators).
