#!/usr/bin/env node
// did:nostr resolver CLI.
//
//   did-nostr <did|pubkey> [options]
//
// Resolution mode (default: auto = HTTP .well-known, then relay, then offline):
//   --offline            minimal document from the key alone, no network
//   --http               HTTP .well-known only (fast)
//   --relay              relays only (enhanced)
//   --gateway <url>      HTTP gateway to try (repeatable)
//   --relay-url <url>    relay to query (repeatable)
//   --json               print the full DID resolution result
//   -h, --help

import { resolve } from '../src/index.js';

function parseArgs(argv) {
  const o = { gateways: [], relays: [], json: false };
  let target;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') o.mode = 'offline';
    else if (a === '--http') o.mode = 'http';
    else if (a === '--relay') o.mode = 'relay';
    else if (a === '--gateway') o.gateways.push(argv[++i]);
    else if (a === '--relay-url') o.relays.push(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (!a.startsWith('-') && !target) target = a;
  }
  return { target, o };
}

const HELP = `did-nostr <did|pubkey> [options]

  --offline           minimal document from the key alone (no network)
  --http              HTTP .well-known only (fast)
  --relay             relays only (enhanced)
  --gateway <url>     HTTP gateway to try (repeatable)
  --relay-url <url>   relay to query (repeatable)
  --json              print the full DID resolution result
  -h, --help`;

async function main() {
  const { target, o } = parseArgs(process.argv.slice(2));
  if (o.help || !target) { console.log(HELP); process.exit(target ? 0 : 1); }
  const opts = { mode: o.mode };
  if (o.gateways.length) opts.gateways = o.gateways;
  if (o.relays.length) opts.relays = o.relays;
  const result = await resolve(target, opts);
  if (result.didResolutionMetadata?.error) {
    console.error(`error: ${result.didResolutionMetadata.error}`);
    process.exit(1);
  }
  console.log(JSON.stringify(o.json ? result : result.didDocument, null, 2));
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
