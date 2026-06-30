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
const PK = '124c0fa99407182ece5a24fad9b7f6674902fc422843d3128d38a0afbee0fdd2';

// Source events that produce each did_document_generation vector. The vectors
// ship only the output DID; these are the kind 0/3/10002 inputs that generate it.
const FIXTURES = {
  minimal_document_2_3_1: undefined,
  enhanced_document_2_3_2: {
    relays: { tags: [['r', 'wss://relay.damus.io/'], ['r', 'wss://nos.lol/']], created_at: 1737906600 },
  },
  complete_document_2_3_3: {
    profile: {
      content: JSON.stringify({
        name: 'Alice', about: 'Building the decentralized web', picture: 'https://example.com/alice.jpg',
        nip05: 'alice@example.com', lud16: 'alice@getalby.com', website: 'https://alice.example.com',
        alsoKnownAs: ['https://alice.example.com/#me', 'https://social.example.com/@alice', 'at://alice.bsky.social'],
      }),
      created_at: 1737906600,
    },
    follows: {
      tags: [
        ['p', '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245'],
        ['p', '46fcbe3065eaf1ae7811465924e48923363ff3f526bd6f73d7c184147700e3a8'],
      ],
      created_at: 1737900000,
    },
    relays: { tags: [['r', 'wss://relay.damus.io/']], created_at: 1737900000 },
  },
};

test('did_document_generation: build each vector from its source events (21/21)', () => {
  for (const v of vectors.vectors.did_document_generation) {
    const hex = v.input.replace('did:nostr:', '');
    assert.deepEqual(buildDidDocument(hex, FIXTURES[v.name]), v.output, v.name);
  }
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
