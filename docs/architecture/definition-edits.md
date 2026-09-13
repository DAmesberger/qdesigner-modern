# Atomic Questionnaire Definition edits

`QuestionnaireDefinition.apply` owns full replacement and stable-ID edit batches.
The HTTP adapter is `POST /api/projects/{projectId}/questionnaire-definitions/apply`.
Its body supplies exactly one of `definition` (a QDef JSON string) or `edits`
(a JSON array), plus `questionnaireId`, positive `expectedRevision`, and `commit`.
Committing requires an actor/project-scoped `idempotencyKey` of at most 128 bytes.
Editing requires project write permission, including for a preview.

```json
{
  "questionnaireId": "<draft UUID>",
  "expectedRevision": 4,
  "commit": false,
  "edits": [
    {"op": "replace", "path": "/questions/@age/display/content", "value": "Your age"},
    {"op": "move", "from": "/pages/@followup", "path": "/pages/@followup", "before": "intro"}
  ]
}
```

## Addressing and operations

Paths use JSON Pointer escaping (`~0` for `~`, `~1` for `/`). A collection member
uses `@` followed by its stable ID. Numeric array positions are rejected. Registry
members in `questions`, `variables` and `assets` also require `@`; ordinary object
fields do not accept it. `/pages` is an alias for `/structure/pages`, and a block's
`questions` path addresses its ordered `questionIds` references. For example,
`/pages/@intro/blocks/@main/questions/@age` addresses one question reference.

Each batch contains 1–128 operations, applied sequentially on an isolated document:

- `add`: requires an absent target and a `value`. In ordered collections, optional
  `before` is a plain sibling ID; omission appends.
- `replace`: requires an existing target and replaces its value.
- `remove`: requires an existing target. It does not silently remove references.
- `move`: removes `from` and inserts it at `path`, optionally before a sibling.
  Moving to the same path reorders an element. It cannot overwrite another target,
  rename an ID, or move an element into its own descendant.

Replacing an array element must preserve its ID. Direct edits to its `id` field
are rejected. Add/remove operations can intentionally express an identity change
and repair every affected reference in the same batch. Final validation runs after
all operations, so temporary dangling references inside a batch are allowed.
Each question can occur at most once within a block's reference list; repeated
references in that list produce `QDEF_DUPLICATE_REFERENCE`. The same question
may still appear in different blocks, where its full stable paths are distinct.

The resulting QDef passes the same safety, schema, module and reference validation
as a full replacement. Raw duplicate keys are rejected before deserialization;
edit values also receive executable-content inspection in their destination
context. Stable IDs such as `script` remain data. Unsupported capabilities remain
unsupported until their module/behavior tickets are delivered; edits are not a
way around that boundary.

## Atomicity, retries and result

The server locks the current draft, checks its revision, applies and validates the
whole batch, then uses the shared replacement transaction for the immutable prior
snapshot, content/settings, variable projections, revision, collaboration generation,
audit append and receipt. Any failure leaves all of those unchanged. A native draft
that cannot be represented faithfully as QDef must be replaced before it can be
edited through this interface.

`commit: false` returns the proposed canonical document and diagnostics without
writes. A successful commit returns its new revision, `beforeDigest`, `digest`, and
the same semantic `diff`. Stale revisions return `REVISION_CONFLICT` with the current
revision. Missing targets, identity conflicts and bad ordering anchors have stable
`EDIT_*` diagnostic codes and related paths.

The receipt identity includes the canonical commands, target and expected revision.
An identical committed retry returns its original result even after the draft has
advanced. A changed command with the same key returns `IDEMPOTENCY_CONFLICT`.
Failed batches do not consume the key. Successful edit audits use
`questionnaire.definition_edited`.

Diffs describe additions, removals, changed values, ordering and question-reference
changes at stable paths. The summary contains at most 100 entries and its complete
serialized JSON is at most 16 KiB. `totalChanges` counts every semantic change;
`truncated` explicitly identifies omitted detail. Truncation never drops changes
from the applied definition. Replacement previews use the same diff builder.

Open designers receive the existing [collaboration generation conflict](collaboration.md)
and reload the committed definition. Old Yjs frames and HTTP saves cannot restore
the prior state.

## Verification

`http_questionnaire_edits.rs` exercises mixed content/order/reference batches,
rollback, unsafe and duplicate-key input, stale revisions, concurrent retries,
receipt conflicts, escaped IDs and bounded diffs with complete persisted content.
`qdef-replacement.fullstack.spec.ts` verifies preview summaries and an edit batch
through a real server, collaboration connection, designer reload and subsequent save.
