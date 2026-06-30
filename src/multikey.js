// Multikey transformation for did:nostr identifiers.
//
// did:nostr 0.0.12, Multikey Verification Method:
//   publicKeyMultibase = "f" (multibase base16-lower)
//                      + "e701" (multicodec secp256k1-pub varint)
//                      + parity byte ("02" even, canonical / "03" odd)
//                      + 32-byte x-only key (hex)
//
// The identifier is the x-only key (no parity). Encoding treats it as opaque
// hex (the canonical Multikey prepends 02). Validation (x < p, on the curve)
// is separate and optional, per spec: resolvers SHOULD validate; the encoder
// MAY treat presumed-valid input as opaque hex.

const MULTICODEC = 'e701';       // secp256k1-pub varint
const PREFIX = `fe70102`;        // f + e701 + 02 (canonical even-parity Multikey)

// secp256k1 field prime
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

/** Typed resolution error carrying the spec error-taxonomy code. */
export class DidNostrError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'DidNostrError';
    this.code = code; // e.g. InvalidHexLength, InvalidPublicKey, OddParityNotCanonical
  }
}
const fail = (code, message) => { throw new DidNostrError(code, message); };

/** Parse a method-specific identifier as a 64-char lowercase hex x-only key. */
export function parsePubkeyHex(input) {
  const s = String(input ?? '');
  if (s.length !== 64) fail('InvalidHexLength', `expected 64 hex chars, got ${s.length}`);
  if (!/^[0-9a-fA-F]{64}$/.test(s)) fail('InvalidHexCharacter', 'non-hex character in identifier');
  return s.toLowerCase();
}

/** Encode an x-only hex key as the canonical (even-parity) publicKeyMultibase. */
export function encodeMultikey(hex) {
  const x = parsePubkeyHex(hex);
  return `${PREFIX}${x}`;
}

/**
 * Decode a publicKeyMultibase to { hex, parity }. Accepts 0x02 and 0x03; with
 * { strict: true } an odd-parity (0x03) key is rejected (BIP-340 canonical).
 */
export function decodeMultikey(mb, { strict = false } = {}) {
  const s = String(mb ?? '');
  if (s[0] !== 'f') fail('InvalidMultibase', "expected base16-lower multibase prefix 'f'");
  const body = s.slice(1);
  if (!/^[0-9a-f]*$/.test(body)) fail('InvalidMultibase', 'multibase body is not lowercase base16');
  if (body.slice(0, 4) !== MULTICODEC) fail('InvalidMulticodec', `expected secp256k1-pub multicodec ${MULTICODEC}`);
  const parityHex = body.slice(4, 6);
  if (parityHex !== '02' && parityHex !== '03') fail('InvalidMulticodec', `unexpected parity prefix 0x${parityHex}`);
  const hex = body.slice(6);
  if (hex.length !== 64) fail('InvalidKeyLength', `expected 32-byte key, got ${hex.length / 2} bytes`);
  const parity = parityHex === '02' ? 2 : 3;
  if (strict && parity === 3) fail('OddParityNotCanonical', 'odd-parity key rejected by canonical BIP-340 decoder');
  return { hex, parity };
}

const modpow = (b, e, m) => {
  let r = 1n; b %= m;
  while (e > 0n) { if (e & 1n) r = (r * b) % m; e >>= 1n; b = (b * b) % m; }
  return r;
};

/** True iff x is the x-coordinate of a point on secp256k1 (y^2 = x^3 + 7 is a QR). */
function onCurve(x) {
  const rhs = (modpow(x, 3n, P) + 7n) % P;
  return rhs !== 0n && modpow(rhs, (P - 1n) / 2n, P) === 1n;
}

/**
 * Validate that an identifier is a valid secp256k1 x-only public key:
 * a field element (x < p) and the x-coordinate of a point on the curve.
 * Throws DidNostrError('InvalidPublicKey') otherwise. (did:nostr 0.0.12.)
 */
export function validatePubkey(input) {
  const hex = parsePubkeyHex(input);
  const x = BigInt(`0x${hex}`);
  if (x >= P) fail('InvalidPublicKey', 'x is not a field element (x >= p)');
  if (!onCurve(x)) fail('InvalidPublicKey', 'x is not the x-coordinate of a curve point');
  return hex;
}
