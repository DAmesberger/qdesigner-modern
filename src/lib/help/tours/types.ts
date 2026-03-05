import type { Placement } from '@floating-ui/dom';

export interface TourStep {
	id: string;
	target: string;
	title: string;
	description: string;
	placement?: Placement;
	interactive?: boolean;
	beforeShow?: () => void | Promise<void>;
	waitForElement?: boolean;
}

export interface TourDefinition {
	id: string;
	name: string;
	description: string;
	steps: TourStep[];
	autoTrigger?: boolean;
	triggerKey?: string;
}
