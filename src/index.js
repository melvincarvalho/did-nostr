// did-nostr — a did:nostr resolver (offline / HTTP .well-known / relay) with a
// DIF did-resolver driver. Conforms to did:nostr 0.0.12.

export { resolve, resolveOffline, resolveHttp, resolveRelay, parseDid, DID_MIME, DEFAULT_GATEWAYS } from './resolve.js';
export { buildDidDocument, FOLLOWS_LIMIT } from './diddoc.js';
export { encodeMultikey, decodeMultikey, validatePubkey, parsePubkeyHex, DidNostrError } from './multikey.js';
export { fetchEvents, DEFAULT_RELAYS } from './relay.js';

import { resolve } from './resolve.js';

/**
 * DIF did-resolver driver. Register with:
 *   import { Resolver } from 'did-resolver'
 *   import { getResolver } from 'did-nostr'
 *   const resolver = new Resolver(getResolver())
 *   await resolver.resolve('did:nostr:<pubkey>')
 *
 * @param {object} [defaults] default resolve() options (gateways, relays, mode)
 */
export function getResolver(defaults = {}) {
  return {
    nostr: (did, parsed, _resolver, options = {}) =>
      resolve(parsed?.id ?? did, { ...defaults, ...options }),
  };
}
