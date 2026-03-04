export interface WsEvent {
	event: string;
	payload: unknown;
}

type MessageHandler = (data: WsEvent) => void;
type ConnectionHandler = (connected: boolean) => void;

class WebSocketClient {
	private ws: WebSocket | null = null;
	private subscriptions = new Map<string, Set<MessageHandler>>();
	private connectionListeners = new Set<ConnectionHandler>();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 10;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private token: string | null = null;

	get connected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	connect(token: string): void {
		this.token = token;
		this.reconnectAttempts = 0;
		this.doConnect();
	}

	disconnect(): void {
		this.token = null;
		this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close(1000, 'Client disconnect');
			this.ws = null;
		}
	}

	subscribe(channel: string, handler: MessageHandler): () => void {
		if (!this.subscriptions.has(channel)) {
			this.subscriptions.set(channel, new Set());
			// Send subscribe message if connected
			this.sendMessage({ type: 'subscribe', channel });
		}
		this.subscriptions.get(channel)!.add(handler);

		return () => {
			const handlers = this.subscriptions.get(channel);
			if (handlers) {
				handlers.delete(handler);
				if (handlers.size === 0) {
					this.subscriptions.delete(channel);
					this.sendMessage({ type: 'unsubscribe', channel });
				}
			}
		};
	}

	/** Send a presence announcement to a channel. */
	sendPresence(channel: string): void {
		this.sendMessage({ type: 'presence', channel });
	}

	onConnectionChange(callback: ConnectionHandler): () => void {
		this.connectionListeners.add(callback);
		// Immediately notify current state
		callback(this.ws?.readyState === WebSocket.OPEN);
		return () => this.connectionListeners.delete(callback);
	}

	private doConnect(): void {
		if (!this.token) return;
		if (typeof window === 'undefined') return; // SSR guard

		const wsUrl =
			import.meta.env.VITE_WS_URL || `ws://${window.location.host}/api/ws`;
		this.ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(this.token)}`);

		this.ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.notifyConnection(true);
			// Re-subscribe to all channels
			for (const channel of this.subscriptions.keys()) {
				this.sendMessage({ type: 'subscribe', channel });
			}
		};

		this.ws.onclose = (event) => {
			this.notifyConnection(false);
			if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
				this.scheduleReconnect();
			}
		};

		this.ws.onerror = () => {
			// Error handler - close will fire after this
		};

		this.ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				if (msg.channel && this.subscriptions.has(msg.channel)) {
					for (const handler of this.subscriptions.get(msg.channel)!) {
						handler({ event: msg.event, payload: msg.payload });
					}
				}
			} catch {
				// Ignore non-JSON messages
			}
		};
	}

	private sendMessage(msg: unknown): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	private scheduleReconnect(): void {
		const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
		this.reconnectAttempts++;
		this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
	}

	private notifyConnection(connected: boolean): void {
		for (const listener of this.connectionListeners) {
			listener(connected);
		}
	}
}

export const ws = new WebSocketClient();
