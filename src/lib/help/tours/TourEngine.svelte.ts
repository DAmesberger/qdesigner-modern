import type { TourDefinition, TourStep } from './types';

class TourEngine {
	currentTour = $state<TourDefinition | null>(null);
	currentStepIndex = $state(0);
	isActive = $state(false);
	highlightRect = $state<DOMRect | null>(null);
	targetElement = $state<HTMLElement | null>(null);

	private observer: MutationObserver | null = null;
	private resizeObserver: ResizeObserver | null = null;

	get currentStep(): TourStep | null {
		if (!this.currentTour || this.currentStepIndex >= this.currentTour.steps.length) return null;
		return this.currentTour.steps[this.currentStepIndex] ?? null;
	}

	get totalSteps(): number {
		return this.currentTour?.steps.length ?? 0;
	}

	get isFirstStep(): boolean {
		return this.currentStepIndex === 0;
	}

	get isLastStep(): boolean {
		return this.currentStepIndex === this.totalSteps - 1;
	}

	start(tour: TourDefinition): void {
		this.currentTour = tour;
		this.currentStepIndex = 0;
		this.isActive = true;
		this.resolveStep(0);
	}

	next(): void {
		if (!this.currentTour) return;
		if (this.currentStepIndex < this.currentTour.steps.length - 1) {
			this.resolveStep(this.currentStepIndex + 1);
		} else {
			this.end();
		}
	}

	previous(): void {
		if (this.currentStepIndex > 0) {
			this.resolveStep(this.currentStepIndex - 1);
		}
	}

	end(): void {
		if (this.currentTour?.triggerKey) {
			try {
				localStorage.setItem(this.currentTour.triggerKey, 'true');
			} catch {
				// localStorage may be unavailable
			}
		}
		this.cleanup();
		this.isActive = false;
		this.currentTour = null;
		this.currentStepIndex = 0;
		this.highlightRect = null;
		this.targetElement = null;
	}

	goToStep(index: number): void {
		if (!this.currentTour || index < 0 || index >= this.currentTour.steps.length) return;
		this.resolveStep(index);
	}

	private async resolveStep(index: number): Promise<void> {
		if (!this.currentTour) return;

		const step = this.currentTour.steps[index];
		if (!step) return;

		this.cleanup();
		this.currentStepIndex = index;

		// Run beforeShow hook
		if (step.beforeShow) {
			await step.beforeShow();
		}

		const waitForElement = step.waitForElement !== false;
		const element = await this.findElement(step.target, waitForElement);

		if (!element) {
			// Element not found, skip to next available step or end
			this.targetElement = null;
			this.highlightRect = null;
			return;
		}

		this.targetElement = element;

		// Scroll into view
		element.scrollIntoView({ block: 'center', behavior: 'smooth' });

		// Wait for scroll to settle
		await new Promise((r) => setTimeout(r, 300));

		this.updateRect();

		// Track element position/size changes
		this.resizeObserver = new ResizeObserver(() => this.updateRect());
		this.resizeObserver.observe(element);
	}

	private updateRect(): void {
		if (this.targetElement) {
			this.highlightRect = this.targetElement.getBoundingClientRect();
		}
	}

	private findElement(selector: string, wait: boolean): Promise<HTMLElement | null> {
		const existing = document.querySelector<HTMLElement>(selector);
		if (existing) return Promise.resolve(existing);

		if (!wait) return Promise.resolve(null);

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				this.observer?.disconnect();
				resolve(null);
			}, 5000);

			this.observer = new MutationObserver(() => {
				const el = document.querySelector<HTMLElement>(selector);
				if (el) {
					clearTimeout(timeout);
					this.observer?.disconnect();
					resolve(el);
				}
			});

			this.observer.observe(document.body, {
				childList: true,
				subtree: true,
			});
		});
	}

	private cleanup(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
	}
}

export const tourEngine = new TourEngine();
