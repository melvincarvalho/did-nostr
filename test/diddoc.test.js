// Document-generation tests: the minimal document is gated against the #101
// vector; enhanced/complete shape (created_at, modified, bounded follows) is
// covered with synthetic inputs since the vectors don't ship the source events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDidDocument, FOLLOWS_LIMIT } from '../src/diddoc.js';

const vectors = JSON.parse(
  readFileSync(new URL('./vectors/test-vectors-generated.json', import.meta.url)),
);
const minimalVec = vectors.vectors.did_document_generation.find((v) => v.name === 'minimal_document_2_3_1');
const PK = '124c0fa99407182ece5a24fad9b7f6674902fc422843d3128d38a0afbee0fdd2';

test('minimal document matches the #101 vector (relative #key1 refs)', () => {
  const hex = minimalVec.input.replace('did:nostr:', '');
  assert.deepEqual(buildDidDocument(hex), minimalVec.output);
});

test('rejects a non-hex identifier', () => {
  assert.equal(buildDidDocument('npub1xxx'), null);
  assert.equal(buildDidDocument(''), null);
});

test('enhanced: profile.created_at, follows, service, and modified', () => {
  const follow = 'a'.repeat(64);
  const d = buildDidDocument(PK, {
    profile: { content: JSON.stringify({ name: 'Alice', nip05: 'alice@example.com' }), created_at: 100 },
    follows: { tags: [['p', follow], ['e', 'x']], created_at: 250 },
    relays: { tags: [['r', 'wss://relay.example/']], created_at: 200 },
  });
  assert.equal(d.profile.created_at, 100);
  assert.equal(d.profile.timestamp, undefined);
  assert.deepEqual(d.follows, [`did:nostr:${follow}`]);
  assert.equal(d.service[0].type, 'Relay');
  assert.equal(d.modified, '1970-01-01T00:04:10Z'); // max(100,250,200) = 250
});

test('follows is bounded; full signed list stays in the kind-3 event', () => {
  const many = Array.from({ length: FOLLOWS_LIMIT + 100 }, (_, i) => i.toString(16).padStart(64, '0'));
  const d = buildDidDocument(PK, { follows: { follows: many } });
  assert.equal(d.follows.length, FOLLOWS_LIMIT);
});

test('alsoKnownAs-only kind-0: no profile object, but created_at still counts', () => {
  const d = buildDidDocument(PK, {
    profile: { content: JSON.stringify({ alsoKnownAs: ['https://x.example/#me'] }), created_at: 300 },
  });
  assert.equal(d.profile, undefined);
  assert.deepEqual(d.alsoKnownAs, ['https://x.example/#me']);
  assert.equal(d.modified, '1970-01-01T00:05:00Z');
});

test('out-of-range created_at does not throw and yields no modified', () => {
  const d = buildDidDocument(PK, { profile: { content: JSON.stringify({ name: 'X' }), created_at: 1e308 } });
  assert.equal(d.profile.name, 'X');
  assert.equal(d.profile.created_at, undefined);
  assert.equal(d.modified, undefined);
});
