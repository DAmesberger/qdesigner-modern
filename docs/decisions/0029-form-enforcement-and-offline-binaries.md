# 0029 — Form answers: validation blocks at capture; binary answers are offline-first

Status: accepted (2026-07-11, grilling session)

Unifying principle, extending ADRs 0026/0027 to the form path:
**participant-correctable problems block at capture; infrastructure
problems record with provenance and continue.**

## Half 1 — Validation enforcement (issue #33)

Form validation on the DOM fillout path is **blocking, unconditionally**:
constraint violations (minLength/maxLength/pattern/email/url/tel, numeric
min/max, and module-specific rules) gate Continue exactly like
required-presence does. There is no study- or question-level policy knob.
This deliberately does **not** mirror ADR 0027's record-by-default: timing
degradation is (a) not the participant's fault, (b) unfixable in the
moment, and (c) excludable post hoc — an invalid answer inverts all three.
It is precisely the thing the participant can fix right now, blocking
cannot brick a study over ops hiccups, and a recorded-but-invalid answer
is unrecoverable data, not excludable noise.

Consequences:

- `NumberInput`'s silent clamp-on-blur is removed. Out-of-range input
  errors and blocks; a persisted value is always literally what the
  participant entered and confirmed. Spinner arrows may still stop at the
  bounds — it is the silent rewrite of typed input that goes.
- The script `onValidate` hook **blocks on an explicit invalid verdict**
  (`{valid: false, message}` → gate Continue, show the message) and
  **fails open when the script misbehaves**: a throw or timeout logs,
  stamps provenance on the response, and allows advance. The script's
  verdict is a validation rule; the script's crash is an ops hiccup.
- **Modules own validity.** The `FormHostPresentation.onValidation`
  channel (declared but never populated) is wired through
  `presentFormQuestion` into `canAdvance`; modules report validity with
  each response. Required-presence gating stays central, so the worst
  failure of a buggy module is an unenforced constraint, never a stuck
  participant. The `@form` e2e lane (issue #35) asserts per-type gating.

Rejected: record-and-flag default with opt-in enforce (collects
unrecoverable garbage by default); per-question soft-validation toggle
(a knob nobody flips is complexity, a knob flipped accidentally is a
data-loss trap); central validator in the controller (duplicates
per-module rules and fights the self-contained module architecture);
clamp-with-provenance (still persists values the participant never typed).

## Half 2 — Binary answers are offline-first (issue #34)

`file-upload` and `media-response` join the ADR 0023 D2 single write
path: capture writes the `Blob` to a dedicated Dexie table keyed by a
`clientId`; the response persists a structured reference
`{clientId, name, size, mimeType, status: 'pending'}` — never a `blob:`
URL; `FilloutUploadSync` uploads the binary and patches the response to
`{mediaUrl, status: 'uploaded'}` on server ack, idempotent via the
existing `client_id` machinery. The submit-before-upload race disappears
because nothing depends on the upload finishing.

ADR 0026's fail-closed rationale does not transfer here: media *stimuli*
fail closed because missing bytes change what the participant
experienced; a binary *answer* is produced by the participant, so
refusing it offline would only lose the data.

Consequences:

- **Size caps:** per-question maximum, designer-configurable, **no
  platform ceiling** (researchers are trusted to pick sane values);
  default 25 MB when unset. Oversize files and quota-exceeded Dexie
  writes fail loudly at capture as validation-style errors (the
  participant is present and can act); there is no metadata-only
  fallback.
- **Completion never waits on binary sync.** A session completed offline
  is complete; its binary answers carry `status: 'pending'` as honest
  provenance, and analytics/export surface "N binary answers not yet
  received" rather than pretending completeness. The answer was captured;
  delivery is infrastructure — it records and continues.
- Local blobs are **pinned against eviction until server ack, then
  deleted** (mirrors 0026's pinning consequence).
- The `base64`/`url`/`reference` storage modes are **deleted**; one
  contract for both question types. Existing `storageMode` values in
  definitions are ignored (the field only ever affected fillout-time
  behavior; no definition migration or version bump required).

Rejected: fail-closed offline for binary questions (rationale above);
base64 inline (~33% inflation, response-row bloat in IndexedDB and
postgres, hard size ceilings); completion-waits-for-binaries (offline
completions would sit 'active' indefinitely, reintroducing online
dependence through the back door).
