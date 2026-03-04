import { ws, type WsEvent } from './ws';

export interface PresenceUser {
	userId: string;
	displayName: string;
	color: string;
	lastSeen: number;
	/** ID of the currently selected item (question, page, block, variable). */
	selectedItemId?: string;
	/** Type of the currently selected item. */
	selectedItemType?: 'question' | 'page' | 'block' | 'variable' | null;
	/** ID of the page the user is viewing. */
	currentPageId?: string;
	/** Cursor position within a text editor, if applicable. */
	cursor?: { index: number; length: number };
}

const PRESENCE_COLORS = [
	'#3B82F6', // blue
	'#10B981', // green
	'#8B5CF6', // purple
	'#F59E0B', // yellow
	'#EF4444', // red
	'#06B6D4', // cyan
	'#EC4899', // pink
	'#84CC16', // lime
	'#F97316', // orange
	'#6366F1', // indigo
];

/** Deterministic color from userId hash */
function colorForUser(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
	}
	return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]!;
}

const HEARTBEAT_INTERVAL = 30_000; // 30s
const STALE_TIMEOUT = 60_000; // 60s

export class PresenceService {
	users = $state<Map<string, PresenceUser>>(new Map());
	private channel: string;
	private localUserId: string;
	private localDisplayName: string;
	private unsubscribe: (() => void) | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor(channel: string, userId: string, displayName: string) {
		this.channel = channel;
		this.localUserId = userId;
		this.localDisplayName = displayName;
	}

	start(): void {
		this.unsubscribe = ws.subscribe(this.channel, (msg: WsEvent) => {
			if (msg.event === 'presence') {
				this.handlePresence(msg.payload as { user_id: string; action: string });
			}
		});

		// Announce join
		ws.sendPresence(this.channel);

		// Heartbeat
		this.heartbeatTimer = setInterval(() => {
			ws.sendPresence(this.channel);
		}, HEARTBEAT_INTERVAL);

		// Stale cleanup
		this.cleanupTimer = setInterval(() => {
			const now = Date.now();
			const next = new Map(this.users);
			let changed = false;
			for (const [id, user] of next) {
				if (now - user.lastSeen > STALE_TIMEOUT) {
					next.delete(id);
					changed = true;
				}
			}
			if (changed) {
				this.users = next;
			}
		}, STALE_TIMEOUT / 2);
	}

	stop(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
		this.users = new Map();
	}

	/** Other users (excludes local user). */
	get otherUsers(): PresenceUser[] {
		return [...this.users.values()].filter((u) => u.userId !== this.localUserId);
	}

	/** Update local awareness state (selection, page, cursor) and broadcast. */
	updateLocalState(state: {
		selectedItemId?: string;
		selectedItemType?: PresenceUser['selectedItemType'];
		currentPageId?: string;
		cursor?: PresenceUser['cursor'];
	}): void {
		this.localState = { ...this.localState, ...state };
	}

	private localState: Partial<PresenceUser> = {};

	private handlePresence(payload: {
		user_id: string;
		action: string;
		selectedItemId?: string;
		selectedItemType?: PresenceUser['selectedItemType'];
		currentPageId?: string;
		cursor?: PresenceUser['cursor'];
	}): void {
		const userId = payload.user_id;
		if (payload.action === 'leave') {
			if (this.users.has(userId)) {
				const next = new Map(this.users);
				next.delete(userId);
				this.users = next;
			}
			return;
		}

		// join or heartbeat
		const existing = this.users.get(userId);
		const next = new Map(this.users);
		next.set(userId, {
			userId,
			displayName: existing?.displayName || userId.slice(0, 8),
			color: colorForUser(userId),
			lastSeen: Date.now(),
			selectedItemId: payload.selectedItemId ?? existing?.selectedItemId,
			selectedItemType: payload.selectedItemType ?? existing?.selectedItemType,
			currentPageId: payload.currentPageId ?? existing?.currentPageId,
			cursor: payload.cursor ?? existing?.cursor,
		});
		this.users = next;
	}
}
