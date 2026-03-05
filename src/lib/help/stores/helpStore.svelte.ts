import { browser } from '$app/environment';

const STORAGE_KEY = 'qdesigner-help-state';

interface HelpState {
  seenFeatures: string[];
  completedTours: string[];
}

function loadState(): HelpState {
  if (!browser) return { seenFeatures: [], completedTours: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HelpState>;
      return {
        seenFeatures: Array.isArray(parsed.seenFeatures) ? parsed.seenFeatures : [],
        completedTours: Array.isArray(parsed.completedTours) ? parsed.completedTours : [],
      };
    }
  } catch {
    // Corrupted data, start fresh
  }
  return { seenFeatures: [], completedTours: [] };
}

function persist(state: HelpState): void {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable
  }
}

class HelpStore {
  #seenFeatures = $state<Set<string>>(new Set());
  #completedTours = $state<Set<string>>(new Set());

  constructor() {
    const saved = loadState();
    this.#seenFeatures = new Set(saved.seenFeatures);
    this.#completedTours = new Set(saved.completedTours);
  }

  get seenFeatures(): ReadonlySet<string> {
    return this.#seenFeatures;
  }

  get completedTours(): ReadonlySet<string> {
    return this.#completedTours;
  }

  markFeatureSeen(key: string): void {
    if (this.#seenFeatures.has(key)) return;
    this.#seenFeatures = new Set([...this.#seenFeatures, key]);
    this.#persist();
  }

  hasSeenFeature(key: string): boolean {
    return this.#seenFeatures.has(key);
  }

  markTourCompleted(tourId: string): void {
    if (this.#completedTours.has(tourId)) return;
    this.#completedTours = new Set([...this.#completedTours, tourId]);
    this.#persist();
  }

  hasTourCompleted(tourId: string): boolean {
    return this.#completedTours.has(tourId);
  }

  resetAll(): void {
    this.#seenFeatures = new Set();
    this.#completedTours = new Set();
    this.#persist();
  }

  #persist(): void {
    persist({
      seenFeatures: [...this.#seenFeatures],
      completedTours: [...this.#completedTours],
    });
  }
}

export const helpStore = new HelpStore();
