/**
 * YjsProvider — custom Yjs WebSocket provider that uses the existing ws.ts
 * WebSocket connection for binary sync frames, alongside the JSON control
 * messages already in use.
 *
 * Protocol:
 *   - Binary frames on the same socket carry Yjs sync / awareness data.
 *   - The provider subscribes to the designer channel for the questionnaire
 *     and handles sync/awareness via binary messages.
 *   - The connection lifecycle (connect, reconnect, auth) is managed by
 *     the underlying WebSocketClient.
 */

import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

/** Message types for binary frames. */
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export interface YjsProviderOptions {
  /** The questionnaire ID this doc belongs to. */
  questionnaireId: string;
  /** JWT access token for WebSocket auth. */
  token: string;
  /** WebSocket URL override (defaults to ws://<host>/api/ws). */
  wsUrl?: string;
}

export class YjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;

  private ws: WebSocket | null = null;
  private synced = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private connectionListeners = new Set<(connected: boolean) => void>();

  private readonly questionnaireId: string;
  private readonly token: string;
  private readonly wsUrl: string;

  constructor(doc: Y.Doc, options: YjsProviderOptions) {
    this.doc = doc;
    this.awareness = new awarenessProtocol.Awareness(doc);
    this.questionnaireId = options.questionnaireId;
    this.token = options.token;
    this.wsUrl =
      options.wsUrl ||
      (typeof window !== 'undefined'
        ? `ws://${window.location.host}/api/ws`
        : '');

    // When the local doc changes, send an update to the server.
    this.doc.on('update', this.onDocUpdate);

    // When local awareness changes, broadcast.
    this.awareness.on('update', this.onAwarenessUpdate);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get isSynced(): boolean {
    return this.synced;
  }

  connect(): void {
    this.destroyed = false;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close(1000, 'Provider disconnect');
      this.ws = null;
    }
    this.synced = false;
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'disconnect');
    this.notifyConnection(false);
  }

  destroy(): void {
    this.disconnect();
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    this.awareness.destroy();
    this.connectionListeners.clear();
  }

  onConnectionChange(cb: (connected: boolean) => void): () => void {
    this.connectionListeners.add(cb);
    cb(this.connected);
    return () => this.connectionListeners.delete(cb);
  }

  // -----------------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------------

  private doConnect(): void {
    if (this.destroyed) return;
    if (typeof WebSocket === 'undefined') return; // SSR guard

    const url = `${this.wsUrl}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.notifyConnection(true);

      // Subscribe to the designer channel.
      this.sendJSON({ type: 'subscribe', channel: `designer:${this.questionnaireId}` });

      // Initiate sync step 1.
      this.sendSyncStep1();
    };

    this.ws.onclose = (event) => {
      this.synced = false;
      this.notifyConnection(false);
      if (!this.destroyed && event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // Close will fire after this.
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleBinaryMessage(new Uint8Array(event.data));
      }
      // JSON messages are ignored here — presence etc. handled by ws.ts.
    };
  }

  // -----------------------------------------------------------------------
  // Binary protocol
  // -----------------------------------------------------------------------

  private sendSyncStep1(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.sendBinary(encoding.toUint8Array(encoder));
  }

  private handleBinaryMessage(data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const msgType = decoding.readVarUint(decoder);

    switch (msgType) {
      case MSG_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
        if (syncMessageType === 0) {
          // Received sync step 1 -> our step 2 was written to encoder.
        }
        if (encoding.length(encoder) > 1) {
          this.sendBinary(encoding.toUint8Array(encoder));
        }
        if (!this.synced) {
          this.synced = true;
        }
        break;
      }
      case MSG_AWARENESS: {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this,
        );
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Doc / Awareness change handlers
  // -----------------------------------------------------------------------

  private onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return; // Don't echo remote updates.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.sendBinary(encoding.toUint8Array(encoder));
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    _origin: unknown,
  ): void => {
    const changedClients = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
    );
    this.sendBinary(encoding.toUint8Array(encoder));
  };

  // -----------------------------------------------------------------------
  // Sending helpers
  // -----------------------------------------------------------------------

  private sendBinary(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private sendJSON(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // -----------------------------------------------------------------------
  // Reconnection
  // -----------------------------------------------------------------------

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private notifyConnection(connected: boolean): void {
    for (const listener of this.connectionListeners) {
      listener(connected);
    }
  }
}
