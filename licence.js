// Desktop app licences.
//
// The online server signs a small pass with an Ed25519 private key (DESKTOP_LICENCE_KEY).
// The desktop app checks it with the public key below, so it keeps working with no internet
// until the pass runs out. Only the online server can make passes: the public key can't sign.
const crypto = require('crypto');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApc78g8AxKa1vzvIAOZF0gaSweax9/V/6vIpYWYYM0o0=
-----END PUBLIC KEY-----`;

const DAY = 86_400_000;
const MAX_OFFLINE = 30 * DAY; // the app must go online at least this often to renew

// Render env vars can't hold newlines easily, so accept "\n" escapes too.
const readKey = (pem) => crypto.createPrivateKey(String(pem).replace(/\\n/g, '\n'));

function issue(privatePem, { email, plan, until }, now = Date.now()) {
  const cap = now + MAX_OFFLINE;
  const exp = until ? Math.min(+new Date(until), cap) : cap;
  const body = Buffer.from(JSON.stringify({ email, plan, iat: now, exp })).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(body), readKey(privatePem)).toString('base64url');
  return `${body}.${sig}`;
}

// The pass's contents if it's genuine and still in date, else null.
function verify(token, now = Date.now(), publicPem = PUBLIC_KEY) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  try {
    if (!crypto.verify(null, Buffer.from(body), publicPem, Buffer.from(sig, 'base64url'))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > now ? p : null;
  } catch { return null; }
}

// The desktop app's current pass, shared between the app window and the local server.
let current = '';
const setCurrent = (token) => { current = token || ''; };
const currentValid = (now = Date.now()) => verify(current, now);

module.exports = { PUBLIC_KEY, MAX_OFFLINE, issue, verify, setCurrent, currentValid };
