// Desktop app: offline passes, the website's /desktop sign-in, and the laptop-only host lock.
const assert = require('assert');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const licence = require('../licence');

const DAY = 86_400_000;
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUB = publicKey.export({ type: 'spki', format: 'pem' });

if (process.argv[2] === 'desktop-mode') {
  // ---- part 2, in its own process: the server as the desktop app runs it ----
  process.env.CROWD_DESKTOP = '1';
  const { io } = require('socket.io-client');
  const { server } = require('../server');
  const call = (s, ev, d = {}) => new Promise((r) => s.emit(ev, d, r));
  server.listen(0, '127.0.0.1', async () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    const sock = () => new Promise((r) => { const s = io(url, { forceNew: true }); s.on('connect', () => r(s)); });

    // No pass: host screen, packs and new rooms are locked; guests' pages still load.
    licence.currentValid = () => null;
    let res = await fetch(url + '/host', { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal((await fetch(url + '/api/quiz-categories')).status, 401);
    assert.equal((await fetch(url + '/play')).status, 200);
    let s = await sock();
    assert.equal((await call(s, 'host:create')).error, 'Login required');
    s.close();

    // With a pass, on this laptop: everything works, including the offline font.
    licence.currentValid = () => ({ email: 'dj@example.com' });
    assert.equal((await fetch(url + '/host')).status, 200);
    assert.ok((await (await fetch(url + '/api/quiz-categories')).json()).length > 5);
    assert.equal((await fetch(url + '/fonts/playfair-display-latin-700-normal.woff2')).status, 200);
    const net = await (await fetch(url + '/api/net')).json();
    assert.equal(typeof net.online, 'boolean');
    s = await sock();
    const { code, hostKey } = await call(s, 'host:create');
    assert.ok(code && hostKey);

    // The DJ phone remote link still opens the host screen for that room, even with no pass on the phone.
    licence.currentValid = () => null;
    res = await fetch(`${url}/host?room=${code}&key=${hostKey}`, { redirect: 'manual' });
    assert.equal(res.status, 200);
    const remote = res.headers.getSetCookie().find((c) => c.startsWith('cg_remote=')).split(';')[0];
    assert.equal((await fetch(url + '/api/quiz-categories', { headers: { cookie: remote } })).status, 200);
    assert.equal((await fetch(`${url}/host?room=${code}&key=wrong`, { redirect: 'manual' })).status, 302);

    s.close();
    server.close();
    console.log('desktop mode test passed');
    process.exit(0);
  });
  return;
}

// ---- part 1: passes ----
const now = Date.now();
let tok = licence.issue(PRIV, { email: 'dj@example.com', plan: 'monthly', until: now + 5 * DAY }, now);
let p = licence.verify(tok, now, PUB);
assert.equal(p.email, 'dj@example.com');
assert.equal(p.exp, now + 5 * DAY);
assert.equal(licence.verify(tok, now + 6 * DAY, PUB), null, 'expires with the plan');
assert.equal(licence.verify(tok, now, licence.PUBLIC_KEY), null, 'other keys are refused');
const [body, sig] = tok.split('.');
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), exp: now + 999 * DAY })).toString('base64url');
assert.equal(licence.verify(`${forged}.${sig}`, now, PUB), null, 'edited passes are refused');
tok = licence.issue(PRIV.replace(/\n/g, '\\n'), { email: 'a@b.co', plan: 'yearly', until: now + 300 * DAY }, now);
assert.equal(licence.verify(tok, now, PUB).exp, now + licence.MAX_OFFLINE, 'capped at 30 days offline; escaped key works');
assert.equal(licence.verify(licence.issue(PRIV, { email: 'a@b.co', plan: 'complimentary' }, now), now, PUB).exp, now + licence.MAX_OFFLINE);

// ---- part 1: the website's /desktop routes ----
process.env.ACCOUNTS = 'memory';
process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_EMAILS = 'boss@example.com';
const { server } = require('../server');

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const form = (path, f) => fetch(url + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });

  // Not set up yet on the server.
  assert.equal((await post('/desktop/signin', { email: 'boss@example.com', password: 'longenough' })).status, 503);
  process.env.DESKTOP_LICENCE_KEY = PRIV;

  await form('/signup', { email: 'boss@example.com', password: 'longenough' });
  await form('/signup', { email: 'new@example.com', password: 'longenough' });

  assert.equal((await post('/desktop/signin', { email: 'boss@example.com', password: 'wrong-one' })).status, 401);
  let res = await post('/desktop/signin', { email: 'new@example.com', password: 'longenough' });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).reason, 'verify');

  res = await post('/desktop/signin', { email: 'BOSS@example.com', password: 'longenough' });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(licence.verify(d.licence, Date.now(), PUB).email, 'boss@example.com');
  assert.equal(d.plan, 'Full access');

  res = await post('/desktop/renew', { renew: d.renew });
  assert.equal(res.status, 200);
  assert.ok(licence.verify((await res.json()).licence, Date.now(), PUB));
  assert.equal((await post('/desktop/renew', { renew: 'nonsense.token' })).status, 401);

  server.close();
  console.log('desktop sign-in test passed');
  execFileSync(process.execPath, [__filename, 'desktop-mode'], { stdio: 'inherit', env: { PATH: process.env.PATH, ACCOUNTS: 'memory', HOST_PASSWORD: 'ignored-on-desktop' } });
  process.exit(0);
});
