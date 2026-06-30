// Build a did:nostr DID document from a pubkey and (optionally) source events.
// Pure: no network. Conforms to did:nostr 0.0.12.
//
//   - @context: cid/v1 + nostr/context
//   - type: DIDNostr
//   - Multikey verification method (publicKeyMultibase = f + e701 + 02 + x)
//   - enhanced: profile (kind 0), follows (kind 3), service/Relay (kind 10002)
//   - profile.created_at (kind-0 created_at, Unix seconds)
//   - follows bounded to a subset; the full signed list is the kind-3 event
//   - modified (dcterms:modified, ISO-8601) = max(created_at) over the signed
//     parts composed into the document

import { parsePubkeyHex, encodeMultikey } from './multikey.js';

const CONTEXT = ['https://www.w3.org/ns/cid/v1', 'https://w3id.org/nostr/context'];
const PROFILE_FIELDS = ['name', 'about', 'picture', 'website', 'nip05', 'lud16'];

// Upper bound on follows inlined into the document; the complete signed list is
// the kind-3 event on the relays.
export const FOLLOWS_LIMIT = 500;

// ISO-8601 UTC (no sub-second precision) from a Nostr created_at (Unix seconds).
// Returns null for non-integer or out-of-range values so generation never throws.
function isoFromUnix(sec) {
  if (!Number.isSafeInteger(sec)) return null;
  const d = new Date(sec * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @param {string} pubkey  64-char hex x-only key (the DID's method-specific id)
 * @param {{profile?,follows?,relays?}} events  raw Nostr events (kind 0/3/10002)
 * @returns DID document, or null if the pubkey is not 64-hex
 */
export function buildDidDocument(pubkey, { profile, follows, relays } = {}) {
  let hex;
  try { hex = parsePubkeyHex(pubkey); } catch { return null; }
  const did = `did:nostr:${hex}`;

  const doc = {
    '@context': CONTEXT,
    id: did,
    type: 'DIDNostr',
    verificationMethod: [{
      id: `${did}#key1`,
      type: 'Multikey',
      controller: did,
      publicKeyMultibase: encodeMultikey(hex),
    }],
    authentication: ['#key1'],
    assertionMethod: ['#key1'],
  };

  // kind 0 -> profile (+ alsoKnownAs)
  if (profile?.content) {
    try {
      const c = JSON.parse(profile.content);
      const p = {};
      for (const k of PROFILE_FIELDS) if (c[k]) p[k] = c[k];
      if (c.display_name && !p.name) p.name = c.display_name;
      // created_at is provenance for the profile: attach only when the kind-0
      // contributes real profile fields (not a bare timestamp object).
      if (Object.keys(p).length) {
        if (Number.isSafeInteger(profile.created_at)) p.created_at = profile.created_at;
        doc.profile = p;
      }
      const aka = Array.isArray(c.alsoKnownAs) ? c.alsoKnownAs.filter((x) => typeof x === 'string' && x) : [];
      if (aka.length) doc.alsoKnownAs = aka;
    } catch { /* malformed kind-0 content */ }
  }

  // kind 3 -> follows. Accept the raw event ({tags:[["p",hex],…]}) or a derived
  // shape ({follows:[hex,…]}). Collect up to FOLLOWS_LIMIT and stop.
  let followHexes = [];
  if (Array.isArray(follows?.tags)) followHexes = follows.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
  else if (Array.isArray(follows?.follows)) followHexes = follows.follows;
  const f = [];
  for (const h of followHexes) {
    const lc = String(h).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(lc)) continue;
    f.push(`did:nostr:${lc}`);
    if (f.length >= FOLLOWS_LIMIT) break;
  }
  if (f.length) doc.follows = f;

  // kind 10002 -> service (Relay)
  if (Array.isArray(relays?.tags)) {
    const svc = relays.tags
      .filter((t) => t[0] === 'r' && typeof t[1] === 'string' && t[1])
      .map((t, i) => ({ id: `${did}#relay${i + 1}`, type: 'Relay', serviceEndpoint: t[1] }));
    if (svc.length) doc.service = svc;
  }

  // Subject provenance: max(created_at) over the signed parts actually composed
  // into the document, serialized ISO-8601. (kind-0 composes via profile and/or
  // alsoKnownAs.) Representation-only changes are conveyed by ETag/Last-Modified.
  const stamps = [
    (doc.profile || doc.alsoKnownAs) && profile?.created_at,
    doc.follows && follows?.created_at,
    doc.service && relays?.created_at,
  ].filter(Number.isSafeInteger);
  if (stamps.length) {
    const iso = isoFromUnix(Math.max(...stamps));
    if (iso) doc.modified = iso;
  }

  return doc;
}
