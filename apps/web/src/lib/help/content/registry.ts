import type { HelpEntry, HelpCategory } from './types';
import { designerEntries } from './designer';
import { variableEntries } from './variables';
import { flowControlEntries } from './flowControl';
import { questionTypeEntries } from './questionTypes';
import { statisticalFeedbackEntries } from './statisticalFeedback';
import { experimentalDesignEntries } from './experimentalDesign';
import { formulaReferenceEntries } from './formulaReference';
import { keyboardShortcutEntries } from './keyboardShortcuts';

class HelpRegistry {
	private entries: Map<string, HelpEntry> = new Map();
	private byCategory: Map<HelpCategory, HelpEntry[]> = new Map();

	constructor() {
		const allEntries = [
			...designerEntries,
			...variableEntries,
			...flowControlEntries,
			...questionTypeEntries,
			...statisticalFeedbackEntries,
			...experimentalDesignEntries,
			...formulaReferenceEntries,
			...keyboardShortcutEntries,
		];

		for (const entry of allEntries) {
			this.entries.set(entry.key, entry);

			const catList = this.byCategory.get(entry.category) ?? [];
			catList.push(entry);
			this.byCategory.set(entry.category, catList);
		}
	}

	resolve(key: string): HelpEntry | undefined {
		return this.entries.get(key);
	}

	search(query: string): HelpEntry[] {
		if (!query.trim()) return [];
		const q = query.toLowerCase();
		const results: { entry: HelpEntry; score: number }[] = [];

		for (const entry of this.entries.values()) {
			let score = 0;
			const title = entry.title.toLowerCase();
			const desc = entry.description.toLowerCase();

			if (title === q) score += 100;
			else if (title.startsWith(q)) score += 80;
			else if (title.includes(q)) score += 60;

			if (desc.includes(q)) score += 20;

			if (entry.tags?.some((t) => t.toLowerCase().includes(q))) score += 40;

			if (score > 0) results.push({ entry, score });
		}

		return results.sort((a, b) => b.score - a.score).map((r) => r.entry);
	}

	getByCategory(category: HelpCategory): HelpEntry[] {
		return this.byCategory.get(category) ?? [];
	}

	getAllEntries(): HelpEntry[] {
		return [...this.entries.values()];
	}

	get size(): number {
		return this.entries.size;
	}
}

export const helpRegistry = new HelpRegistry();
