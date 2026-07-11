# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the project's domain glossary (Paradigm, Preset, Trial, TimingSpec, …).
- **`docs/decisions/`** — this repo's ADR directory (**not** `docs/adr/`). Read ADRs that touch the area you're about to work in. Numbered `0001-…` through `0028-…`; the directory also holds non-ADR planning docs (`PHASE_*_PLAN.md`, `SUPERVISOR_PROTOCOL.md`, `baseline.md`) — those are process artifacts, not decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/decisions/
│   ├── 0001-rls.md
│   ├── …
│   └── 0028-trial-aggregates-explicit-minn.md
├── apps/            (web, server)
└── packages/        (contracts, questionnaire-core, scripting-engine)
```

The workspace is a pnpm monorepo, but frontend and backend share one domain, so there is a single root context — no `CONTEXT-MAP.md`.

## Writing new ADRs

New ADRs go in `docs/decisions/` with the next sequential number. **When an ADR's status changes, a new ADR supersedes it rather than editing in place** — this is the repo's established convention (see e.g. 0008 superseding 0007, 0011 superseding 0010).

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR 0027 (validity policy record-by-default) — but worth reopening because…_
