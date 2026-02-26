# Reaction Engine

`ReactionEngine` provides high-frequency stimulus presentation and response capture for timing-sensitive tasks such as reaction-time and n-back paradigms.

## Key APIs

- `runTrial(config, signal?)`: Executes a single trial with fixation, stimulus, response timeout, and frame logging.
- `schedulePhase(phase)`: Adds additional timed phases for the next trial execution.
- `markStimulusOnset()`: Forces an explicit onset mark on the next rendered frame.
- `setEventTarget(target)`: Binds keyboard events to a scoped target instead of global listeners.

## Trial Config

Use `ReactionTrialConfig` to define:

- Stimulus type (`shape`, `text`, `image`, `video`, `audio`, `custom`)
- Response mode (`keyboard`, `mouse`, `touch`)
- Response window (`responseTimeoutMs`)
- Display timing (`fixation`, `preStimulusDelayMs`, `stimulusDurationMs`, `interTrialIntervalMs`)
- Rendering targets (`targetFPS`, `vsync`)

## Runtime Integration

Question modules can provide `ModuleMetadata.questionRuntime` with contract `v1`.

- `reaction-time` module uses `ReactionTimeRuntime`
- `webgl` module uses `WebGLRuntime`

`QuestionnaireRuntime` resolves this runtime contract automatically and falls back to presenter/collector mode for legacy modules.

## n-back Preset

`createNBackTrials` builds configurable `n-back` trial sequences:

- deterministic sequence shape and target/non-target metadata
- configurable `n`, sequence length, target rate, and response keys
- trials ready to pass directly into `ReactionEngine.runTrial`
