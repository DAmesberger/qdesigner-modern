import type { HelpEntry } from './types';

export interface ShortcutDefinition {
	key: string;
	label: string;
	keys: string[];
	macKeys?: string[];
	section: 'general' | 'editing' | 'navigation' | 'actions';
}

export const shortcuts: ShortcutDefinition[] = [
	// General
	{ key: 'shortcuts.save', label: 'Save', keys: ['Ctrl', 'S'], macKeys: ['Cmd', 'S'], section: 'general' },
	{ key: 'shortcuts.preview', label: 'Toggle Preview', keys: ['Ctrl', 'P'], macKeys: ['Cmd', 'P'], section: 'general' },
	{ key: 'shortcuts.commandPalette', label: 'Command Palette', keys: ['Ctrl', 'K'], macKeys: ['Cmd', 'K'], section: 'general' },
	{ key: 'shortcuts.showShortcuts', label: 'Keyboard Shortcuts', keys: ['?'], section: 'general' },

	// Editing
	{ key: 'shortcuts.undo', label: 'Undo', keys: ['Ctrl', 'Z'], macKeys: ['Cmd', 'Z'], section: 'editing' },
	{ key: 'shortcuts.redo', label: 'Redo', keys: ['Ctrl', 'Shift', 'Z'], macKeys: ['Cmd', 'Shift', 'Z'], section: 'editing' },
	{ key: 'shortcuts.duplicate', label: 'Duplicate Selected', keys: ['Ctrl', 'D'], macKeys: ['Cmd', 'D'], section: 'editing' },
	{ key: 'shortcuts.delete', label: 'Delete Selected', keys: ['Delete'], section: 'editing' },
	{ key: 'shortcuts.addQuestion', label: 'Add Question', keys: ['Ctrl', 'Shift', 'A'], macKeys: ['Cmd', 'Shift', 'A'], section: 'editing' },
	{ key: 'shortcuts.copy', label: 'Copy Question', keys: ['Ctrl', 'C'], macKeys: ['Cmd', 'C'], section: 'editing' },
	{ key: 'shortcuts.paste', label: 'Paste Question', keys: ['Ctrl', 'V'], macKeys: ['Cmd', 'V'], section: 'editing' },

	// Navigation
	{ key: 'shortcuts.moveUp', label: 'Move Question Up', keys: ['Alt', 'Up'], macKeys: ['Option', 'Up'], section: 'navigation' },
	{ key: 'shortcuts.moveDown', label: 'Move Question Down', keys: ['Alt', 'Down'], macKeys: ['Option', 'Down'], section: 'navigation' },
	{ key: 'shortcuts.close', label: 'Close / Deselect', keys: ['Escape'], section: 'navigation' },

	// Actions
	{ key: 'shortcuts.publish', label: 'Publish', keys: ['Ctrl', 'Shift', 'Enter'], macKeys: ['Cmd', 'Shift', 'Enter'], section: 'actions' },
];

export const keyboardShortcutEntries: HelpEntry[] = [
	{
		key: 'shortcuts.undoRedo',
		title: 'Undo / Redo',
		description:
			'**Ctrl+Z** -- Undo the last action\n' +
			'**Ctrl+Shift+Z** -- Redo the last undone action\n\n' +
			'Undo/redo works for all designer changes including adding, editing, deleting, and moving questions.',
		category: 'shortcuts',
		tags: ['undo', 'redo', 'ctrl+z', 'history']
	},
	{
		key: 'shortcuts.save',
		title: 'Save',
		description:
			'**Ctrl+S** -- Save the current questionnaire\n\n' +
			'Changes are also auto-saved periodically. The save indicator in the toolbar shows the current save status.',
		category: 'shortcuts',
		tags: ['save', 'ctrl+s', 'persist']
	},
	{
		key: 'shortcuts.preview',
		title: 'Preview',
		description:
			'**Ctrl+P** -- Toggle preview mode\n\n' +
			'Preview shows how participants will experience the questionnaire, including variables, flow control, and timing.',
		category: 'shortcuts',
		tags: ['preview', 'ctrl+p', 'test', 'view'],
		related: ['designer.preview.overview']
	},
	{
		key: 'shortcuts.commandPalette',
		title: 'Command Palette',
		description:
			'**Ctrl+K** -- Open the command palette\n\n' +
			'Quickly search and execute any action: add questions, navigate to pages, toggle settings, run commands, and access help.',
		category: 'shortcuts',
		tags: ['command', 'palette', 'ctrl+k', 'search', 'quick']
	},
	{
		key: 'shortcuts.duplicate',
		title: 'Duplicate',
		description:
			'**Ctrl+D** -- Duplicate the selected question or block\n\n' +
			'Creates an identical copy directly below the selected item with a unique ID.',
		category: 'shortcuts',
		tags: ['duplicate', 'ctrl+d', 'copy', 'clone']
	},
	{
		key: 'shortcuts.addQuestion',
		title: 'Add Question',
		description:
			'**Ctrl+Shift+A** -- Open the Add Question dialog\n\n' +
			'Choose from 17+ question types to add to the current page.',
		category: 'shortcuts',
		tags: ['add', 'question', 'ctrl+shift+a', 'new', 'create'],
		related: ['designer.addQuestion.overview']
	},
	{
		key: 'shortcuts.publish',
		title: 'Publish',
		description:
			'**Ctrl+Shift+Enter** -- Publish the questionnaire\n\n' +
			'Makes the questionnaire accessible to participants via a shareable link. Creates a new version.',
		category: 'shortcuts',
		tags: ['publish', 'ctrl+shift+enter', 'release', 'deploy'],
		related: ['designer.publish.overview']
	},
	{
		key: 'shortcuts.delete',
		title: 'Delete Selected',
		description:
			'**Delete** or **Backspace** -- Delete the selected question, block, or page\n\n' +
			'A confirmation dialog appears for destructive deletions. Use Ctrl+Z to undo if needed.',
		category: 'shortcuts',
		tags: ['delete', 'backspace', 'remove']
	},
	{
		key: 'shortcuts.moveQuestion',
		title: 'Move Question',
		description:
			'**Alt+Up** -- Move the selected question up\n' +
			'**Alt+Down** -- Move the selected question down\n\n' +
			'Reorders questions within the current page. To move between pages, use drag and drop in the Structure panel.',
		category: 'shortcuts',
		tags: ['move', 'reorder', 'alt+up', 'alt+down', 'position']
	},
	{
		key: 'shortcuts.copyPaste',
		title: 'Copy / Paste Questions',
		description:
			'**Ctrl+C** -- Copy the selected question(s)\n' +
			'**Ctrl+V** -- Paste copied question(s)\n\n' +
			'Copies include all configuration, validation rules, and scoring settings. Pasted items receive new unique IDs.',
		category: 'shortcuts',
		tags: ['copy', 'paste', 'ctrl+c', 'ctrl+v', 'clipboard']
	},
	{
		key: 'shortcuts.escape',
		title: 'Close / Deselect',
		description:
			'**Escape** -- Close the current dialog, panel, or deselect the current item\n\n' +
			'If a dialog is open, Escape closes it. Otherwise, it deselects the currently selected question.',
		category: 'shortcuts',
		tags: ['escape', 'close', 'deselect', 'dismiss', 'cancel']
	},
	{
		key: 'shortcuts.showShortcuts',
		title: 'Keyboard Shortcuts Dialog',
		description:
			'**?** -- Open the keyboard shortcuts dialog\n\n' +
			'Shows all available keyboard shortcuts for the current context.',
		category: 'shortcuts',
		tags: ['help', 'shortcuts', 'dialog', 'reference']
	}
];
