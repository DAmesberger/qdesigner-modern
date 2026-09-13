# 0040 — PCA remains a delivery requirement

Status: accepted (2026-09-11, user decision).

Partially supersedes [ADR 0036](0036-honest-statistics.md) D1's statement that mounting
PCA requires a separate product decision, and continues
[ADR 0021](0021-analytics-psychometrics.md). Numerical honesty and every other
statistical decision remain unchanged.

PCA is in the requirements and [offer L10](../angebot-qdesigner-modern-2026-09.md).
It remains required. Its unmounted state is an implementation gap, not a scope
deferral. The existing Jacobi eigensolver and `performPCA` supply the numerical
implementation; the researcher-facing analytics workflow still needs delivery.

Acceptance requires a reachable analytics workflow with explicit item/data
selection, component results and explained variance, actionable invalid-data
handling, and tests against the existing numerical implementation. The interface
must describe PCA accurately rather than implying a different factor-analysis
method. Existing implementation choices can guide the UI; they cannot silently
remove the required outcome. This ADR does not claim that UI is implemented.
