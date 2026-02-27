// Response persistence types

export interface ResponseData {
	questionId: string;
	value: unknown;
	stimulusOnset?: number;
	responseTime?: number;
	reactionTime?: number;
	timeOnQuestion?: number;
	valid: boolean;
	metadata?: Record<string, unknown>;
}

export interface InteractionEvent {
	questionId: string | null;
	eventType: string;
	eventData: unknown;
	timestamp: number;
	relativeTime?: number;
	frameNumber?: number;
	frameTime?: number;
}