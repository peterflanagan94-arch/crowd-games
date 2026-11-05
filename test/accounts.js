// Accounts, free trial and Stripe webhooks, using the in-memory store.
const assert = require('assert');
const { io } = require('socket.io-client');
process.env.ACCOUNTS = 'memory';
process.env.SESSION_SECRET = 'test-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.ADMIN_EMAILS = 'boss@example.com';
const Stripe = require('stripe');
const { server, rooms } = require('../server');
const { emailKey } = require('../accounts');

assert.equal(emailKey(' P.e.t.e.r+gig@GoogleMail.com '), 'peter@gmail.com');
assert.equal(emailKey('dj.sam+1@outlook.com'), 'dj.sam@outlook.com');

const stripe = new Stripe('sk_test_fake');
const call = (s, ev, d = {}) => new Promise((r) => s.emit(ev, d, r));

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const req = (path, { cookie = '', form, headers = {}, body, method } = {}) => fetch(url + path, {
    method: method || (form || body ? 'POST' : 'GET'),
    redirect: 'manual',
    headers: { cookie, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers },
    body: form ? new URLSearchParams(form).toString() : body,
  });
  const cookieFrom = (res) => (res.headers.getSetCookie().find((c) => c.startsWith('cg_sess=')) || '').split(';')[0];
  const lastLink = (path) => {
    const mail = require('../server').accounts.outbox.at(-1);
    return mail.text.match(new RegExp(`https?://[^\\s]+(${path}\\?t=[^\\s]+)`))[1];
  };
  const hostSocket = (cookie) => new Promise((r) => { const s = io(url, { forceNew: true, extraHeaders: { cookie } }); s.on('connect', () => r(s)); });
  const { store } = require('../server').accounts;

  // Logged out: host screen and packs are locked.
  let res = await req('/host');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^\/login/);
  assert.equal((await req('/api/quiz-categories')).status, 401);
  let s = await hostSocket('');
  assert.equal((await call(s, 'host:create')).error, 'Login required');
  s.close();
  assert.deepEqual(await (await req('/auth/status')).json(), { accounts: true, loggedIn: false, access: false, plan: null, payments: true });

  // Sign up: logged in, but the trial waits for the email link.
  res = await req('/signup', { form: { email: 'Peter.F+test@gmail.com', password: 'longenough' } });
  assert.equal(res.status, 302);
  let cookie = cookieFrom(res);
  assert.ok(cookie);
  res = await req('/host', { cookie });
  assert.equal(res.headers.get('location'), '/account');
  assert.match(await (await req('/account', { cookie })).text(), /Check your email/);

  // One trial per email, whatever the dots and +tags.
  res = await req('/signup', { form: { email: 'peterf@gmail.com', password: 'longenough' } });
  assert.equal(res.status, 409);

  // Short password and bad origin are refused.
  assert.equal((await req('/signup', { form: { email: 'a@b.co', password: 'short' } })).status, 400);
  assert.equal((await req('/signup', { form: { email: 'c@d.co', password: 'longenough' }, headers: { origin: 'https://evil.example' } })).status, 403);

  // Confirm email: 7-day trial starts and the host screen opens.
  res = await req(lastLink('/verify'), { cookie });
  assert.equal(res.headers.get('location'), '/account?welcome=1');
  let u = await store.getUserByKey('peterf@gmail.com');
  const days = (new Date(u.trial_ends_at) - Date.now()) / 86_400_000;
  assert.ok(days > 6.99 && days <= 7, 'trial is 7 days');
  assert.equal((await req('/host', { cookie })).status, 200);
  assert.equal((await req('/api/quiz-categories', { cookie })).status, 200);
  assert.match(await (await req('/account', { cookie })).text(), /Free trial/);
  s = await hostSocket(cookie);
  const room = await call(s, 'host:create');
  assert.match(room.code, /^[A-Z]{4}$/);

  // The DJ phone remote link works without logging in, and only for that room.
  res = await req(`/host?remote=1&room=${room.code}&key=${room.hostKey}`);
  assert.equal(res.status, 200);
  const remote = res.headers.getSetCookie().find((c) => c.startsWith('cg_remote=')).split(';')[0];
  assert.equal((await req('/api/quiz-categories', { cookie: remote })).status, 200);
  assert.equal((await req('/api/quiz-categories', { cookie: `cg_remote=${room.code}.nope` })).status, 401);
  assert.equal((await req(`/host?room=${room.code}&key=wrong`)).status, 302);

  // Log in.
  assert.equal((await req('/login', { form: { email: 'peterf@gmail.com', password: 'wrongpass' } })).status, 401);
  res = await req('/login', { form: { email: 'PeterF@gmail.com', password: 'longenough', next: '/host' } });
  assert.equal(res.headers.get('location'), '/host');

  // Trial over: locked again, and the account page offers the plans.
  await store.updateUser(u.id, { trial_ends_at: new Date(Date.now() - 1000) });
  assert.equal((await req('/host', { cookie })).headers.get('location'), '/account');
  assert.equal((await req('/api/quiz-categories', { cookie })).status, 401);
  const acct = await (await req('/account', { cookie })).text();
  assert.match(acct, /free trial has ended/);
  assert.match(acct, /Event pass · £9.99 for 24h/);
  s.close();
  s = await hostSocket(cookie);
  assert.equal((await call(s, 'host:create')).error, 'Login required');
  s.close();

  // Stripe webhooks.
  const hook = (event) => {
    const body = JSON.stringify(event);
    return req('/billing/webhook', { body, headers: { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_test' }), 'content-type': 'application/json' } });
  };
  assert.equal((await req('/billing/webhook', { body: '{}', headers: { 'stripe-signature': 't=1,v1=bad' } })).status, 400, 'unsigned webhook refused');
  const passEvent = { id: 'evt_1', type: 'checkout.session.completed', data: { object: {
    id: 'cs_test_pass1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', customer: 'cus_123',
    client_reference_id: String(u.id), metadata: { user_id: String(u.id), plan: 'pass' } } } };
  assert.equal((await hook(passEvent)).status, 200);
  u = await store.getUser(u.id);
  assert.equal(u.stripe_customer_id, 'cus_123');
  const hours = (new Date(u.pass_until) - Date.now()) / 3600_000;
  assert.ok(hours > 23.9 && hours <= 24, 'event pass is 24 hours');
  await hook(passEvent); // Stripe can send the same event twice
  assert.equal(+new Date((await store.getUser(u.id)).pass_until), +new Date(u.pass_until), 'pass not doubled');
  assert.equal((await req('/host', { cookie })).status, 200);
  assert.match(await (await req('/account', { cookie })).text(), /Event pass/);

  // Monthly subscription, then cancelled.
  await store.updateUser(u.id, { pass_until: null });
  const end = Math.floor(Date.now() / 1000) + 30 * 86400;
  const sub = { id: 'sub_1', object: 'subscription', customer: 'cus_123', status: 'active', metadata: { user_id: String(u.id), plan: 'monthly' },
    items: { data: [{ current_period_end: end, price: { recurring: { interval: 'month' } } }] } };
  await hook({ id: 'evt_2', type: 'customer.subscription.created', data: { object: sub } });
  u = await store.getUser(u.id);
  assert.equal(u.sub_status, 'active');
  assert.equal(u.sub_plan, 'monthly');
  assert.equal((await req('/host', { cookie })).status, 200);
  const subPage = await (await req('/account', { cookie })).text();
  assert.match(subPage, /Monthly.*Renews/s);
  assert.match(subPage, /Manage subscription/);
  await hook({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { ...sub, status: 'canceled' } } });
  assert.equal((await req('/host', { cookie })).headers.get('location'), '/account');

  // Password reset logs out old sessions.
  await req('/forgot', { form: { email: 'peterf@gmail.com' } });
  const resetLink = lastLink('/reset');
  assert.equal((await req(resetLink)).status, 200);
  const t = new URL(url + resetLink).searchParams.get('t');
  assert.equal((await req('/reset', { form: { t, password: 'brandnewpass' } })).headers.get('location'), '/login?reset=1');
  assert.equal((await req('/account', { cookie })).headers.get('location'), '/login?next=/account', 'old session ended');
  assert.equal((await req('/reset', { form: { t, password: 'another-one' } })).status, 400, 'reset link is single use');
  assert.equal((await req('/login', { form: { email: 'peterf@gmail.com', password: 'brandnewpass' } })).status, 302);

  // Admin emails always have access, even before confirming.
  res = await req('/signup', { form: { email: 'boss@example.com', password: 'longenough' } });
  assert.equal((await req('/host', { cookie: cookieFrom(res) })).status, 200);

  // Pre-launch: only admin emails can sign up.
  process.env.SIGNUPS = 'closed';
  delete require.cache[require.resolve('../accounts')];
  const closed = require('../accounts').createAccounts({ baseUrl: () => url });
  const express = require('express');
  const app2 = express();
  closed.install(app2);
  const srv2 = app2.listen(0);
  const url2 = `http://localhost:${srv2.address().port}`;
  const post2 = (email) => fetch(url2 + '/signup', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: 'longenough' }).toString() });
  assert.equal((await post2('someone@example.com')).status, 403);
  assert.equal((await post2('boss@example.com')).status, 302);
  assert.equal((await (await fetch(url2 + '/auth/status')).json()).accounts, false, 'home page keeps "coming soon"');
  srv2.close();

  console.log('accounts test passed');
  rooms.clear();
  process.exit(0);
});
