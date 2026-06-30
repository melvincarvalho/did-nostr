// Conformance gate against the did:nostr 0.0.12 test vectors (nostrcg/did-nostr
// #101). Covers the fully-deterministic layers: key transformation, decoding,
// and the error taxonomy. Document-generation vectors are not yet gated here
// pending the authentication/assertionMethod reference-format question (the
// vectors use absolute DID URLs; the spec examples + this resolver use relative
// refs) — see README / tracking issue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  encodeMultikey, decodeMultikey, parsePubkeyHex, validatePubkey, DidNostrError,
} from '../src/multikey.js';

const vectors = JSON.parse(
  readFileSync(new URL('./vectors/test-vectors-generated.json', import.meta.url)),
);
const V = vectors.vectors;

test('key_transformation: encode + roundtrip', () => {
  for (const v of V.key_transformation) {
    assert.equal(encodeMultikey(v.input), v.output, v.name);
    if (v.roundtrip) assert.equal(decodeMultikey(v.output).hex, v.input.toLowerCase(), `${v.name} roundtrip`);
  }
});

test('key_decoding: decode to x-only hex + parity', () => {
  for (const v of V.key_decoding) {
    const { hex, parity } = decodeMultikey(v.input);
    assert.equal(hex, v.output, v.name);
    assert.equal(parity, v.parity, `${v.name} parity`);
  }
});

test('error_cases: each input produces its taxonomy code', () => {
  const route = (v) => {
    switch (v.error) {
      case 'InvalidHexLength':
      case 'InvalidHexCharacter':
        return () => parsePubkeyHex(v.input);
      case 'InvalidMultibase':
      case 'InvalidMulticodec':
      case 'InvalidKeyLength':
        return () => decodeMultikey(v.input);
      case 'OddParityNotCanonical':
        return () => decodeMultikey(v.input, { strict: true });
      case 'InvalidPublicKey':
        return () => validatePubkey(v.input);
      default:
        return null;
    }
  };
  for (const v of V.error_cases) {
    const fn = route(v);
    assert.ok(fn, `unrouted error type ${v.error} (${v.name})`);
    assert.throws(fn, (e) => e instanceof DidNostrError && e.code === v.error, `${v.name} -> ${v.error}`);
  }
});
