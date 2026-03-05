import type { HelpEntry } from './types';

export const designerEntries: HelpEntry[] = [
	{
		key: 'designer.canvas.overview',
		title: 'The Canvas',
		description:
			'The Canvas is where you build your questionnaire. Drag and drop questions onto the canvas, rearrange them between pages, and see a live preview of your layout. Click any question to select it and edit its properties in the right panel.\n\n' +
			'**Tips:**\n' +
			'- Use **Ctrl+Z** / **Ctrl+Shift+Z** to undo and redo changes\n' +
			'- Hold **Alt** and press **Up/Down** to reorder questions\n' +
			'- Right-click a question for quick actions (duplicate, delete, move)',
		category: 'designer',
		tags: ['canvas', 'editor', 'drag', 'drop', 'layout', 'build'],
		related: ['designer.structure.overview', 'designer.addQuestion.overview', 'designer.properties.overview']
	},
	{
		key: 'designer.structure.overview',
		title: 'Structure Panel',
		description:
			'The Structure panel on the left shows your questionnaire hierarchy as a tree of pages, blocks, and questions. Use it to quickly navigate large questionnaires, reorganize content by dragging items, and see which items have validation rules or flow control logic.\n\n' +
			'**Pages** group questions that appear together on screen. **Blocks** are optional containers within pages that support randomization and experimental conditions.\n\n' +
			'Click any item in the tree to select it on the canvas.',
		category: 'designer',
		tags: ['structure', 'panel', 'tree', 'pages', 'blocks', 'hierarchy', 'navigation'],
		related: ['designer.canvas.overview', 'flowControl.overview', 'experimentalDesign.overview']
	},
	{
		key: 'designer.addQuestion.overview',
		title: 'Adding Questions',
		description:
			'Add questions from 17+ types using the Add Question button or the keyboard shortcut **Ctrl+Shift+A**. Question types include:\n\n' +
			'- **Text Input** and **Number Input** for open-ended responses\n' +
			'- **Single Choice** and **Multiple Choice** for selection questions\n' +
			'- **Scale** and **Rating** for Likert-type and star ratings\n' +
			'- **Matrix** for grid-style questions with rows and columns\n' +
			'- **Ranking** for ordering items by preference\n' +
			'- **Reaction Time** for millisecond-accurate response measurement\n' +
			'- **Statistical Feedback** for showing computed results to participants\n' +
			'- **Drawing**, **File Upload**, **Date/Time**, and more\n\n' +
			'Each type has specific configuration options accessible through the Properties panel.',
		category: 'designer',
		tags: ['add', 'question', 'types', 'create', 'new'],
		related: ['designer.canvas.overview', 'designer.properties.overview', 'questionTypes.textInput']
	},
	{
		key: 'designer.templates.overview',
		title: 'Templates',
		description:
			'Use templates to quickly scaffold common questionnaire patterns used in psychological and behavioral research. Templates include pre-configured questions, variables, scoring, and flow control logic.\n\n' +
			'Templates are available from your organization library or the public template gallery. You can also save your own questionnaires as templates to reuse across projects.',
		category: 'designer',
		tags: ['templates', 'scaffold', 'library', 'reuse', 'gallery'],
		related: ['designer.addQuestion.overview', 'designer.publish.overview']
	},
	{
		key: 'designer.properties.overview',
		title: 'Properties Panel',
		description:
			'The Properties panel on the right configures the currently selected item. Select a question, page, or block on the canvas to see its settings.\n\n' +
			'Common properties include:\n' +
			'- **Question text** and **description** (supports {{variable}} interpolation)\n' +
			'- **Required** toggle and **validation rules**\n' +
			'- **Response options** (for choice, scale, and matrix types)\n' +
			'- **Timing** constraints (min/max time, show timer)\n' +
			'- **Navigation** settings (auto-advance, show previous/next)\n' +
			'- **Scoring** and **variable assignment**\n' +
			'- **Conditional display** logic',
		category: 'designer',
		tags: ['properties', 'settings', 'configuration', 'options', 'panel'],
		related: ['designer.canvas.overview', 'variables.overview', 'flowControl.overview']
	},
	{
		key: 'designer.preview.overview',
		title: 'Preview Mode',
		description:
			'Preview shows how participants will see and interact with your questionnaire. Use **Ctrl+P** to toggle preview mode.\n\n' +
			'In preview mode:\n' +
			'- All questions render exactly as they will for participants\n' +
			'- Variables and formulas compute in real time\n' +
			'- Flow control logic (branching, skipping) is active\n' +
			'- Timing measurements work as in production\n' +
			'- Validation rules are enforced\n\n' +
			'Use preview to test the complete participant experience before publishing.',
		category: 'designer',
		tags: ['preview', 'test', 'participant', 'view', 'simulate'],
		related: ['designer.publish.overview', 'designer.canvas.overview']
	},
	{
		key: 'designer.publish.overview',
		title: 'Publishing',
		description:
			'Publishing makes your questionnaire accessible to participants via a unique shareable link and QR code.\n\n' +
			'**Version management:** Each publish creates a version (following semantic versioning). Changes to question structure bump the major version; text edits bump minor; cosmetic changes bump patch. Sessions record which version they were completed against.\n\n' +
			'**Distribution options:**\n' +
			'- Anonymous links for general distribution\n' +
			'- URL parameters for panel integrations (Prolific, MTurk, SONA)\n' +
			'- Completion redirect URLs\n' +
			'- QR codes for in-person studies\n\n' +
			'Use **Ctrl+Shift+Enter** to publish.',
		category: 'designer',
		tags: ['publish', 'share', 'link', 'version', 'distribute', 'QR'],
		related: ['designer.preview.overview', 'experimentalDesign.quotas']
	}
];
