# 0039 — Safe Logic only, with one QDef authoring and testing boundary

Status: accepted (2026-09-11, user decision).

Partially supersedes [ADR 0003](0003-scripting.md) where retaining JavaScript
execution was part of consolidation, and [ADR 0029](0029-form-enforcement-and-offline-binaries.md)
where JavaScript `onValidate` execution and failure-open behavior were specified.
The shared package location, module-owned response validity and offline binary
contract remain in force.

Questionnaire hooks and custom logic use the chosen **Safe Logic** language only:
`qexpr/1` expressions and `qrule/1` rules, with textual and visual authoring over
one typed model. There is no executable JavaScript field, custom-function body,
dynamic compiler, worker fallback or trusted-author escape hatch in the product.
Existing formula AST evaluation is useful implementation groundwork, not evidence
that the complete new expression/rule contract has shipped.

Remove JavaScript execution and authoring immediately. The product is in development;
breaking incompatible questionnaires is preferable to retaining an implementation
that attracts more JavaScript-dependent features. Existing definitions containing
executable JavaScript must be rejected with an actionable diagnostic, not executed,
silently stripped or allowed through a temporary compatibility mode. Empty legacy
fields carry no behavior. Remove the CSP `unsafe-eval` concession. A future hook
runtime must implement Safe Logic; missing rule support is outstanding work, not a
reason to restore the JavaScript engine. Module-owned response constraints continue
to block invalid answers independently of hooks.

All definition operations converge on one `QuestionnaireDefinition` module with
`read`, `apply` (including dry run) and `test` operations. It owns portable semantics,
validation, Safe Logic, assets, stable-ID edits, optimistic revisions, persistence,
collaboration reseeding, authorization, audit and deterministic testing. Designer,
HTTP and MCP adapters share this boundary; they do not implement competing codecs
or validators. Ownership and participant data stay outside portable definitions.

The MCP adapter is authenticated and stateless, with three initial operations:
definition read, definition apply and questionnaire testing. Authorization combines
delegated OAuth ceilings with local scope/permission checks and independent RLS.
The initial adapter cannot publish. Migration is an agent workflow over the same
product boundary, not a built-in legacy converter.

These choices carry the requirements in [the successor specification](../questionnaire-definition-mcp-requirements.md)
and [#75](https://github.com/DAmesberger/qdesigner-modern/issues/75). They deliberately
replace the older JavaScript product design. Full Safe Logic authoring/execution,
complete QDef import/packages and MCP remain implementation work; the existing
text-only export/dry-run tracer does not satisfy them. The prior sequencing in
#90/#91 that retained JavaScript until replacements shipped is superseded by the
immediate-removal decision above.
