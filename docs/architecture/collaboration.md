# Questionnaire collaboration

The designer uses a Yjs document over the authenticated `/api/ws` connection.
The upgrade authenticates the `qd_session` cookie; `qde-auth` is the application
subprotocol marker. Subscribing to `designer:{questionnaireId}` requires project
access. Viewers can synchronize and exchange presence; only editors can submit
content updates. The server uses `yrs::Doc`, which is `Send + Sync`; awareness is
relayed rather than stored in a server awareness object.

The server seeds each document from the persisted questionnaire content. An atomic
`NULL` to binary-state election preserves a single CRDT identity across concurrent
opens. Clients wait for that authoritative state before enabling editing. Room
updates are persisted with a debounce and flushed on eviction. The JSON content
projection is saved separately by the designer's authenticated HTTP save path.

## Definition replacement

QDef replacement and [stable-ID edits](definition-edits.md) go through
`QuestionnaireDefinition.apply`. The transaction
checks project write access and the expected server revision, snapshots the prior
definition and settings, installs the replacement, advances its server revision
and `collaboration_epoch`, clears `yjs_state`, and records the audit event and
idempotency receipt. A rejected transaction leaves all of these unchanged.
Native drafts outside the current export capabilities can still be replaced:
the snapshot preserves their complete stored content and settings. The optional
prior portable digest is omitted when it cannot be computed faithfully.

Every collaboration binary frame carries a generation envelope:

```
varuint(2), varuint(collaboration_epoch), inner Yjs frame
```

Inner type `0` carries Yjs sync messages; type `1` carries awareness. A generation
notification can have no inner frame. Unwrapped frames are rejected. This is an
intentional development protocol break; deployed web and server revisions must
use the same envelope.

The browser's generation comes from its HTTP load and stays fixed for the lifetime
of its document. Before processing a sync frame, the server resolves the durable
generation and uses a room from that generation. Mismatches receive the current
generation without applying the old update. Responses and broadcasts keep their
generation, so delayed old broadcasts cannot enter a newer browser document.
Every binary persistence write also compares the room's generation in SQL; an old
room's delayed flush cannot undo replacement.

Connected browsers exchange state vectors every two seconds, allowing idle clients
to detect replacement, including replacement performed through another server.
A newer generation stops editing and automatic reconnect, and presents **Reload
Current Draft**. Reload installs a fresh HTTP definition and a fresh Yjs document.
An offline client's reconnect uses its old generation and gets the same conflict
outcome. HTTP saves independently submit the observed generation and reject stale
saves before snapshotting or modifying the replacement.

The generation checks use durable database state. They do not enable the inactive
Redis collaboration bridge or claim cross-node live edit broadcasting.

## Verification

`http_questionnaire_replacement.rs` exercises revisions, authorization, immutable
snapshots, retries, competing writes, stale HTTP saves, and transactional failure.
`qdef-replacement.fullstack.spec.ts` exercises real designer import/replacement,
multiple collaborators, reload, and revision conflict guidance. Existing channel
write authorization and room lifecycle tests remain part of the server suite.
