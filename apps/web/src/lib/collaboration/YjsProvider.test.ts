import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { YjsProvider } from './YjsProvider';

afterEach(() => vi.unstubAllGlobals());

describe('collaboration transport', () => {
  it.each([
    ['http:', 'localhost:4173', undefined, 'ws://localhost:4173/api/ws'],
    ['https:', 'research.example', undefined, 'wss://research.example/api/ws'],
    ['https:', 'research.example', 'wss://collab.example/api/ws', 'wss://collab.example/api/ws'],
  ])('connects from %s using a matching transport', (protocol, host, wsUrl, expected) => {
    vi.stubGlobal('window', { location: { protocol, host } });
    const connect = vi.fn();
    vi.stubGlobal('WebSocket', class {
      static OPEN = 1;
      constructor(url: string, protocols: string[]) { connect(url, protocols); }
      close() {}
    });
    const doc = new Y.Doc();
    const provider = new YjsProvider(doc, { questionnaireId: 'transport-test', wsUrl });
    try {
      provider.connect();
      expect(connect).toHaveBeenCalledWith(expected, ['qde-auth']);
    } finally {
      provider.destroy();
      doc.destroy();
    }
  });
});
