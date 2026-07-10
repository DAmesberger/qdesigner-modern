# 0026 — Reaction media is offline-complete at load and fail-closed at run

Status: accepted (2026-07-10, grilling session)

Media-bearing reaction studies get a two-layer guarantee. **Layer 1 (bytes,
per study, automatic):** loading the questionnaire caches *all* its assets
locally as part of load — including `mediaId`-referenced reaction assets
through the same-origin proxy — so any participant who has opened the study
is already offline-complete; the explicit "Prepare offline" affordance
remains for pre-provisioning in the field. **Layer 2 (decode, per block):**
before a block's first trial, every referenced asset is loaded from local
cache and fully decoded (image→texture, audio→WebAudio buffer, video→fully
fetched blob, first frame decoded) behind a visible preparing state. No
network I/O or decode ever happens inside a running block.

**Fail-closed:** if either layer cannot complete (missing asset, decode
failure, storage quota), the study/block refuses to start with an honest
retryable screen. It never runs a timed block with partial stimuli —
"timing cannot be altered by missing data." Consequence accepted: a
reaction study whose media exceeds the device's storage quota is unrunnable
on that device by design, and the media quota accounting must PIN
reaction-study assets against eviction rather than evict them.

Rejected: best-effort warm-up (the status quo — a cache miss silently
shifts stimulus onset, audit W-9) and streaming video mid-block (would
reintroduce network dependence and the Range-from-cache problem full
prefetch avoids).
