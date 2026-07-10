# 0024 — Response-set model with WebHID hardware, trigger output deferred

Status: accepted (2026-07-10, grilling session)

Reaction trials move from `{validKeys: string[], correctResponse: string}` to
a **ResponseSet model**: a trial arms named ResponseOptions (semantic ids the
export keys on), each carrying one or more Bindings (`keyboard:f`,
`hid:button-2`, `touch:region-left`, …) with an `on: 'down' | 'up'` edge.
Multiple ResponseSources may be armed concurrently — first event wins,
provenance records the winning source+binding. The legacy
`validKeys`/`correctResponse` shape compiles into a ResponseSet, so existing
questionnaires are unaffected.

External hardware lands as a new ResponseSource backed by **WebHID**
(inputreport events carry a DOMHighResTimeStamp on the same clock as
keyboard events, so RT math is unchanged). WebSerial response boxes are a
possible second adapter. This makes hardware support **Chromium-only**;
device qualification must disclose that Safari/Firefox participants get
keyboard/touch/pointer only.

Deliberately rejected/deferred:
- **Scripted response validators** (formula-evaluated correctness) — keeps
  the scripting sandbox out of the hot timing path.
- **Gamepad API as a precision source** — it already exists but is polled,
  quantizing responses to the frame loop (~8–16 ms); retained for
  convenience, never advertised for RT precision.
- **TTL/trigger OUTPUT (EEG/eye-tracker sync)** — WebSerial can write
  markers but the browser cannot bound when the voltage flips; deferred
  until the jitter can be measured and documented.
- **Photodiode/loopback timing-validation hardware** — fast follow, not
  v1; it upgrades the display-latency model (audit W-audit T1/L1) from
  modelled to measured.
