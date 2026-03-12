import type { HelpEntry } from './types';

export const questionTypeEntries: HelpEntry[] = [
	{
		key: 'questionTypes.textInput',
		title: 'Text Input',
		description:
			'Collects free-text responses from participants. Supports single-line and multi-line (textarea) modes.\n\n' +
			'**Configuration:**\n' +
			'- **Placeholder** text to guide participants\n' +
			'- **Min/max length** validation\n' +
			'- **Pattern** validation (regex) for structured input like emails or IDs\n' +
			'- **Multi-line** toggle for longer responses\n\n' +
			'**Best for:** Open-ended questions, demographic fields, qualitative feedback.',
		category: 'questionTypes',
		tags: ['text', 'input', 'free', 'open', 'textarea', 'string'],
		related: ['questionTypes.numberInput', 'questionTypes.textDisplay']
	},
	{
		key: 'questionTypes.numberInput',
		title: 'Number Input',
		description:
			'Collects numeric responses with optional range constraints. Displays a number input field with increment/decrement controls.\n\n' +
			'**Configuration:**\n' +
			'- **Min/max** value constraints\n' +
			'- **Step** size for increment buttons\n' +
			'- **Decimal places** allowed\n' +
			'- **Unit label** (e.g., "years", "kg")\n\n' +
			'**Best for:** Age, quantity, measurement, and rating questions where exact numeric values are needed.',
		category: 'questionTypes',
		tags: ['number', 'input', 'numeric', 'integer', 'decimal', 'range'],
		related: ['questionTypes.textInput', 'questionTypes.scale']
	},
	{
		key: 'questionTypes.textDisplay',
		title: 'Text Display',
		description:
			'Displays formatted text to participants without collecting a response. Supports rich text with markdown formatting and variable interpolation.\n\n' +
			'**Configuration:**\n' +
			'- **Rich text** content with bold, italic, lists, and headings\n' +
			'- **{{variable}}** interpolation for dynamic content\n' +
			'- **Media** embedding (images, videos)\n\n' +
			'**Best for:** Instructions, consent forms, informational pages, debriefing text, and personalized feedback.',
		category: 'questionTypes',
		tags: ['text', 'display', 'instruction', 'information', 'static', 'content'],
		related: ['questionTypes.instruction', 'variables.interpolation']
	},
	{
		key: 'questionTypes.instruction',
		title: 'Instruction',
		description:
			'Presents instructions or informational content to participants. Similar to Text Display but specifically designed for task instructions with optional acknowledgment.\n\n' +
			'**Configuration:**\n' +
			'- **Instruction text** with rich formatting\n' +
			'- **Acknowledgment** checkbox ("I have read and understood")\n' +
			'- **Minimum reading time** before allowing advancement\n\n' +
			'**Best for:** Task instructions, practice trial explanations, and consent acknowledgments.',
		category: 'questionTypes',
		tags: ['instruction', 'directions', 'task', 'acknowledge', 'consent'],
		related: ['questionTypes.textDisplay']
	},
	{
		key: 'questionTypes.singleChoice',
		title: 'Single Choice',
		description:
			'Presents a set of options where the participant selects exactly one. Renders as radio buttons or a dropdown.\n\n' +
			'**Configuration:**\n' +
			'- **Options** list with labels and optional values/scores\n' +
			'- **Display mode:** radio buttons, dropdown, or button group\n' +
			'- **Randomize** option order\n' +
			'- **"Other"** option with text input\n' +
			'- **Scoring** values per option for automatic scoring\n\n' +
			'**Best for:** Yes/No questions, demographic categories, forced-choice selections.',
		category: 'questionTypes',
		tags: ['single', 'choice', 'radio', 'dropdown', 'select', 'one'],
		related: ['questionTypes.multipleChoice', 'questionTypes.scale']
	},
	{
		key: 'questionTypes.multipleChoice',
		title: 'Multiple Choice',
		description:
			'Presents a set of options where the participant can select one or more. Renders as checkboxes.\n\n' +
			'**Configuration:**\n' +
			'- **Options** list with labels and optional values\n' +
			'- **Min/max selections** allowed\n' +
			'- **Randomize** option order\n' +
			'- **"Other"** option with text input\n' +
			'- **"Select all that apply"** helper text\n' +
			'- **Exclusive options** (selecting one deselects all others, e.g., "None of the above")\n\n' +
			'**Best for:** Symptom checklists, interest inventories, multi-select demographics.',
		category: 'questionTypes',
		tags: ['multiple', 'choice', 'checkbox', 'multi', 'select', 'many'],
		related: ['questionTypes.singleChoice', 'questionTypes.ranking']
	},
	{
		key: 'questionTypes.scale',
		title: 'Scale',
		description:
			'Presents a Likert-type scale for measuring agreement, frequency, intensity, or other continuous dimensions.\n\n' +
			'**Configuration:**\n' +
			'- **Number of points** (typically 5 or 7)\n' +
			'- **Anchor labels** (e.g., "Strongly Disagree" to "Strongly Agree")\n' +
			'- **Display mode:** buttons, slider, or visual analog\n' +
			'- **Numeric values** assigned to each point\n' +
			'- **Reverse scoring** option\n\n' +
			'**Best for:** Attitude measures, satisfaction ratings, symptom severity, any ordinal or interval measurement.',
		category: 'questionTypes',
		tags: ['scale', 'likert', 'slider', 'rating', 'agreement', 'range'],
		related: ['questionTypes.rating', 'questionTypes.matrix']
	},
	{
		key: 'questionTypes.rating',
		title: 'Rating',
		description:
			'A visual rating input using stars, hearts, or other icons. Simpler than a full scale -- ideal for quick evaluations.\n\n' +
			'**Configuration:**\n' +
			'- **Maximum rating** (e.g., 5 stars)\n' +
			'- **Icon style** (stars, hearts, thumbs)\n' +
			'- **Half-step** precision option\n' +
			'- **Labels** for each rating level\n\n' +
			'**Best for:** Quick evaluations, satisfaction ratings, preference rankings.',
		category: 'questionTypes',
		tags: ['rating', 'stars', 'score', 'evaluate', 'quick'],
		related: ['questionTypes.scale', 'questionTypes.singleChoice']
	},
	{
		key: 'questionTypes.matrix',
		title: 'Matrix',
		description:
			'Presents a grid of questions sharing the same response options. Rows represent individual items and columns represent response categories.\n\n' +
			'**Configuration:**\n' +
			'- **Rows** -- the items/statements to rate\n' +
			'- **Columns** -- the response options (shared across all rows)\n' +
			'- **Input type:** radio (single per row), checkbox (multiple per row), or text\n' +
			'- **Randomize** row order\n' +
			'- **Required** all rows or allow partial completion\n\n' +
			'**Best for:** Personality inventories, multi-item scales (BFI, PHQ-9, GAD-7), attitude batteries.',
		category: 'questionTypes',
		tags: ['matrix', 'grid', 'table', 'battery', 'rows', 'columns'],
		related: ['questionTypes.scale', 'questionTypes.ranking']
	},
	{
		key: 'questionTypes.ranking',
		title: 'Ranking',
		description:
			'Asks participants to order items by dragging them into their preferred sequence. The result is a ranked list.\n\n' +
			'**Configuration:**\n' +
			'- **Items** to rank (text labels)\n' +
			'- **Randomize** initial order\n' +
			'- **Rank all** or allow partial ranking (top N)\n\n' +
			'**Best for:** Preference orderings, value prioritization, forced-choice ranking tasks.',
		category: 'questionTypes',
		tags: ['ranking', 'order', 'drag', 'preference', 'sort', 'priority'],
		related: ['questionTypes.singleChoice', 'questionTypes.multipleChoice']
	},
	{
		key: 'questionTypes.dateTime',
		title: 'Date & Time',
		description:
			'Collects date, time, or date-time responses with a native picker interface.\n\n' +
			'**Configuration:**\n' +
			'- **Mode:** date only, time only, or date and time\n' +
			'- **Min/max** date constraints\n' +
			'- **Default value** (today, specific date, or empty)\n' +
			'- **Format** display preferences\n\n' +
			'**Best for:** Birth dates, appointment scheduling, event timing, temporal reference points.',
		category: 'questionTypes',
		tags: ['date', 'time', 'calendar', 'picker', 'schedule'],
		related: ['questionTypes.textInput', 'questionTypes.numberInput']
	},
	{
		key: 'questionTypes.fileUpload',
		title: 'File Upload',
		description:
			'Allows participants to upload files such as documents, images, or audio recordings.\n\n' +
			'**Configuration:**\n' +
			'- **Accepted file types** (e.g., .pdf, .jpg, .png)\n' +
			'- **Maximum file size**\n' +
			'- **Multiple files** toggle\n' +
			'- **Required** or optional\n\n' +
			'Files are stored securely in S3-compatible storage (MinIO) and associated with the session.\n\n' +
			'**Best for:** Document submission, photo uploads, audio diaries.',
		category: 'questionTypes',
		tags: ['file', 'upload', 'document', 'image', 'attachment'],
		related: ['questionTypes.drawing', 'questionTypes.mediaResponse']
	},
	{
		key: 'questionTypes.mediaResponse',
		title: 'Media Response',
		description:
			'Captures audio or video recordings from the participant using their device microphone or camera.\n\n' +
			'**Configuration:**\n' +
			'- **Mode:** audio only, video only, or both\n' +
			'- **Maximum duration**\n' +
			'- **Quality settings**\n\n' +
			'**Best for:** Voice responses, verbal fluency tasks, video interviews, pronunciation assessments.',
		category: 'questionTypes',
		tags: ['media', 'audio', 'video', 'recording', 'microphone', 'camera'],
		related: ['questionTypes.fileUpload', 'questionTypes.drawing']
	},
	{
		key: 'questionTypes.mediaDisplay',
		title: 'Media Display',
		description:
			'Displays images, audio, or video content to participants without collecting a response. Often paired with other question types.\n\n' +
			'**Configuration:**\n' +
			'- **Media source** (uploaded file or URL)\n' +
			'- **Display size** and aspect ratio\n' +
			'- **Autoplay** for audio/video\n' +
			'- **Controls** visibility\n\n' +
			'**Best for:** Stimulus presentation, instructional media, visual prompts.',
		category: 'questionTypes',
		tags: ['media', 'display', 'image', 'video', 'audio', 'stimulus'],
		related: ['questionTypes.textDisplay', 'questionTypes.webgl']
	},
	{
		key: 'questionTypes.drawing',
		title: 'Drawing',
		description:
			'Provides a canvas where participants can draw, annotate, or sketch freehand. The result is saved as an image.\n\n' +
			'**Configuration:**\n' +
			'- **Canvas size** and aspect ratio\n' +
			'- **Drawing tools** (pen, eraser, shapes)\n' +
			'- **Color palette**\n' +
			'- **Background image** (for annotation tasks)\n' +
			'- **Undo/redo** support\n\n' +
			'**Best for:** Clock drawing tests, visual memory tasks, annotation studies, creative expression.',
		category: 'questionTypes',
		tags: ['drawing', 'canvas', 'sketch', 'freehand', 'annotate', 'pen'],
		related: ['questionTypes.fileUpload', 'questionTypes.webgl']
	},
	{
		key: 'questionTypes.reactionTime',
		title: 'Reaction Time',
		description:
			'Measures response latency with microsecond precision. Designed for cognitive and behavioral experiments requiring accurate timing.\n\n' +
			'**Built-in presets:**\n' +
			'- **Stroop** -- Color-word interference task\n' +
			'- **IAT** -- Implicit Association Test\n' +
			'- **Flanker** -- Eriksen flanker task\n' +
			'- **Go/No-Go** -- Response inhibition\n' +
			'- **Simple RT** -- Basic reaction time\n\n' +
			'**Configuration:**\n' +
			'- **Stimulus** type and content\n' +
			'- **Response keys** and their mappings\n' +
			'- **Fixation** cross duration\n' +
			'- **Inter-trial interval**\n' +
			'- **Timeout** duration\n' +
			'- **Feedback** on correct/incorrect responses\n\n' +
			'Uses high-resolution timers and WebGL rendering for frame-accurate stimulus presentation.',
		category: 'questionTypes',
		tags: ['reaction', 'time', 'latency', 'stroop', 'IAT', 'flanker', 'experiment', 'timing'],
		related: ['questionTypes.webgl', 'variables.types.reactionTime', 'variables.types.stimulusOnset']
	},
	{
		key: 'questionTypes.webgl',
		title: 'WebGL Display',
		description:
			'Renders stimuli using WebGL 2.0 for high-performance, frame-accurate visual presentation at 120+ FPS.\n\n' +
			'**Capabilities:**\n' +
			'- Hardware-accelerated rendering\n' +
			'- Frame-accurate stimulus timing\n' +
			'- Complex visual stimuli (gratings, dot motion, visual search arrays)\n' +
			'- Smooth animations and transitions\n\n' +
			'**Best for:** Vision research, psychophysics experiments, dynamic stimulus presentation, and any task requiring precise visual timing.',
		category: 'questionTypes',
		tags: ['webgl', 'graphics', 'render', 'visual', 'stimulus', 'animation', 'fps'],
		related: ['questionTypes.reactionTime', 'variables.types.stimulusOnset']
	},
	{
		key: 'questionTypes.barChart',
		title: 'Bar Chart',
		description:
			'Displays a bar chart visualization to participants, useful for showing results or stimuli. Can be driven by variable values for dynamic updating.\n\n' +
			'**Configuration:**\n' +
			'- **Data source** (static values or variable-driven)\n' +
			'- **Labels** and colors\n' +
			'- **Axis** configuration\n\n' +
			'**Best for:** Showing comparative data, feedback visualizations, stimulus charts.',
		category: 'questionTypes',
		tags: ['bar', 'chart', 'graph', 'visualization', 'data'],
		related: ['questionTypes.statisticalFeedback', 'questionTypes.textDisplay']
	},
	{
		key: 'questionTypes.statisticalFeedback',
		title: 'Statistical Feedback',
		description:
			'Displays computed statistical results to participants in real time. Can show individual scores, comparisons to cohort norms, or aggregated group data.\n\n' +
			'**Source modes:**\n' +
			'- **Current session** -- Show the participant\'s own computed values\n' +
			'- **Cohort** -- Show aggregate statistics from all participants\n' +
			'- **Participant vs. Cohort** -- Compare individual to group\n' +
			'- **Participant vs. Participant** -- Compare two individual scores\n\n' +
			'See the **Statistical Feedback** section for detailed configuration.',
		category: 'questionTypes',
		tags: ['statistical', 'feedback', 'results', 'comparison', 'cohort', 'score'],
		related: [
			'statisticalFeedback.overview',
			'statisticalFeedback.sourceModes',
			'statisticalFeedback.metrics'
		]
	}
];
