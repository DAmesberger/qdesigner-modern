# ADR 0006 — Keep collaboration (Yjs); document it

**Status:** Accepted (2026-05-15); implementation notes reconciled 2026-09-13.

**Decision.** Keep Yjs collaboration as an always-on feature for authenticated
questionnaire designers. The server owns the authoritative CRDT seed and enforces
project membership and write permissions on `designer:{questionnaireId}` channels.
The browser uses `Y.Doc`; the server uses `yrs::Doc`. Presence is shown in the
designer header.

**Consequences.** The [collaboration architecture](../architecture/collaboration.md)
documents session-cookie authentication, channel permissions, the room lifecycle,
and the generation protocol used for revision-safe QDef replacement under
[ADR 0039](0039-safe-logic-only-and-qdef-boundary.md). A replaced document is never
merged with an old collaborative document. Old clients receive a reload outcome;
HTTP saves and binary persistence independently reject stale generations.

The current server stores the thread-safe document without a manual unsafe
`Send`/`Sync` implementation. Awareness is relayed without a server awareness
object. The Redis collaboration bridge remains inactive; this decision does not
assert that cross-node live edit broadcasting has shipped.
