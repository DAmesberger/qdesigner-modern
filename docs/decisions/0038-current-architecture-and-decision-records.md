# 0038 — Current architecture and decision records

Status: accepted (2026-09-11, user-directed reconciliation).

Supersedes the backend architecture in the original PRDs and ADR 0017's use of
the Phase 7 plan as the active delivery queue. This records the current baseline;
it does not certify completion of the old audit or its acceptance gates.

The platform uses SvelteKit/Svelte 5, Rust/Axum, PostgreSQL 18, Redis, and
S3-compatible object storage. The Rust service owns REST APIs, local JWT
authentication and OIDC federation, authorization and media access. Yjs runs over
WebSocket with Redis relay. The ordered Rust migrations define the schema; the
generated OpenAPI contracts define the client/server interface. The former hosted
backend architecture is retired, including its setup instructions and schema examples.

The tradeoff is explicit ownership of backend operations and security in exchange
for a single application-controlled authorization and persistence boundary. This
reaffirms the implemented architecture rather than commissioning another rewrite.

Requirements describe outcomes that must be delivered. ADRs record how to achieve
them and may retire a requirement only through an explicit product decision.
Implementation deferral or an unmounted feature does not remove a delivery requirement.
In a conflict, record the requirement, the affected ADR and the unresolved decision;
do not treat the implementation as permission to reduce scope.

The [decision index](README.md) identifies current and superseded decisions.
Accepted means the architecture is chosen; implementation and acceptance evidence
are recorded separately. Earlier ADR context remains historical. Add a successor
ADR for a changed decision and update the older record's status/forward link.
Correcting a link, identifier or implementation-status note does not change the
historical decision.

The Phase 7 plan/findings and Phase 8 plan are historical work records. Phase 8's
recorded implementation closeout does not retroactively prove every Phase 7 finding
or release gate complete. Current delivery uses GitHub specifications and tickets,
including [program #54](https://github.com/DAmesberger/qdesigner-modern/issues/54),
[foundation #75](https://github.com/DAmesberger/qdesigner-modern/issues/75), and the
September successor specifications. The [offer](../angebot-qdesigner-modern-2026-09.md)
and [university mapping](../abgleich-pflichtenheft-angebot-2026-09.md) remain scope
references; open options and client acceptance evidence remain explicit.

The response/hardware decision formerly sharing identifier 0024 is now
[ADR 0037](0037-response-model-and-hardware.md), unchanged in substance. Its old
filename is a historical link. [ADR 0024](0024-sqlx-offline-macros.md) uniquely names
the SQLx decision.
