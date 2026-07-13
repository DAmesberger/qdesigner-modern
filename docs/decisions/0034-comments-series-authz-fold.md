# 0034 — Fold comments & series into `authorize()`; fix their two authorization bugs

Status: accepted (2026-07-13, grilling session). Resolves the ADR 0030
divergence-ledger rows **L12** (comments) and **L13** (series), which were left
unfolded pending a home in the vocabulary. Applies ADR 0032's model and
benefits from ADR 0033 (the guest role is gone, so `verify_questionnaire_access`
is now "org-member OR project-member" — comments/series no longer serve external
share guests).

## Context

Two feature endpoints stayed on the coarse `access::verify_questionnaire_access`
gate through the ADR 0030 sweep because they had no clean `(scope, permission)`
mapping, and each carries a confirmed audit bug:

1. **Comments** (`api/comments.rs`). `update_comment`'s
   `WHERE id = $1 AND questionnaire_id = $2 AND (author_id = $3 OR $5 IS NOT
   NULL)` — where `$5` is `body.resolved` — lets **any** member who includes a
   `resolved` value bypass the author check and rewrite **another author's
   comment body**. `delete_comment` is correctly author-only; `create`/`list`
   gate on questionnaire read (any member).
2. **Series** (`api/series.rs`). `create_series`, `update_series`, and `enroll`
   all gate on `verify_questionnaire_access` (read level), so a project
   **viewer** can mutate study schedules and enroll participants.

Both must fold into `authorize()`. ADR 0032 made `Scope::Questionnaire`
read-only, so both authorize at `Scope::Project`.

## Decision

**Map to existing project tiers — no new `Permission` variants.** Comments and
series don't need their own permission axis; they follow project read/write.
Ownership (comment authorship) is an in-handler check layered on the coarse
gate, not a permission.

**Comments** (all `Scope::Project`):

| Op | Authorization |
|----|---------------|
| `list_comments`, `create_comment`, resolve/unresolve | `authorize(Scope::Project, ProjectRead)` — any project member (commenting is collaborative) |
| **edit body** (`update_comment`) | author-only: the body change applies iff `author_id == caller`, gated **independently** of the resolve change |
| `delete_comment` | project access **AND** (`author_id == caller` **OR** `verify_project_access(Admin)`) — author or project-admin moderation |

The fix: a `resolved` value can no longer bypass the author check. A **body**
change requires authorship; a **resolve** change requires only project read.
Nobody — not even an admin — edits another member's body; an admin can *delete*
a comment (moderation) but never rewrite it.

**Series** (5 researcher sites; the participant token endpoints
`resolve_prompt`/`complete_prompt`/`unsubscribe_prompt` are untouched):

| Op | Authorization |
|----|---------------|
| `list_series`, `list_enrollments` | `authorize(Scope::Project, ProjectRead)` (Viewer) |
| `create_series`, `update_series`, `enroll` | `authorize(Scope::Project, ProjectWrite)` (Editor) |

The fix: a viewer keeps read access to schedules/enrollments but is denied
create/update/enroll. `enroll` is a researcher mutation → `ProjectWrite`.

**Consequences (recorded in the ledger):**

- Comments/series reads now gate through `verify_project_access(Viewer)` (via
  `authorize(Scope::Project, ProjectRead)`) rather than
  `verify_questionnaire_access`, so they **respect `projectVisibility='members'`**
  — incidentally fixing the audit's visibility-bypass finding for these
  endpoints. A behavior change beyond the two named bugs, but a correct
  tightening (an org member with no project membership no longer reads a
  confidential project's comments/series).
- `ProjectRead` (a read permission) authorizes comment `create`/`resolve` — the
  accepted cosmetic wart of not minting `Comment*` permissions. Functionally
  correct ("any project member comments"); documented rather than laundered
  behind two new enum variants.
- Ledger L12/L13 move to resolved; the `verify_*` halves for these files were
  the last `pub(crate)` divergent read sites from the sweep.

## Rollout

One server-only unit (no frontend / live-QA surface). Gate: existing comment
and series suites stay green, **plus** new tests — (a) a non-author cannot edit
a comment body even while setting `resolved`, and the resolve still succeeds for
a non-author; (b) a project viewer is denied `create_series`/`enroll` but can
`list_series`; (c) a project admin can delete another member's comment, a plain
member (non-author) cannot.

## Rejected

- **Dedicated `Comment*`/`Series*` permissions.** Semantically crisp (a custom
  role could grant "view but not comment"), but +4–6 enum variants, their
  default-permission sets, a seed migration, and the frontend matrix — vocabulary
  growth the operations don't warrant. Mapping to project tiers fixes both bugs
  with zero new vocabulary.
- **Comment moderation by editing.** An admin editing another member's body was
  never on the table — moderation is *delete*, never rewrite.
- **Author-only delete (no admin override).** Considered as the minimal
  bug-fix-only scope, but orphaned inappropriate comments (author leaves) are a
  plausible review annoyance and `verify_project_access(Admin)` is already
  available, so the moderation override is worth adding deliberately here.
- **Series mutations at Admin tier.** No series op is as destructive as deleting
  the study; `update_series` archive/cancel is an Editor-level edit. Editor is
  the right floor.
