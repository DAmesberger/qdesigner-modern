# 0021 — Mount the analytics psychometrics suite

- Status: Accepted
- Date: 2026-07-04
- Phase: 8 (fork: psychometrics)

## Context

QDesigner ships a substantial, tested psychometrics stack that was **dead code** —
compiled but unreachable from any live route, wired only through an unused barrel
(`lib/analytics/index.ts`):

- **Engine** — `lib/analytics/StatisticalEngine.ts`: Cronbach's alpha with
  item-total correlations, alpha-if-deleted, split-half (Spearman-Brown), mean
  inter-item correlation, descriptive statistics (mean/median/SD/quartiles/
  skew/kurtosis/outliers), correlation, t-tests, ANOVA, regression, PCA/factor
  analysis, plus a battery of non-parametric and post-hoc tests. Covered by
  `StatisticalEngine.test.ts`.
- **Widgets** — `lib/analytics/components/{ReliabilityWidget,IRTWidget,DescriptiveStatsWidget,StatisticsCard,…}.svelte`
  and the richer `lib/components/analytics/{ReliabilityPanel,IRTPanel}.svelte`
  (self-computing reliability incl. KR-20; ICC + Test-Information-Function plots).

The live per-questionnaire analytics route
(`routes/(app)/analytics/[questionnaireId]/+page.svelte`) surfaced only funnel,
timeseries and completion-time descriptives — none of the psychometrics.
Researchers had no way to see reliability or item statistics for their scales.

The suite is real and valuable, not scaffolding. Deleting it would throw away
working, tested capability that is core to the product's stated purpose
(psychological and behavioural research instruments).

## Decision

**Mount** the psychometrics suite into the live per-questionnaire analytics
route rather than delete it.

1. **Data wiring.** The route loader (`+page.ts`) already had access to the
   owning `project_id` (via the dashboard summary). It now also client-loads the
   raw responses via the existing `GET …/export?format=json` endpoint
   (`api.questionnaires.export`) into `data.exportRows: ExportRow[]`. This is the
   same response data the CSV/JSON export buttons already used — no new endpoint.

2. **Derivation module.** `lib/analytics/psychometrics.ts` (`buildPsychometrics`)
   is a pure pivot: it groups the flat `ExportRow[]` into a session × question
   map, coerces values to numbers, detects numeric/scale items (≥60% numeric,
   >1 distinct value), builds a complete-case participant × item matrix, and
   derives:
   - **Reliability** via `StatisticalEngine.calculateCronbachAlpha` (item
     columns), gated on ≥2 items and ≥3 complete cases.
   - **Per-item descriptive statistics** via `calculateDescriptiveStats`.
   - **IRT** — when responses are dichotomous (0/1), classically-estimated 2PL
     parameters (difficulty `b = -Φ⁻¹(p)`; discrimination from the item-rest
     point-biserial correlation) feed the ICC/TIF plots. Non-dichotomous data
     gates gracefully with an explanatory empty state.

3. **UI.** A new "Psychometrics" section on the route reuses the existing
   widgets unchanged: `StatisticsCard` (KPI row: participants, scale items,
   Cronbach's α, mean inter-item r), `ReliabilityPanel` (full reliability +
   item-analysis table), `DescriptiveStatsWidget` (per-item grid), and
   `IRTPanel` (item-parameter table + ICC + Test Information Function). Every
   sub-analysis has a clear insufficient-data state; nothing throws on thin or
   non-numeric data.

## Consequences

- Researchers can now see Cronbach's alpha, item-total correlations,
  alpha-if-deleted, split-half/KR-20, per-item descriptives, and (for
  dichotomous scales) IRT curves for any questionnaire with collected responses.
- The psychometrics widgets and the reliability/descriptive paths of
  `StatisticalEngine` are now reachable production code, not dead weight.
- The mount reuses widgets **as-is** — their props were already the right shape;
  the only new code is the `buildPsychometrics` pivot and the route section.
  Widget orientation differs by design: `StatisticalEngine.calculateCronbachAlpha`
  takes item-major columns, `ReliabilityPanel` takes a participant-major matrix;
  the pivot produces both.
- **Not mounted (deferred):**
  - `ReliabilityWidget` / `IRTWidget` — the simpler table-only variants are
    superseded by the richer `ReliabilityPanel` / `IRTPanel` used here; mounting
    both would duplicate the same numbers.
  - **Factor analysis / PCA.** `StatisticalEngine.performPCA` currently uses a
    diagonal eigenvalue approximation (its own comment flags this as a
    placeholder for a real QR/eigensolver), so its loadings are not
    publication-accurate. Surfacing it would mislead; deferred until the
    eigensolver is real. No dedicated factor-analysis widget exists yet either.
  - The IRT parameters shown are **classical/heuristic estimates**, not a full
    marginal-maximum-likelihood calibration. They are labelled as item-response
    curves and are appropriate for exploratory inspection; a proper calibration
    routine is future work.

## Alternatives considered

- **Delete the suite** — rejected: it is tested, working, and central to the
  product domain.
- **Build a fresh psychometrics UI** — rejected: the existing widgets already
  render exactly the needed views; rebuilding would waste the tested components.
- **Server-side computation** — deferred: the dataset per questionnaire is small
  and already exported to the client; client-side derivation keeps the change
  contained to the frontend and needs no new endpoint.
