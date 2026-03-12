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
});
