// Minimal, dependency-free Nostr relay client. Uses the platform WebSocket
// (browser, or Node >= 22 global WebSocket). Just enough of NIP-01 to fetch the
// latest kind 0 / 3 / 10002 events for a pubkey: REQ -> EVENT* -> EOSE.

const DEFAULT_RELAYS = [
  'wss://relay.damus.io/',
  'wss://nos.lol/',
  'wss://relay.nostr.band/',
];

const KINDS = [0, 3, 10002];

function getWebSocket() {
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('No WebSocket available (use Node >= 22 or a browser, or pass a WebSocket impl)');
  return WS;
}

// Query a single relay for the latest event of each kind. Resolves to a map
// { [kind]: event }. Never rejects — a dead/slow relay resolves to {}.
function queryOne(url, pubkey, { timeout, WebSocketImpl }) {
  const WS = WebSocketImpl || getWebSocket();
  return new Promise((resolve) => {
    const latest = {};
    let ws, timer, done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(timer);
      try { ws && ws.close(); } catch { /* ignore */ }
      resolve(latest);
    };
    try { ws = new WS(url); } catch { return resolve({}); }
    timer = setTimeout(finish, timeout);
    const subId = `did-nostr-${pubkey.slice(0, 8)}`;
    ws.onopen = () => ws.send(JSON.stringify(['REQ', subId, { authors: [pubkey], kinds: KINDS }]));
    ws.onerror = finish;
    ws.onclose = finish;
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
      if (msg[0] === 'EVENT' && msg[1] === subId) {
        const e = msg[2];
        if (e && e.pubkey === pubkey && KINDS.includes(e.kind)) {
          const prev = latest[e.kind];
          if (!prev || e.created_at > prev.created_at) latest[e.kind] = e;
        }
      } else if (msg[0] === 'EOSE' && msg[1] === subId) {
        finish();
      }
    };
  });
}

/**
 * Fetch the latest kind 0/3/10002 events for a pubkey across relays.
 * @returns {Promise<{profile?, follows?, relays?}>} latest-wins per kind
 */
export async function fetchEvents(pubkey, {
  relays = DEFAULT_RELAYS,
  timeout = 4000,
  WebSocketImpl,
} = {}) {
  const results = await Promise.all(
    relays.map((url) => queryOne(url, pubkey, { timeout, WebSocketImpl })),
  );
  const merged = {};
  for (const r of results) {
    for (const k of KINDS) {
      if (r[k] && (!merged[k] || r[k].created_at > merged[k].created_at)) merged[k] = r[k];
    }
  }
  return { profile: merged[0], follows: merged[3], relays: merged[10002] };
}

export { DEFAULT_RELAYS };
