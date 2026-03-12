import type { Response } from '$lib/shared';

export type RuntimeEventMap = {
	'response:added': Response;
	'page:changed': { pageIndex: number; totalPages: number };
	'session:complete': void;
};

type EventCallback<T> = (data: T) => void;

/**
 * Lightweight typed event bus for FilloutRuntime, replacing the polling pattern.
 */
export class RuntimeEventBus {
	private listeners = new Map<string, Set<EventCallback<unknown>>>();

	on<K extends keyof RuntimeEventMap>(
		event: K,
		callback: EventCallback<RuntimeEventMap[K]>
	): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}

		this.listeners.get(event)!.add(callback as EventCallback<unknown>);

		return () => {
			this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
		};
	}

	emit<K extends keyof RuntimeEventMap>(event: K, data: RuntimeEventMap[K]): void {
		const callbacks = this.listeners.get(event);
		if (!callbacks) return;

		for (const callback of callbacks) {
			try {
				callback(data);
			} catch (error) {
				console.error(`[RuntimeEventBus] Error in listener for "${event}":`, error);
			}
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}
