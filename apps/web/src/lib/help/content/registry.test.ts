import { describe, it, expect } from 'vitest';
import { helpRegistry } from './registry';

describe('HelpRegistry', () => {
	it('has entries loaded from all content files', () => {
		expect(helpRegistry.size).toBeGreaterThan(30);
	});

	it('resolves a known key', () => {
		const entry = helpRegistry.resolve('variables.overview');
		expect(entry).toBeDefined();
		expect(entry?.title).toBeTruthy();
		expect(entry?.description).toBeTruthy();
	});

	it('returns undefined for unknown key', () => {
		expect(helpRegistry.resolve('nonexistent.key')).toBeUndefined();
	});

	it('searches by title', () => {
		const results = helpRegistry.search('Variable');
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.title.toLowerCase()).toContain('variable');
	});

	it('searches by tags', () => {
		const results = helpRegistry.search('counterbalancing');
		expect(results.length).toBeGreaterThan(0);
	});

	it('returns empty for blank query', () => {
		expect(helpRegistry.search('')).toEqual([]);
		expect(helpRegistry.search('   ')).toEqual([]);
	});

	it('returns entries by category', () => {
		const flowEntries = helpRegistry.getByCategory('flowControl');
		expect(flowEntries.length).toBeGreaterThan(0);
		expect(flowEntries.every((e) => e.category === 'flowControl')).toBe(true);
	});

	it('returns all entries', () => {
		const all = helpRegistry.getAllEntries();
		expect(all.length).toBe(helpRegistry.size);
	});

	it('includes formula reference entries', () => {
		const formulaEntries = helpRegistry.getByCategory('formulas');
		expect(formulaEntries.length).toBeGreaterThan(20);
	});

	it('includes keyboard shortcut entries', () => {
		const shortcutEntries = helpRegistry.getByCategory('shortcuts');
		expect(shortcutEntries.length).toBeGreaterThan(5);
	});

	it('ranks exact title matches highest', () => {
		// Find a known entry title and search for it exactly
		const entry = helpRegistry.resolve('flowControl.overview');
		if (entry) {
			const results = helpRegistry.search(entry.title);
			expect(results[0]?.key).toBe(entry.key);
		}
	});

	// --- Entries shipped for the reaction / reporting / analytics / data-quality
	// / media arcs (ADRs 0024-0028). ---

	it('registers each new help category with at least one entry', () => {
		for (const category of [
			'reaction',
			'reporting',
			'analytics',
			'dataQuality',
			'media',
		] as const) {
			const entries = helpRegistry.getByCategory(category);
			expect(entries.length, `category ${category} has entries`).toBeGreaterThan(0);
			expect(entries.every((e) => e.category === category)).toBe(true);
		}
	});

	it('resolves the newly added entries', () => {
		const keys = [
			'reaction.paradigms',
			'reaction.timingSpec',
			'reaction.responseSet',
			'reaction.hardware',
			'reaction.pvt',
			'reporting.gridEditor',
			'reporting.reactionCohortBox',
			'analytics.sessionDetail',
			'analytics.advanced',
			'dataQuality.checks',
			'dataQuality.validity',
			'media.library',
			'media.manage',
			'media.dimensions',
			'variables.serverVariables',
			'designer.studySettings.progress',
			'designer.studySettings.consent',
		];
		for (const key of keys) {
			const entry = helpRegistry.resolve(key);
			expect(entry, `entry ${key} is registered`).toBeDefined();
			expect(entry?.title).toBeTruthy();
			expect(entry?.description).toBeTruthy();
		}
	});

	it('has no dangling related-links on the newly added entries', () => {
		const newKeys = new Set([
			'reaction.paradigms',
			'reaction.timingSpec',
			'reaction.responseSet',
			'reaction.hardware',
			'reaction.pvt',
			'reporting.gridEditor',
			'reporting.reactionCohortBox',
			'analytics.sessionDetail',
			'analytics.advanced',
			'dataQuality.checks',
			'dataQuality.validity',
			'media.library',
			'media.manage',
			'media.dimensions',
			'variables.serverVariables',
			'designer.studySettings.progress',
			'designer.studySettings.consent',
		]);
		for (const key of newKeys) {
			const entry = helpRegistry.resolve(key);
			for (const rel of entry?.related ?? []) {
				expect(helpRegistry.resolve(rel), `${key} → related ${rel} resolves`).toBeDefined();
			}
		}
	});
});
