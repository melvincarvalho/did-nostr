// did:nostr resolution strategy:
//   1. offline / minimal  — DID document from the public key alone (no network)
//   2. HTTP (.well-known)  — fast: GET <gateway>/.well-known/did/nostr/<hex>.json
//   3. relay / enhanced    — query relays for kind 0/3/10002, build the document
//
// resolve() returns a W3C DID Resolution Result:
//   { didResolutionMetadata, didDocument, didDocumentMetadata }

import { buildDidDocument } from './diddoc.js';
import { parsePubkeyHex } from './multikey.js';
import { fetchEvents, DEFAULT_RELAYS } from './relay.js';

const DID_MIME = 'application/did+json'; // (JSON-LD variant: application/did+ld+json)
const DEFAULT_GATEWAYS = ['https://nostr.social'];

/** Extract the 64-hex method-specific id from a did:nostr DID (or a raw pubkey). */
export function parseDid(did) {
  const s = String(did ?? '');
  const id = s.startsWith('did:nostr:') ? s.slice('did:nostr:'.length) : s;
  return parsePubkeyHex(id); // throws DidNostrError on bad input
}

const ok = (didDocument, meta = {}) => ({
  didResolutionMetadata: { contentType: DID_MIME, ...meta },
  didDocument,
  didDocumentMetadata: {},
});
const err = (error) => ({ didResolutionMetadata: { error }, didDocument: null, didDocumentMetadata: {} });

/** Minimal document from the pubkey alone — no network. */
export function resolveOffline(hex) {
  return buildDidDocument(hex);
}

/** Try HTTP gateways' .well-known path; returns a DID document or null. */
export async function resolveHttp(hex, { gateways = DEFAULT_GATEWAYS, fetchImpl = globalThis.fetch } = {}) {
  if (!fetchImpl) return null;
  for (const gw of gateways) {
    if (typeof gw !== 'string' || !gw) continue; // skip invalid gateway entries
    const url = `${gw.replace(/\/$/, '')}/.well-known/did/nostr/${hex}.json`;
    try {
      const res = await fetchImpl(url, { headers: { accept: DID_MIME } });
      if (!res.ok) continue;
      const doc = await res.json();
      if (doc && doc.id === `did:nostr:${hex}`) return doc;
    } catch { /* try next gateway */ }
  }
  return null;
}

/** Query relays and build the enhanced document locally. */
export async function resolveRelay(hex, opts = {}) {
  const events = await fetchEvents(hex, { relays: opts.relays || DEFAULT_RELAYS, ...opts });
  return buildDidDocument(hex, events);
}

/**
 * Resolve a did:nostr DID.
 * @param {string} did
 * @param {object} [opts]
 * @param {'auto'|'offline'|'http'|'relay'} [opts.mode='auto']
 * @param {string[]} [opts.gateways] HTTP .well-known gateways
 * @param {string[]} [opts.relays]   relay URLs
 */
export async function resolve(did, opts = {}) {
  let hex;
  try { hex = parseDid(did); } catch { return err('invalidDid'); }
  const mode = opts.mode || 'auto';

  if (mode === 'offline') return ok(resolveOffline(hex), { mode: 'offline' });

  if (mode === 'http') {
    const doc = await resolveHttp(hex, opts);
    return doc ? ok(doc, { mode: 'http' }) : err('notFound');
  }

  if (mode === 'relay') {
    try {
      const doc = await resolveRelay(hex, opts);
      return ok(doc, { mode: 'relay' });
    } catch {
      return err('notFound'); // e.g. no WebSocket available, or all relays failed
    }
  }

  // auto: fast HTTP first, then relay, then offline-minimal as the floor.
  const httpDoc = await resolveHttp(hex, opts);
  if (httpDoc) return ok(httpDoc, { mode: 'http' });
  try {
    const relayDoc = await resolveRelay(hex, opts);
    // a doc with any signed part beyond the key counts as a successful enhance
    if (relayDoc && (relayDoc.profile || relayDoc.follows || relayDoc.service)) {
      return ok(relayDoc, { mode: 'relay' });
    }
  } catch { /* fall through to offline */ }
  return ok(resolveOffline(hex), { mode: 'offline' });
}

export { DID_MIME, DEFAULT_GATEWAYS };
