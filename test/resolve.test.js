// Resolution behaviour + robustness (no real network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../src/index.js';

const PK = '124c0fa99407182ece5a24fad9b7f6674902fc422843d3128d38a0afbee0fdd2';

test('offline mode returns the minimal document; bad DID is an error result', async () => {
  const good = await resolve(`did:nostr:${PK}`, { mode: 'offline' });
  assert.equal(good.didDocument.id, `did:nostr:${PK}`);
  assert.equal(good.didResolutionMetadata.mode, 'offline');

  const bad = await resolve('did:nostr:nothex', { mode: 'offline' });
  assert.equal(bad.didDocument, null);
  assert.equal(bad.didResolutionMetadata.error, 'invalidDid');
});

test('http mode skips invalid gateway entries without throwing', async () => {
  const r = await resolve(`did:nostr:${PK}`, { mode: 'http', gateways: [undefined, null, 123, ''] });
  assert.equal(r.didDocument, null);
  assert.equal(r.didResolutionMetadata.error, 'notFound');
});

test('relay mode returns an error result (not a throw) when WebSocket is unavailable', async () => {
  const saved = globalThis.WebSocket;
  globalThis.WebSocket = undefined;
  try {
    const r = await resolve(`did:nostr:${PK}`, { mode: 'relay', relays: ['wss://example/'] });
    assert.equal(r.didDocument, null);
    assert.equal(r.didResolutionMetadata.error, 'notFound');
  } finally {
    if (saved) globalThis.WebSocket = saved; else delete globalThis.WebSocket;
  }
});
