export interface HelpEntry {
	key: string;
	title: string;
	description: string;
	category: HelpCategory;
	tags?: string[];
	related?: string[];
	learnMoreUrl?: string;
}

export type HelpCategory =
	| 'designer'
	| 'variables'
	| 'flowControl'
	| 'questionTypes'
	| 'statisticalFeedback'
	| 'experimentalDesign'
	| 'formulas'
	| 'shortcuts';
