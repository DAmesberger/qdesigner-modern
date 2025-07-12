// Response persistence types

export interface ResponseData {
	questionId: string;
	value: any;
	stimulusOnset?: number;
	responseTime?: number;
	reactionTime?: number;
	timeOnQuestion?: number;
	valid: boolean;
	metadata?: Record<string, any>;
}

export interface InteractionEvent {
	questionId: string | null;
	eventType: string;
	eventData: any;
	timestamp: number;
	relativeTime?: number;
	frameNumber?: number;
	frameTime?: number;
}