# 0028 — Trial-level server aggregates; disclosure floors are explicit, not platform-imposed

Status: accepted (2026-07-10, grilling session)

The server-variable primitive (E-FEEDBACK-3: aggregates declared on the
questionnaire, computed server-side over published declarations only,
pre-synced and resolved offline) gains **trial-level sources** over the new
`trials` table (e.g. median `rt_us` where `correct` and not `invalidated`,
per question/arm). This enables instant offline participant-vs-cohort
visualizations: cohort whiskers from the pre-synced aggregate, the
participant's own statistics from local `filloutTrials`.

The hardcoded `n≥5` privacy floor inside the aggregate SQL is **removed as
a platform constant** — it was invisible in the designer and its
suppression was indistinguishable from missing data. Instead every
declaration carries an explicit **`minN`** (visible and editable where the
aggregate is authored; new declarations default to `1`, existing ones
migrate to `5` so nothing changes silently), plus an authored
below-threshold behavior (`hide` or `placeholder` with progress). The
rendered output always discloses the current n to participants and
researchers. Rationale: transparency over implicit paternalism — an
author-visible number with mandatory n disclosure is more honest than a
hidden floor, and disclosure risk is the author's call per aggregate, not
a platform guess.
