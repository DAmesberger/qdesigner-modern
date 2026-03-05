import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { TourDefinition } from './types';

// Must mock before import
vi.mock('$app/environment', () => ({ browser: true }));

const localStorageMock = {
	getItem: vi.fn(() => null),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

const testTour: TourDefinition = {
	id: 'test-tour',
	name: 'Test Tour',
	description: 'A test tour',
	steps: [
		{
			id: 'step-1',
			target: '#step-1',
			title: 'Step One',
			description: 'First step',
			waitForElement: false,
		},
		{
			id: 'step-2',
			target: '#step-2',
			title: 'Step Two',
			description: 'Second step',
			waitForElement: false,
		},
		{
			id: 'step-3',
			target: '#step-3',
			title: 'Step Three',
			description: 'Third step',
			waitForElement: false,
		},
	],
};

describe('TourEngine', () => {
	let tourEngine: any;

	beforeEach(async () => {
		vi.resetModules();
		const mod = await import('./TourEngine.svelte');
		tourEngine = mod.tourEngine;
	});

	afterEach(() => {
		tourEngine?.end();
	});

	it('starts a tour', () => {
		tourEngine.start(testTour);
		expect(tourEngine.isActive).toBe(true);
		expect(tourEngine.currentTour).toStrictEqual(testTour);
		expect(tourEngine.currentStepIndex).toBe(0);
	});

	it('reports correct totalSteps', () => {
		tourEngine.start(testTour);
		expect(tourEngine.totalSteps).toBe(3);
	});

	it('reports first/last step correctly', () => {
		tourEngine.start(testTour);
		expect(tourEngine.isFirstStep).toBe(true);
		expect(tourEngine.isLastStep).toBe(false);
	});

	it('advances with next()', async () => {
		tourEngine.start(testTour);
		tourEngine.next();
		// Allow async resolveStep to complete
		await new Promise((r) => setTimeout(r, 50));
		expect(tourEngine.currentStepIndex).toBe(1);
		expect(tourEngine.isFirstStep).toBe(false);
	});

	it('goes back with previous()', async () => {
		tourEngine.start(testTour);
		tourEngine.next();
		await new Promise((r) => setTimeout(r, 50));
		tourEngine.previous();
		await new Promise((r) => setTimeout(r, 50));
		expect(tourEngine.currentStepIndex).toBe(0);
	});

	it('does not go before first step', () => {
		tourEngine.start(testTour);
		tourEngine.previous();
		expect(tourEngine.currentStepIndex).toBe(0);
	});

	it('ends tour and resets state', () => {
		tourEngine.start(testTour);
		tourEngine.end();
		expect(tourEngine.isActive).toBe(false);
		expect(tourEngine.currentTour).toBe(null);
		expect(tourEngine.currentStepIndex).toBe(0);
		expect(tourEngine.highlightRect).toBe(null);
		expect(tourEngine.targetElement).toBe(null);
	});

	it('goToStep jumps to arbitrary step', async () => {
		tourEngine.start(testTour);
		tourEngine.goToStep(2);
		await new Promise((r) => setTimeout(r, 50));
		expect(tourEngine.currentStepIndex).toBe(2);
		expect(tourEngine.isLastStep).toBe(true);
	});

	it('goToStep ignores out-of-range index', () => {
		tourEngine.start(testTour);
		tourEngine.goToStep(99);
		expect(tourEngine.currentStepIndex).toBe(0);
		tourEngine.goToStep(-1);
		expect(tourEngine.currentStepIndex).toBe(0);
	});

	it('returns null currentStep when no tour', () => {
		expect(tourEngine.currentStep).toBe(null);
	});

	it('returns 0 totalSteps when no tour', () => {
		expect(tourEngine.totalSteps).toBe(0);
	});

	it('next() ends tour on last step', async () => {
		tourEngine.start(testTour);
		tourEngine.goToStep(2);
		await new Promise((r) => setTimeout(r, 50));
		tourEngine.next();
		expect(tourEngine.isActive).toBe(false);
	});

	it('persists triggerKey on end', () => {
		const tourWithTrigger = { ...testTour, triggerKey: 'test-trigger' };
		tourEngine.start(tourWithTrigger);
		tourEngine.end();
		expect(localStorageMock.setItem).toHaveBeenCalledWith('test-trigger', 'true');
	});

	it('calls beforeShow hook', async () => {
		const beforeShow = vi.fn();
		const tourWithHook: TourDefinition = {
			...testTour,
			steps: [
				{ ...testTour.steps[0]!, beforeShow },
				testTour.steps[1]!,
				testTour.steps[2]!,
			],
		};
		tourEngine.start(tourWithHook);
		await new Promise((r) => setTimeout(r, 50));
		expect(beforeShow).toHaveBeenCalled();
	});
});
