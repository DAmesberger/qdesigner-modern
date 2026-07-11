import type { HelpEntry } from './types';

export const mediaEntries: HelpEntry[] = [
	{
		key: 'media.library',
		title: 'Media Library',
		description:
			'The media library holds the images, audio, and video your study presents. Upload assets once and reference them from stimulus, media-display, and media-response questions across the questionnaire.\n\n' +
			'Assets are stored per organization. Reaction studies reference library media by id and resolve it through a same-origin proxy, which is what makes offline caching and frame-accurate texture upload work.\n\n' +
			'Open the library from a media picker (for example, a reaction stimulus\'s **Select from Media Library**) or from the designer\'s media tools.',
		category: 'media',
		tags: ['media', 'library', 'assets', 'upload', 'images', 'audio', 'video'],
		related: ['media.manage', 'media.dimensions', 'questionTypes.mediaDisplay']
	},
	{
		key: 'media.manage',
		title: 'Manage Mode & Deleting Assets',
		description:
			'The library opens in **Select** mode for picking an asset. The **Manage library** toggle in the header flips it into housekeeping mode, where each asset exposes a **Delete** button.\n\n' +
			'**Delete is a hard delete.** There is no in-use guard: deleting an asset removes it immediately regardless of how many questionnaires reference it, and any questionnaire that pointed at it loses the asset. The confirmation warns you, and the action cannot be undone.\n\n' +
			'Before deleting, make sure the asset is not still referenced by a live study — check your reaction stimuli and media-display questions first. Manage mode is housekeeping only; it does not select an asset for a question.',
		category: 'media',
		tags: ['manage', 'delete', 'hard delete', 'remove', 'references', 'housekeeping'],
		related: ['media.library', 'media.dimensions']
	},
	{
		key: 'media.dimensions',
		title: 'Image Dimensions',
		description:
			'When the server extracts them at upload time, an image asset shows its pixel size as **width × height** (for example, 1920 × 1080) in the library and on stimulus preview cards.\n\n' +
			'Non-image assets have no dimensions, and images uploaded before dimension extraction was added carry none either — a blank size field there means "not recorded," not "zero." Dimensions are informational; they help you match a stimulus to the presentation canvas.',
		category: 'media',
		tags: ['dimensions', 'width', 'height', 'resolution', 'image', 'pixels', 'size'],
		related: ['media.library', 'media.manage']
	}
];
