# Goal: prove questionnaire authoring through persisted results

Defined 2026-09-11. Establish a reproducible automated acceptance gate for an
ordinary form questionnaire and an existing reaction paradigm: author through the
real designer, save/reload, publish, complete as a separate participant, and verify
exact persisted results. Fix the product failures these scenarios expose.

This is the first autonomous delivery milestone. It is narrower than completing
the entire parity program and does not certify every question type or physical
reaction-time accuracy.

## Baseline when the milestone started

- `apps/web/e2e/fullstack/designer-creation-fillout.fullstack.spec.ts` creates a
  text question through the designer. Its final assertions accept an `active`
  session and do not verify the saved answer, so it is insufficient acceptance.
- `apps/web/e2e/reaction/` exercises the production renderer/input path and checks
  persisted trial rows, mapping, offline sync and media failure. Studies are
  provisioned through APIs; this does not prove reaction authoring works.
- `apps/web/e2e/form/` covers module-owned constraints and offline binary capture.
  Form/reaction fixtures insert 45-second inter-test delays, and ordinary form
  tests disconnect deliberately to avoid the known #51 online-sync failure.
- The active smoke test now provisions a real authenticated workspace. Older
  README/CI comments still describe its former hardcoded project. Verify active
  test bodies rather than treating those historical comments as current evidence.
- `.github/workflows/e2e.yml` is on-demand; E2E does not currently gate PRs.
  Historical failure comments are evidence to investigate, not fresh run results.
- #91's removal is local and tested at unit/build level. Full E2E evidence and its
  static reintroduction guard remain outstanding.

## Scenarios and acceptance

| Scenario | Required observations |
|---|---|
| Form authoring | Provision only user/org/project fixtures through real APIs. Create a questionnaire in the designer; add/configure text, choice and numeric questions with constraints; save and reload; preserve identifiers, content and settings; publish through the UI. |
| Ordinary online participation | Open the published questionnaire in a fresh participant browser context. Invalid answers block advance; corrected answers complete. Verify exact response values, question IDs/counts, version association and a completed server session. A completion screen alone is insufficient. |
| Reaction authoring | Use an existing shipped paradigm/preset through the designer. Configure a small deterministic trial plan, timings and semantic response bindings; save/reload and publish through the UI. No API-seeded questionnaire can satisfy this authoring test. |
| Reaction participation | Drive actual browser keyboard/pointer input through the production WebGL runtime. Assert trial count/order, semantic options, correct/incorrect/timeout outcomes, nonnegative plausible response-minus-onset timings and required provenance. Test observers may synchronize on presentation; they may not inject responses, scores or stored rows. |
| Recovery and sync | Exercise offline capture/reconnect, interrupted-session resume and duplicate delivery. Verify exact-once persisted answers/trials and completed state. Test transient 429/Retry-After and concurrent participants behind one IP without changing product limits solely for the tests. |
| Media and Timing validity | Retain/extend existing preload-failure, audio-start and degraded-timing coverage. Missing required media fails closed. Record/enforce behavior follows ADR 0027, with honest provenance. |
| JavaScript rejection | Existing executable hook fields cannot execute or disappear silently through authoring, preview, collaboration or participant paths. No JavaScript editor or CSP unsafe-eval fallback is restored. Full Safe Logic hook implementation remains separate work. |

Prefer existing production interfaces and test helpers. Fix a blocking product
bug at its owner; do not satisfy the gate by seeding the expected questionnaire,
mocking successful saves/sync, weakening assertions, disabling limits or adding
rate-window sleeps. Legitimate offline scenarios remain offline; the ordinary
online scenario must stay online.

## Work order and ticket boundaries

1. Establish the live-stack baseline and retain traces/logs for failures. Isolate
   test data from the user's studies. Reuse existing stack tooling and browser
   fixtures; fail visibly if required services cannot run.
2. Complete the remaining #91 removal/security acceptance, including a static
   reintroduction guard, then verify the current designer/runtime paths.
3. Fix #51's transient retry/throughput failure with targeted regressions. Remove
   the 45-second form/reaction rate gates once real online/recovery coverage passes.
4. Strengthen form designer-to-data assertions and add the missing reaction
   designer-to-data journey. Fix only the blockers required for these scenarios;
   record adjacent gaps against their existing tickets.
5. Run the bounded Chromium acceptance set successfully in two independent clean
   runs with retries disabled. Run applicable ordinary UI/runtime cross-browser
   regressions; report browser-specific limitations explicitly.
6. Wire the proven bounded gate into PR CI with required services, clear failure
   status and retained artifacts. Keep broader/physical qualification distinct.
   Prepare reviewable changes and an acceptance report; report actual hosted CI
   evidence only when a published revision has run it.

#36 (preview flow), #41 (custom reaction trials), #132 (access-policy enforcement)
and #145 (PCA) are already specified follow-on work. Do not expand this milestone
into their full implementation unless a concrete acceptance blocker requires a
bounded part. #76 is locally implemented and assigned; preserve its work and
track publication rather than reimplementing the tracer. #77 and subsequent
Safe Logic/QDef tickets must follow their native dependency graph.

## Evidence and completion

Keep an acceptance report with the commit plus dirty-tree identity, fixtures and
seeds, commands, browser/platform and service versions, scenario results, exact
server response/trial assertions, and remaining gaps. Retain Playwright traces,
screenshots/video on failure, browser errors, and server logs without secrets or
real participant data. Preserve artifacts per lane instead of overwriting them.
Failures on the first attempt are visible; a retry passing is not a clean gate.

Completion means the defined live-stack journeys and recovery/security checks
pass, the bounded gate is wired for PR use, and the code/evidence is reviewable.
Implementation tickets are not closed merely because local-only work passes.
Neither existing unit counts nor the planned checks are represented as an E2E
result before they actually run.

## Reaction measurement: separate levels of evidence

1. Deterministic model tests verify trial generation, scoring, ordering, random
   seeds, time arithmetic and rule/flow behavior with explicit inputs. Existing
   harness tests are useful at this level but do not prove a browser journey.
2. Real-browser E2E verifies authoring, production rendering/input, sync and
   provenance. Software-rendered headless Chromium can check those contracts;
   Playwright input latency is not a physical timing reference.
3. Physical qualification uses representative lab computers, displays and input
   devices with an external reference, such as a photodiode and input loopback.
   Measure onset/input latency distributions and degradation under load. Record
   the setup and results before claiming physical timing precision.

The first two levels can run autonomously. Real client questionnaires (#56) and
physical equipment/measurements require client or lab participation later; they
do not block establishing this automated milestone.
