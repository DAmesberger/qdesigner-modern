import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock $app/environment before importing
vi.mock('$app/environment', () => ({ browser: true }));

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock = {
	getItem: vi.fn((key: string) => storage.get(key) ?? null),
	setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
	removeItem: vi.fn((key: string) => storage.delete(key)),
	clear: vi.fn(() => storage.clear()),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('HelpStore', () => {
	beforeEach(() => {
		storage.clear();
		vi.clearAllMocks();
	});

	async function createStore() {
		// Re-import to get a fresh module with fresh state
		vi.resetModules();
		const mod = await import('./helpStore.svelte');
		return mod.helpStore;
	}

	it('marks features as seen', async () => {
		const store = await createStore();
		expect(store.hasSeenFeature('variables.overview')).toBe(false);
		store.markFeatureSeen('variables.overview');
		expect(store.hasSeenFeature('variables.overview')).toBe(true);
	});

	it('marks tours as completed', async () => {
		const store = await createStore();
		expect(store.hasTourCompleted('designer-intro')).toBe(false);
		store.markTourCompleted('designer-intro');
		expect(store.hasTourCompleted('designer-intro')).toBe(true);
	});

	it('persists to localStorage', async () => {
		const store = await createStore();
		store.markFeatureSeen('test-feature');
		store.markTourCompleted('test-tour');

		expect(localStorageMock.setItem).toHaveBeenCalled();
		const saved = JSON.parse(storage.get('qdesigner-help-state') || '{}');
		expect(saved.seenFeatures).toContain('test-feature');
		expect(saved.completedTours).toContain('test-tour');
	});

	it('loads persisted state on creation', async () => {
		storage.set(
			'qdesigner-help-state',
			JSON.stringify({
				seenFeatures: ['saved-feature'],
				completedTours: ['saved-tour'],
			})
		);

		const store = await createStore();
		expect(store.hasSeenFeature('saved-feature')).toBe(true);
		expect(store.hasTourCompleted('saved-tour')).toBe(true);
	});

	it('handles corrupted localStorage gracefully', async () => {
		storage.set('qdesigner-help-state', 'not-valid-json{{{');
		const store = await createStore();
		expect(store.hasSeenFeature('anything')).toBe(false);
	});

	it('resetAll clears all state', async () => {
		const store = await createStore();
		store.markFeatureSeen('f1');
		store.markTourCompleted('t1');
		store.resetAll();
		expect(store.hasSeenFeature('f1')).toBe(false);
		expect(store.hasTourCompleted('t1')).toBe(false);
	});

	it('does not duplicate entries on repeated calls', async () => {
		const store = await createStore();
		store.markFeatureSeen('same-feature');
		store.markFeatureSeen('same-feature');
		expect(store.seenFeatures.size).toBe(1);
	});
});
