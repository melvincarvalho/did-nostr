# did-nostr

A [`did:nostr`](https://nostrcg.github.io/did-nostr/) resolver — **offline**, **HTTP (`.well-known`)**, and **relay** resolution, with a [DIF `did-resolver`](https://github.com/decentralized-identity/did-resolver) driver. Conforms to did:nostr **0.0.12**.

> The spec lives at [nostrcg/did-nostr](https://github.com/nostrcg/did-nostr). This package is the resolver.

## Install

```sh
npm install did-nostr
# optional, for the DIF driver:
npm install did-resolver
```

ESM only. Node ≥ 20 (relay resolution needs a global `WebSocket` — Node ≥ 22 or a browser).

## Library

```js
import { resolve, buildDidDocument } from 'did-nostr'

// Full strategy: HTTP .well-known (fast) -> relay (enhanced) -> offline (minimal)
const { didDocument } = await resolve('did:nostr:124c0f…fdd2')

// Pure, offline, no network — minimal document from the key alone:
const minimal = buildDidDocument('124c0f…fdd2')
```

### DIF did-resolver driver

```js
import { Resolver } from 'did-resolver'
import { getResolver } from 'did-nostr'

const resolver = new Resolver(getResolver({ gateways: ['https://nostr.social'] }))
const result = await resolver.resolve('did:nostr:124c0f…fdd2')
// -> { didResolutionMetadata, didDocument, didDocumentMetadata }
```

## CLI

```sh
did-nostr <did|pubkey> [options]

  --offline           minimal document from the key alone (no network)
  --http              HTTP .well-known only (fast)
  --relay             relays only (enhanced)
  --gateway <url>     HTTP gateway to try (repeatable)
  --relay-url <url>   relay to query (repeatable)
  --json              print the full DID resolution result
  -h, --help
```

## Resolution strategy

1. **Offline / minimal** — DID document from the public key alone, no network.
2. **HTTP (`.well-known`)** — `GET <gateway>/.well-known/did/nostr/<pubkey>.json` (fast path).
3. **Relay / enhanced** — query relays for kind 0 (profile), 3 (follows), 10002 (relays) and build the document locally.

`resolve()` in `auto` mode tries HTTP first, falls back to relay, then to offline-minimal.

## Conformance

Key transformation, decoding, the error taxonomy, and minimal document generation are gated against the [did:nostr conformance vectors](https://github.com/nostrcg/did-nostr/blob/gh-pages/test-vectors/test-vectors-generated.json) (`npm test`). This is an independent implementation of the same vectors that [Beacon](https://github.com/JavaScriptSolidServer/beacon) passes.

## License

MIT
