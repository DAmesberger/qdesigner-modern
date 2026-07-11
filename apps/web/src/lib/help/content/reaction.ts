import type { HelpEntry } from './types';

// Reaction-authoring help (ADRs 0024/0025). Keep every claim tied to what the
// designer actually ships: the Paradigm menu, TimingSpecField's jitter toggle,
// the ResponseSet editor, WebHID hardware, and PVT anticipation recording.
// Deliberately NOT claimed here (deferred per ADR 0024): hardware trigger OUTPUT
// (EEG/eye-tracker sync) and photodiode/loopback timing validation.
export const reactionEntries: HelpEntry[] = [
	{
		key: 'reaction.paradigms',
		title: 'Paradigms & Presets',
		description:
			'A **paradigm** is the scientific procedure a reaction task follows — it fixes the trial structure and what counts as a correct response. Pick one from the **Paradigm** menu at the top of a reaction question.\n\n' +
			'**Built-in paradigms:** Standard Reaction Time, N-Back, Stroop, Flanker (Eriksen), Implicit Association Test (IAT), Dot-Probe, Go / No-Go, SART, Simon, Posner Cueing, Visual Search, Sternberg Memory Search, PVT (Psychomotor Vigilance), Temporal-Order Judgment, and RSVP — plus a **Custom Trial Plan** for building trials block-by-block in the visual editor.\n\n' +
			'A **preset** is a saved, named set of parameter values for a paradigm (for example, an arrow-configured Flanker). A preset never changes the procedure — only its parameters. Use **Reset Selected Paradigm To Starter** to return a paradigm to sensible defaults.\n\n' +
			'Switching the paradigm reloads its starter parameters, so change it before you fine-tune stimuli and timing.',
		category: 'reaction',
		tags: ['paradigm', 'preset', 'reaction', 'stroop', 'flanker', 'iat', 'pvt', 'go-nogo', 'simon', 'procedure'],
		related: ['reaction.timingSpec', 'reaction.responseSet', 'questionTypes.reactionTime', 'reaction.pvt']
	},
	{
		key: 'reaction.timingSpec',
		title: 'Timing & Jitter (TimingSpec)',
		description:
			'Each authored phase duration — a foreperiod, an inter-stimulus interval, a stimulus display time — is a **TimingSpec**: either a single fixed value or a jittered range.\n\n' +
			'**Fixed** (Jitter off) is one number in milliseconds, identical for every trial.\n\n' +
			'**Jittered** (Jitter on) is a **min / max** pair. The value is drawn from a uniform distribution over that range, sampled **once per trial by the seeded generator when the block is materialized** — before the block runs. The reaction engine never samples anything at run time.\n\n' +
			'Because sampling happens at generation from a seed plus the session id, the same participant always gets the same trial sequence, and every sampled duration is recorded as trial data you can audit in the export. Only durations authored through a **Jitter** toggle can vary; a plain number field is always fixed.',
		category: 'reaction',
		tags: ['timing', 'jitter', 'timingspec', 'foreperiod', 'isi', 'iti', 'uniform', 'seed', 'reproducible'],
		related: ['reaction.paradigms', 'reaction.responseSet', 'variables.types.stimulusOnset']
	},
	{
		key: 'reaction.responseSet',
		title: 'Response Set Editor',
		description:
			'The **Responses** section defines what answers a trial accepts. By default responses come from the Valid Response Keys / device settings above; choose **Customize response set** for full control.\n\n' +
			'A **response set** is an ordered list of **response options**. Each option has:\n' +
			'- A **label** and a stable **id** — the id is the key your analysis and export data are recorded against, independent of which input produced the response.\n' +
			'- One or more **bindings** — a keyboard key (on press or release), a mouse click or touch tap (optionally limited to a canvas region), a gamepad button, or a **HID device** button.\n' +
			'- A **Correct response** flag — mark the option(s) scored as correct.\n\n' +
			'Multiple bindings and multiple devices can be armed on one option at once; the first matching event wins, and provenance records which source fired.\n\n' +
			'The editor is available for the **Standard** and **Custom Trial Plan** paradigms. Every other paradigm defines its responses procedurally (for example, Flanker uses its two left/right keys), so those show a read-only note pointing at the paradigm fields where the keys are set.',
		category: 'reaction',
		tags: ['response', 'responseset', 'binding', 'option', 'correct', 'keyboard', 'touch', 'mapping', 'id'],
		related: ['reaction.hardware', 'reaction.paradigms', 'questionTypes.reactionTime']
	},
	{
		key: 'reaction.hardware',
		title: 'Hardware Response Devices',
		description:
			'A response option can bind to an external **HID device** (a button box) via WebHID, so button presses land on the same high-resolution clock as keyboard events and reaction-time math is unchanged.\n\n' +
			'**What to know:**\n' +
			'- **Chromium only.** WebHID works in Chrome and Edge. Participants on Safari or Firefox fall back to keyboard, mouse, or touch — always keep a non-HID binding on the same option as a fallback.\n' +
			'- **Connect at start.** Participants pair the device on the study\'s welcome screen before any timed block runs.\n' +
			'- **Discovering buttons.** Where a box has no printed button numbers, find a button\'s index by pressing it and reading the captured binding.\n\n' +
			'The **gamepad** source is also available, but the browser polls it against the frame loop (~8–16 ms), so it is offered for convenience and is not advertised for reaction-time precision.\n\n' +
			'Hardware trigger **output** (EEG / eye-tracker sync) and photodiode timing validation are not available.',
		category: 'reaction',
		tags: ['hardware', 'webhid', 'hid', 'button box', 'device', 'chromium', 'gamepad', 'response device'],
		related: ['reaction.responseSet', 'dataQuality.validity']
	},
	{
		key: 'reaction.pvt',
		title: 'PVT & Anticipatory Responses',
		description:
			'The **PVT (Psychomotor Vigilance)** paradigm presents a stimulus after a variable foreperiod (authored as a jittered **Foreperiod / ISI** TimingSpec) and measures simple reaction time to it.\n\n' +
			'Responses that arrive **before** stimulus onset are recorded as **anticipatory** (false starts) rather than as valid reaction times. Each trial carries an explicit anticipatory flag and a count of discarded pre-onset responses, so premature presses are visible in the data and kept out of the valid-RT distribution instead of contaminating it.\n\n' +
			'This applies wherever a paradigm can register a response before the stimulus appears; PVT is the canonical case because its long, jittered foreperiods invite anticipation.',
		category: 'reaction',
		tags: ['pvt', 'vigilance', 'anticipatory', 'false start', 'foreperiod', 'premature', 'lapse'],
		related: ['reaction.timingSpec', 'dataQuality.validity', 'reaction.paradigms']
	}
];
