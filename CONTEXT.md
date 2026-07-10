# QDesigner Modern

A questionnaire platform for psychological and behavioral research, whose
distinguishing capability is browser-based reaction-time measurement with
frame-accurate stimulus onset and sub-millisecond *relative* precision.

## Language

### Reaction measurement

**Paradigm**:
A scientific procedure template for a reaction task (PVT, Simon, SART, …)
that defines the trial structure and what counts as a correct response.
_Avoid_: task type, reaction type

**Preset**:
A saved, named parameterization of a Paradigm (e.g. an arrow-flanker
configuration of the flanker paradigm). A preset never defines new
procedure — only parameter values.
_Avoid_: template (in the reaction context)

**Trial**:
One fully materialized stimulus→response cycle. All of a trial's values —
timings, stimulus, correct options — are concrete numbers fixed at
generation time; the engine never samples anything at runtime.

**TimingSpec**:
An authored phase duration that is either a fixed value or a distribution
(uniform min/max today), sampled per-trial by the seeded generator when
trials are materialized.
_Avoid_: jitter setting, delay config

**Server Variable**:
A variable declared on the questionnaire whose value is an aggregate the
server computes over collected data (question values or trials), pre-synced
to the device so feedback resolves offline. Its declaration carries an
explicit `minN` disclosure floor and an authored below-floor behavior.
_Avoid_: cohort stat, dataset stat

**ValidityPolicy**:
A per-study setting governing the response to degraded timing conditions:
`record` (default — stamp provenance, warn the researcher, never stop the
participant) or `enforce` (refuse/abort timing-critical blocks under
degraded conditions).

**Offline-complete**:
The state in which every asset a study can ever present exists in local
storage. Media-bearing reaction studies must be offline-complete before any
timed block may start; reaching this state is automatic at load, never a
participant choice.

**ResponseSet**:
The named, ordered list of ResponseOptions a trial arms; a trial accepts
exactly one winning response from its set.
_Avoid_: keybindings, key map

**ResponseOption**:
One semantic response alternative in a ResponseSet, identified by a stable id
(e.g. `left`, `target-present`) that analysis and export key on, independent
of which physical input produced it.
_Avoid_: answer, key

**Binding**:
The attachment of one physical input (a keyboard key, a HID button, a touch
region) to a ResponseOption, including whether it fires on press or release.
_Avoid_: shortcut, mapping

**ResponseSource**:
A device family that can deliver participant responses — keyboard, pointer,
touch, gamepad, or a WebHID device. Multiple sources may be armed
concurrently for one trial; the first event wins and provenance records
which source fired.
_Avoid_: input mode, response mode
