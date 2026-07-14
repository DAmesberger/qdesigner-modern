# 0036 — The statistics a researcher reads must be the statistics we computed

Status: accepted (2026-07-14)

Continues the repair opened by `701bf8d` (the distribution core: `standardNormalInverse`
evaluated Acklam's polynomial in reverse Horner order, and `studentTCDF` discarded `df`).
That commit made the distributions real. It did not make the layers *above* them real, and
several of those layers were reporting plausible-looking numbers that were not the numbers
they claimed to be. This ADR records the fate of each.

The governing rule, and the reason this is an ADR rather than a bugfix commit: **a research
platform may report a statistic, or report that it cannot compute one. It may not report a
number that looks like the statistic and isn't.** A wrong `r` is worse than a missing `r`,
because a missing one gets investigated and a wrong one gets published. Every decision below
resolves to one of those two outcomes.

## D1 — One symmetric eigensolver, shared, in `scripting-engine`

`calculateEigenvalues` was a diagonal-only stub: it returned `matrix[i][i]` as the
eigenvalues and the identity as the eigenvectors. Fed a correlation matrix it therefore
returned `[1, 1, …, 1]` with an identity loading pattern — structurally valid output,
numerically meaningless. ADR 0021 had already noticed this and responded by leaving
`performPCA` unmounted, which contained the damage but left a loaded gun in an exported class.

We implement a real cyclic **Jacobi** eigensolver (`packages/scripting-engine/src/math/eigen.ts`)
rather than deleting `performPCA`. Two reasons: PCA is table stakes for a psychometrics
platform and ADR 0021 deferred it rather than rejecting it; and the *same* primitive is what
makes an honest McDonald's ω possible (D2), so the solver pays for itself twice.

It lives in `scripting-engine` — not in `apps/web/analytics` — because both consumers need it
and `apps/web` already depends on that package. Eigenvector signs are fixed deterministically
(largest-magnitude component positive), so loadings do not flip between runs on identical data.

`performPCA` remains **unmounted**. Making it honest is not the same as shipping it; it now has
correct math and no UI, and mounting it is a separate product decision.

## D2 — `OMEGA` becomes McDonald's ω, rather than being renamed

`OMEGA` returned `(k·r̄) / (1 + (k−1)·r̄)` — the Spearman-Brown / standardized-alpha formula,
which *assumes* tau-equivalence — while the help text told authors it "does not assume
tau-equivalence." The code and the documentation asserted opposite things, and the
documentation was the one researchers read.

Given D1, the honest ω is now cheap: extract a single-factor solution, take the standardized
loadings λᵢ and uniquenesses (1 − λᵢ²), return ω = (Σλ)² / ((Σλ)² + Σ(1 − λᵢ²)). We keep the
name and make it true, rather than keeping the math and renaming to `STANDARDIZED_ALPHA` —
authors' existing formulas keep working *and* start returning the coefficient they were
promised.

The discriminating test is the one worth knowing about: under **unequal** loadings, ω must
*exceed* standardized alpha (alpha under-estimates a congeneric scale). The old implementation
returned standardized alpha exactly, so it fails that assertion by construction.

## D3 — Tukey HSD stays an approximation, but a coherent and disclosed one

`studentizedRangePValue` computes a Šidák-corrected pairwise t, not the studentized range
distribution. We are **keeping** the approximation — implementing the true distribution is real
numerical work for a test whose inputs (the Tukey–Kramer q, the within-groups df) were already
correct. What we are not keeping is the incoherence:

- the p-value used **Šidák** while the confidence interval used **Bonferroni**, so
  `p < alpha` and "the CI excludes zero" were computed under different corrections and could
  disagree at the margin. Both now use Šidák (the exact inverse of the CI's critical value, so
  the two agree by construction — there is now a test asserting exactly that).
- the doc comment claimed a normal-distribution approximation (it uses `studentTCDF`) and cited
  a "Gleason (1999) approximation" it does not implement. Both claims deleted.
- `TukeyHSDResult` now carries `approximate: true` and `approximationMethod`, so a caller can
  tell. Previously the public JSDoc carried no caveat at all and the private comment was wrong
  about which approximation it was — honest that it was *an* approximation, dishonest about
  *which*.

Revisiting this to implement the exact studentized range remains open and is now a
capability decision, not a correctness one.

## D4 — A cache key is a hash, not a prefix

`hashArray` was `arr.reduce((h, v) => h + v.toString(), '').slice(0, 16)` — a delimiter-free
concatenation truncated to 16 characters. `[1,2]` and `[12]` produced the same key. Any two
datasets agreeing on their first 16 concatenated characters produced the same key, which for
Likert data (one character per response) is *most* of them. The cache then returned another
dataset's `StatisticalSummary` or `TTestResult` for up to the TTL.

Now: 64-bit FNV-1a over a length-prefixed, delimited serialization. Every call site was audited
so the key includes every input that changes the result (`method`, `type`, `mu0`, `components`),
not just the data.

## D5 — A Pearson r is only meaningful over paired observations

The cross-questionnaire "correlation" (`api/sessions/analytics.rs`) correlated the *i*-th
session of questionnaire A with the *i*-th session of B — two arrays ordered independently by
`created_at`, truncated to the shorter — and silently discarded the `participant_id` it had
already loaded. It was not a correlation. It could report r = +1.000 on data with no
relationship, and the fixture in `tests/analytics_honesty.rs` does exactly that.

Now: an inner join on `participant_id`. A participant with several sessions contributes their
mean; a participant present in only one arm is dropped. `paired_n` is reported alongside `r`,
and **`correlation` is `None`** below `MIN_CORRELATION_PAIRS` (= `MIN_COHORT_N`) or when either
arm has zero variance — an r over 2 pairs is ±1 by construction, and r on a constant is
undefined, not zero. The UI renders "insufficient data", never a number.

`paired_pearson_correlation` now takes `&[(f64, f64)]` rather than two parallel slices. The old
signature *invited* the bug; the new one makes it unrepresentable.

## D6 — Completion rate divides by sessions

`total_responses` is `COUNT(DISTINCT r.id)` — response *rows*. It was the completion-rate
denominator in four places (dashboard, per-questionnaire, overall, plus a client-side twin), so
a 10-question questionnaire with 10 fully-completed sessions reported **~10% completion**. The
`.max(completed_sessions)` guards around it were papering over a denominator that could be
smaller than its numerator.

All four now divide by `COUNT(DISTINCT s.id)` through one shared helper, and the `.max()` fudges
are gone. Three *other* views already computed this correctly; the product was contradicting
itself depending on which page you opened.

## D7 — An export that cannot be reproduced is not a result

Exports carried neither the `timing_provenance` blob nor the session's questionnaire version
pin — so a researcher could not tell which version of an instrument produced a dataset, nor
whether its timing was trustworthy. Both now flow through every export path (client CSV, client
XLSX, server CSV). An **absent** pin exports as an empty cell and is counted on the summary
sheet, never as `0.0.0`: "unpinned" is a real, reportable state, and a fabricated version is
worse than a blank one.

Formula injection: no export path neutralized a leading `=`, `+`, `-`, `@`, tab or CR, so a
participant-supplied id could execute when a researcher opened the file. All producers now share
one guard, with a numeric-literal exemption so legitimate negative values (every negative
reaction-time delta in the dataset) are not mangled. Note the honest scope: ExcelJS writes a
leading-`=` string as a *string* cell, not a formula element, so the .xlsx path was never a
live-execution vector — the CSV writers were. The xlsx producers are guarded anyway, because
re-exporting a sheet to CSV is where an unguarded value goes live.

Five separate CSV writers had each forked their own escaping logic and all five shared the same
bugs (no injection guard; a quoting predicate that missed a lone `\r`). One of them also derived
its headers from `Object.keys(rows[0])` and stringified with `String(val)`, exporting the `value`
column as literal `[object Object]`. There is now one cell helper, and the divergence is gone —
five copies of a rule is how a fix lands in four places and the bug survives in the fifth.

## Consequences

- **The export CSV's column set and order changed.** `questionnaire_version` is inserted at
  index 3 and `timing_provenance` is appended; SPSS 8-char mode gets `q_ver` / `t_prov`. Any
  downstream consumer parsing by column *position* will notice. There is no released consumer,
  but this is the kind of change that is free today and expensive later.
- **`api_keys.rs`'s machine export now emits the apostrophe guard** on formula-leading values.
  That export previously escaped correctly but had no injection guard; unifying the two divergent
  server escapers onto one helper gives it the guard, and changes its bytes for such values.
- PCA and ω are trustworthy but PCA is still unmounted; only unit tests exercise it. That is a
  deliberate, disclosed gap, not an oversight.
- Tukey is still approximate. It is now *labelled* approximate, which is the part that was
  actually wrong.
- D5 and D6 change numbers researchers may already have seen on the dashboard. Pre-production,
  no shipped study is affected — but they are behaviour changes, not silent repairs.
- Contract drift, found while doing this: `packages/contracts` was already stale on `main` (it
  does not contain the ADR-0033 project-invitation routes). Nothing in CI catches a stale
  generated client. Logged as follow-up; not fixed here.
