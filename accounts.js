// Host accounts, the 7-day free trial and Stripe payments.
//
// Turned on by DATABASE_URL (Postgres on Render) or ACCOUNTS=memory (local testing).
// Without either, the app keeps the old HOST_PASSWORD lock.
//
// Env vars:
//   SESSION_SECRET         long random string that signs login cookies and email links
//   STRIPE_SECRET_KEY      sk_test_... while testing, sk_live_... to take real money
//   STRIPE_WEBHOOK_SECRET  whsec_... from the Stripe webhook pointing at /billing/webhook
//   STRIPE_PRICE_PASS / STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY  optional Stripe price ids;
//                          without them the prices below are sent to Stripe directly
//   RESEND_API_KEY, EMAIL_FROM  for confirmation and password reset emails (else they're logged)
//   ADMIN_EMAILS           comma separated emails that always have full access (no payment)
//   TRIAL_DAYS             length of the free trial, default 7
//   SIGNUPS=closed         pre-launch: only ADMIN_EMAILS can sign up, and the home page still says "coming soon"
const crypto = require('crypto');
const express = require('express');
const { memoryStore, pgStore } = require('./store');

const DAY = 86_400_000;
const PLANS = {
  pass: { name: 'Event pass (24 hours)', amount: 999, mode: 'payment', price: process.env.STRIPE_PRICE_PASS },
  monthly: { name: 'Monthly', amount: 1299, mode: 'subscription', interval: 'month', price: process.env.STRIPE_PRICE_MONTHLY },
  yearly: { name: 'Yearly', amount: 12900, mode: 'subscription', interval: 'year', price: process.env.STRIPE_PRICE_YEARLY },
};
const PLAN_LABEL = { pass: 'Event pass', monthly: 'Monthly', yearly: 'Yearly', trial: 'Free trial', complimentary: 'Full access' };
const LIVE_SUB = ['active', 'trialing', 'past_due'];

// One trial per email: case, "+anything" tags and Gmail's dots don't make a new address.
function emailKey(raw) {
  const e = String(raw || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return '';
  let local = e.slice(0, at).split('+')[0];
  let domain = e.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') { local = local.replace(/\./g, ''); domain = 'gmail.com'; }
  return local ? `${local}@${domain}` : '';
}
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length);
  return crypto.timingSafeEqual(got, want);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Crowd QR Games · ${esc(title)}</title>
  <link rel="icon" href="/icon.svg" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body class="glow home">
  <main class="login-wrap">
    <div class="join-card login-card acct">
      <a href="/" class="brand logo"><img src="/icon.svg" alt="" width="34" height="34" />Crowd <span>QR</span> Games</a>
      ${body}
    </div>
  </main>
</body>
</html>`;
}
const note = (msg, kind = 'err') => (msg ? `<p class="login-${kind}">${esc(msg)}</p>` : '');
const safeNext = (n) => (/^\/(?!\/)[\w\-./?=&%]*$/.test(n || '') ? n : '/host');

function createAccounts({ baseUrl }) {
  const enabled = !!process.env.DATABASE_URL || process.env.ACCOUNTS === 'memory';
  if (!enabled) return { enabled: false };

  const store = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : memoryStore();
  const TRIAL_MS = (Number(process.env.TRIAL_DAYS) || 7) * DAY;
  const SIGNUPS_OPEN = process.env.SIGNUPS !== 'closed';
  const ADMINS = new Set(String(process.env.ADMIN_EMAILS || '').split(',').map(emailKey).filter(Boolean));
  let SECRET = process.env.SESSION_SECRET || '';
  if (!SECRET) {
    SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('SESSION_SECRET is not set: everyone will be logged out whenever the server restarts.');
  }
  const stripe = process.env.STRIPE_SECRET_KEY ? new (require('stripe'))(process.env.STRIPE_SECRET_KEY) : null;
  const outbox = []; // emails, kept when there's no email service (and for tests)
  const ready = store.init();
  ready.catch((e) => console.error('Database setup failed:', e.message));

  // ---- signed tokens: login cookies and email links ----
  const sig = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
  const sign = (obj) => { const b = Buffer.from(JSON.stringify(obj)).toString('base64url'); return `${b}.${sig(b)}`; };
  const unsign = (tok) => {
    const [b, s] = String(tok || '').split('.');
    if (!b || !s || s.length !== 43 || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sig(b)))) return null;
    try { const o = JSON.parse(Buffer.from(b, 'base64url').toString()); return o.e > Date.now() ? o : null; } catch { return null; }
  };
  const passTag = (u) => sig(`pw:${u.pass_hash}`).slice(0, 12); // reset links die once the password changes

  const COOKIE = 'cg_sess';
  const cookieOf = (header, name) => {
    for (const part of String(header || '').split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return '';
  };
  const secure = (req) => ((req.headers['x-forwarded-proto'] || req.protocol) === 'https' ? '; Secure' : '');
  const setSession = (req, res, u) => {
    const tok = sign({ u: u.id, v: u.session_ver || 0, e: Date.now() + 60 * DAY });
    res.append('Set-Cookie', `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 86400}${secure(req)}`);
  };
  const clearSession = (res) => res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

  async function userFromCookie(header) {
    const t = unsign(cookieOf(header, COOKIE));
    if (!t || !t.u) return null;
    await ready;
    const u = await store.getUser(t.u);
    return u && (u.session_ver || 0) === t.v ? u : null;
  }

  // What this account can do right now.
  function access(u, now = Date.now()) {
    if (!u) return { ok: false, reason: 'login' };
    if (u.comp || ADMINS.has(u.email_key)) return { ok: true, plan: 'complimentary' };
    if (!u.verified_at) return { ok: false, reason: 'verify' };
    const subEnd = u.sub_period_end && +new Date(u.sub_period_end) + 2 * DAY; // grace while Stripe retries a card
    if (LIVE_SUB.includes(u.sub_status) && subEnd > now) return { ok: true, plan: u.sub_plan || 'monthly', until: u.sub_period_end, sub: true };
    if (u.pass_until && +new Date(u.pass_until) > now) return { ok: true, plan: 'pass', until: u.pass_until };
    if (u.trial_ends_at && +new Date(u.trial_ends_at) > now) return { ok: true, plan: 'trial', until: u.trial_ends_at };
    return { ok: false, reason: u.trial_ends_at ? 'expired' : 'verify' };
  }

  // ---- email ----
  async function sendEmail(to, subject, text) {
    outbox.push({ to, subject, text });
    if (outbox.length > 50) outbox.shift();
    if (!process.env.RESEND_API_KEY) { console.log(`[email to ${to}] ${subject}\n${text}`); return; }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Crowd QR Games <hello@crowdqrgames.com>', to, subject, text }),
    });
    if (!r.ok) console.error('Email failed:', r.status, await r.text().catch(() => ''));
  }
  const sendVerify = (req, u) => sendEmail(u.email, 'Confirm your email to start your free trial',
    `Hi,\n\nConfirm your email to start your ${TRIAL_MS / DAY}-day free trial of Crowd QR Games:\n\n` +
    `${baseUrl(req)}/verify?t=${sign({ p: 'verify', u: u.id, e: Date.now() + 2 * DAY })}\n\n` +
    `The link works for 48 hours. If you didn't sign up, ignore this email.`);
  const sendReset = (req, u) => sendEmail(u.email, 'Reset your Crowd QR Games password',
    `Hi,\n\nReset your password here:\n\n${baseUrl(req)}/reset?t=${sign({ p: 'reset', u: u.id, h: passTag(u), e: Date.now() + 3600_000 })}\n\n` +
    `The link works for 1 hour. If you didn't ask for this, ignore this email.`);

  // ---- simple per-IP limits ----
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.until < now) hits.delete(k); }, 600_000).unref();
  const ipOf = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const limited = (req, kind, max, ms) => {
    const k = `${kind}:${ipOf(req)}`;
    const h = hits.get(k);
    if (!h || h.until < Date.now()) { hits.set(k, { n: 1, until: Date.now() + ms }); return false; }
    return ++h.n > max;
  };

  // ---- Stripe ----
  const periodEnd = (sub) => sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  async function syncSubscription(sub, userId) {
    const u = (userId && await store.getUser(userId)) || (await store.getUserByCustomer(sub.customer));
    if (!u) return console.warn('Stripe subscription for an unknown customer', sub.id);
    // A late event for an old subscription mustn't overwrite a newer live one.
    if (u.sub_id && u.sub_id !== sub.id && LIVE_SUB.includes(u.sub_status) && !LIVE_SUB.includes(sub.status)) return;
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
    await store.updateUser(u.id, {
      stripe_customer_id: sub.customer,
      sub_id: sub.id,
      sub_status: sub.status,
      sub_plan: sub.metadata?.plan || (interval === 'year' ? 'yearly' : 'monthly'),
      sub_period_end: periodEnd(sub) ? new Date(periodEnd(sub) * 1000) : null,
    });
  }
  async function applyCheckout(session) {
    if (session.payment_status !== 'paid') return;
    const userId = Number(session.metadata?.user_id || session.client_reference_id);
    const plan = session.metadata?.plan;
    const u = userId && await store.getUser(userId);
    if (!u || !PLANS[plan]) return console.warn('Stripe checkout with no matching account', session.id);
    if (session.customer && session.customer !== u.stripe_customer_id) await store.updateUser(u.id, { stripe_customer_id: session.customer });
    if (plan === 'pass') {
      if (!(await store.recordPayment(session.id, u.id, plan))) return; // already counted
      const from = Math.max(Date.now(), u.pass_until ? +new Date(u.pass_until) : 0);
      await store.updateUser(u.id, { pass_until: new Date(from + DAY) });
    } else if (session.subscription) {
      await store.recordPayment(session.id, u.id, plan);
      const sub = typeof session.subscription === 'string' ? await stripe.subscriptions.retrieve(session.subscription) : session.subscription;
      await syncSubscription(sub, u.id);
    }
  }
  async function handleStripeEvent(event) {
    const o = event.data.object;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await applyCheckout(o);
    else if (event.type.startsWith('customer.subscription.')) await syncSubscription(o, Number(o.metadata?.user_id) || 0);
  }

  // ---- routes ----
  function install(app) {
    const form = express.urlencoded({ extended: false, limit: '4kb' });
    // Forms only post from our own pages.
    const sameOrigin = (req, res, next) => {
      const o = req.headers.origin;
      if (o && o !== 'null' && new URL(o).host !== (req.headers['x-forwarded-host'] || req.headers.host)) return res.status(403).send('Bad origin');
      next();
    };
    const wrap = (fn) => (req, res, next) => ready.then(() => fn(req, res, next)).catch(next);
    const withUser = (fn) => wrap(async (req, res) => fn(req, res, await userFromCookie(req.headers.cookie)));

    // Stripe needs the raw body to check the signature, so this sits before any body parser.
    app.post('/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }), wrap(async (req, res) => {
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe not set up');
      let event;
      try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); } catch (e) { return res.status(400).send(`Bad signature: ${e.message}`); }
      await handleStripeEvent(event);
      res.json({ received: true });
    }));

    app.get('/auth/status', withUser((_req, res, u) => {
      const a = access(u);
      res.json({ accounts: SIGNUPS_OPEN, loggedIn: !!u, access: a.ok, plan: a.plan || null, payments: !!stripe });
    }));

    const signupForm = (msg = '', email = '') => page('Start your free trial', `
      <h2>Start your free trial</h2>
      <p class="muted">${TRIAL_MS / DAY} days of every game, free. No card needed. Guests never need an account: they join with the room code.</p>
      ${note(msg)}
      <form method="post" action="/signup">
        <input type="email" name="email" placeholder="Email" autocomplete="email" required value="${esc(email)}" aria-label="Email" />
        <input type="password" name="password" placeholder="Password (8+ characters)" autocomplete="new-password" minlength="8" required aria-label="Password" />
        <button class="primary big-btn">Create account</button>
      </form>
      <p class="muted small">Already have an account? <a href="/login">Log in</a></p>`);

    app.get('/signup', withUser((_req, res, u) => (u ? res.redirect('/account') : res.send(signupForm()))));
    app.post('/signup', sameOrigin, form, wrap(async (req, res) => {
      const email = String(req.body?.email || '').trim();
      const password = String(req.body?.password || '');
      if (limited(req, 'signup', 10, 3600_000)) return res.status(429).send(signupForm('Too many sign-ups from here. Try again later.', email));
      if (!validEmail(email)) return res.status(400).send(signupForm("That email doesn't look right.", email));
      if (password.length < 8 || password.length > 200) return res.status(400).send(signupForm('Use a password of at least 8 characters.', email));
      const key = emailKey(email);
      if (!SIGNUPS_OPEN && !ADMINS.has(key)) return res.status(403).send(signupForm("Sign-ups aren't open yet. Check back soon!", email));
      const u = await store.createUser({ email, email_key: key, pass_hash: hashPassword(password) });
      if (!u) return res.status(409).send(signupForm('That email already has an account (each email gets one free trial). Log in instead, or reset your password.', email));
      await sendVerify(req, u);
      setSession(req, res, u);
      res.redirect('/account');
    }));

    const loginForm = (msg = '', next = '/host', email = '', ok = '') => page('Log in', `
      <h2>Host login</h2>
      ${note(msg)}${note(ok, 'ok')}
      <form method="post" action="/login">
        <input type="email" name="email" placeholder="Email" autocomplete="email" required value="${esc(email)}" aria-label="Email" />
        <input type="password" name="password" placeholder="Password" autocomplete="current-password" required aria-label="Password" />
        <input type="hidden" name="next" value="${esc(next)}" />
        <button class="primary big-btn">Log in</button>
      </form>
      <p class="muted small"><a href="/forgot">Forgot password?</a> · New here? <a href="/signup">Start a free trial</a></p>`);

    app.get('/login', withUser((req, res, u) => {
      const next = safeNext(req.query.next);
      if (u) return res.redirect(next);
      res.send(loginForm('', next, '', req.query.reset ? 'Password changed. Log in with your new one.' : ''));
    }));
    app.post('/login', sameOrigin, form, wrap(async (req, res) => {
      const email = String(req.body?.email || '').trim();
      const next = safeNext(req.body?.next);
      if (limited(req, 'login', 10, 600_000)) return res.status(429).send(loginForm('Too many tries. Wait a few minutes and try again.', next, email));
      const u = await store.getUserByKey(emailKey(email));
      if (!u || !checkPassword(req.body?.password || '', u.pass_hash)) return res.status(401).send(loginForm("That email and password don't match.", next, email));
      setSession(req, res, u);
      res.redirect(next);
    }));
    app.get('/logout', (_req, res) => { clearSession(res); res.redirect('/'); });

    app.get('/verify', wrap(async (req, res) => {
      const t = unsign(req.query.t);
      const u = t?.p === 'verify' && await store.getUser(t.u);
      if (!u) return res.status(400).send(page('Link expired', '<h2>That link has expired</h2><p class="muted">Log in and we\'ll send you a new one.</p><a href="/account"><button class="primary big-btn">Go to my account</button></a>'));
      if (!u.verified_at) {
        const now = Date.now();
        await store.updateUser(u.id, { verified_at: new Date(now), trial_ends_at: u.trial_ends_at || new Date(now + TRIAL_MS) });
      }
      setSession(req, res, u);
      res.redirect('/account?welcome=1');
    }));
    app.post('/verify/resend', sameOrigin, withUser(async (req, res, u) => {
      if (!u) return res.redirect('/login?next=/account');
      if (!u.verified_at && !limited(req, 'resend', 5, 3600_000)) await sendVerify(req, u);
      res.redirect('/account?sent=1');
    }));

    const forgotForm = (msg = '', ok = '') => page('Reset password', `
      <h2>Reset your password</h2>
      ${note(msg)}${note(ok, 'ok')}
      <form method="post" action="/forgot">
        <input type="email" name="email" placeholder="Email" autocomplete="email" required aria-label="Email" />
        <button class="primary big-btn">Email me a link</button>
      </form>
      <p class="muted small"><a href="/login">Back to log in</a></p>`);
    app.get('/forgot', (_req, res) => res.send(forgotForm()));
    app.post('/forgot', sameOrigin, form, wrap(async (req, res) => {
      if (limited(req, 'forgot', 5, 3600_000)) return res.status(429).send(forgotForm('Too many tries. Try again later.'));
      const u = await store.getUserByKey(emailKey(req.body?.email));
      if (u) await sendReset(req, u);
      res.send(forgotForm('', "If that email has an account, we've sent it a reset link."));
    }));
    const resetUser = async (tok) => {
      const t = unsign(tok);
      const u = t?.p === 'reset' && await store.getUser(t.u);
      return u && t.h === passTag(u) ? u : null;
    };
    const resetForm = (tok, msg = '') => page('New password', `
      <h2>Choose a new password</h2>
      ${note(msg)}
      <form method="post" action="/reset">
        <input type="password" name="password" placeholder="New password (8+ characters)" autocomplete="new-password" minlength="8" required aria-label="New password" />
        <input type="hidden" name="t" value="${esc(tok)}" />
        <button class="primary big-btn">Save password</button>
      </form>`);
    const expired = () => page('Link expired', '<h2>That link has expired</h2><p class="muted"><a href="/forgot">Ask for a new one</a>.</p>');
    app.get('/reset', wrap(async (req, res) => ((await resetUser(req.query.t)) ? res.send(resetForm(req.query.t)) : res.status(400).send(expired()))));
    app.post('/reset', sameOrigin, form, wrap(async (req, res) => {
      const u = await resetUser(req.body?.t);
      if (!u) return res.status(400).send(expired());
      const pw = String(req.body?.password || '');
      if (pw.length < 8 || pw.length > 200) return res.status(400).send(resetForm(req.body.t, 'Use a password of at least 8 characters.'));
      // Changing the password logs out every other device. Following the link also proves the email.
      const patch = { pass_hash: hashPassword(pw), session_ver: (u.session_ver || 0) + 1 };
      if (!u.verified_at) Object.assign(patch, { verified_at: new Date(), trial_ends_at: u.trial_ends_at || new Date(Date.now() + TRIAL_MS) });
      await store.updateUser(u.id, patch);
      clearSession(res);
      res.redirect('/login?reset=1');
    }));

    app.get('/account', withUser((req, res, u) => {
      if (!u) return res.redirect('/login?next=/account');
      const a = access(u);
      let status;
      if (a.reason === 'verify') {
        status = `<h2>Check your email</h2>
          <p class="muted">We sent a link to <b>${esc(u.email)}</b>. Click it to start your ${TRIAL_MS / DAY}-day free trial.</p>
          ${req.query.sent ? note('Sent again. It can take a minute, and check your spam folder.', 'ok') : ''}
          <form method="post" action="/verify/resend"><button class="big-btn">Send the link again</button></form>`;
      } else if (a.ok) {
        const until = a.until ? (a.sub ? `Renews ${fmtDate(a.until)}` : `Until ${fmtDate(a.until)}`) : '';
        status = `<h2>${req.query.welcome ? "You're in! 🎉" : req.query.paid ? 'Thanks, payment received 🎉' : 'Your account'}</h2>
          <p class="acct-plan"><b>${esc(PLAN_LABEL[a.plan] || a.plan)}</b>${until ? ` <span class="muted">· ${esc(until)}</span>` : ''}</p>
          <a href="/host"><button class="primary big-btn">Host a game</button></a>`;
      } else {
        status = `<h2>Your ${u.pass_until || u.sub_id ? 'access has' : 'free trial has'} ended</h2>
          <p class="muted">Pick a plan to keep hosting. Your guests still join free.</p>`;
      }
      const choose = !a.sub && a.plan !== 'complimentary' && a.reason !== 'verify';
      const plans = !choose ? '' : !stripe ? '<p class="muted small">Payments are coming soon.</p>' : `
        <div class="acct-plans">
          ${a.ok ? '<p class="muted small">Buy now or when your access runs out:</p>' : ''}
          <form method="post" action="/billing/checkout"><input type="hidden" name="plan" value="pass" /><button class="big-btn">🎟️ Event pass · £9.99 for 24h</button></form>
          <form method="post" action="/billing/checkout"><input type="hidden" name="plan" value="monthly" /><button class="primary big-btn">⭐ Monthly · £12.99 a month</button></form>
          <form method="post" action="/billing/checkout"><input type="hidden" name="plan" value="yearly" /><button class="big-btn">📅 Yearly · £129 a year</button></form>
        </div>`;
      const manage = stripe && u.stripe_customer_id && u.sub_id
        ? '<form method="post" action="/billing/portal"><button class="big-btn">Manage subscription or card</button></form>' : '';
      res.send(page('Account', `${status}${note(req.query.err)}${plans}${manage}
        <p class="muted small">${esc(u.email)} · <a href="/logout">Log out</a></p>`));
    }));

    app.post('/billing/checkout', sameOrigin, form, withUser(async (req, res, u) => {
      if (!u) return res.redirect('/login?next=/account');
      const plan = PLANS[req.body?.plan];
      if (!stripe || !plan) return res.redirect('/account');
      if (!u.verified_at) return res.redirect('/account');
      if (plan.mode === 'subscription' && access(u).sub) return res.redirect('/account');
      const base = baseUrl(req);
      const item = plan.price ? { price: plan.price, quantity: 1 } : {
        quantity: 1,
        price_data: {
          currency: 'gbp', unit_amount: plan.amount, product_data: { name: `Crowd QR Games · ${plan.name}` },
          ...(plan.interval ? { recurring: { interval: plan.interval } } : {}),
        },
      };
      const meta = { user_id: String(u.id), plan: req.body.plan };
      const session = await stripe.checkout.sessions.create({
        mode: plan.mode,
        line_items: [item],
        success_url: `${base}/billing/done?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/account`,
        client_reference_id: String(u.id),
        metadata: meta,
        ...(u.stripe_customer_id ? { customer: u.stripe_customer_id } : { customer_email: u.email }),
        ...(plan.mode === 'payment'
          ? { invoice_creation: { enabled: true }, ...(u.stripe_customer_id ? {} : { customer_creation: 'always' }) }
          : { subscription_data: { metadata: meta } }),
        allow_promotion_codes: true,
      });
      res.redirect(303, session.url);
    }));

    // Stripe sends people back here. Apply the payment straight away in case the webhook is slow.
    app.get('/billing/done', withUser(async (req, res, u) => {
      if (!u) return res.redirect('/login?next=/account');
      if (stripe && /^cs_[\w]+$/.test(req.query.session_id || '')) {
        try {
          const s = await stripe.checkout.sessions.retrieve(req.query.session_id);
          if (Number(s.metadata?.user_id) === u.id) await applyCheckout(s);
        } catch (e) { console.error('Checkout lookup failed:', e.message); }
      }
      res.redirect('/account?paid=1');
    }));

    app.post('/billing/portal', sameOrigin, withUser(async (req, res, u) => {
      if (!u) return res.redirect('/login?next=/account');
      if (!stripe || !u.stripe_customer_id) return res.redirect('/account');
      try {
        const p = await stripe.billingPortal.sessions.create({ customer: u.stripe_customer_id, return_url: `${baseUrl(req)}/account` });
        res.redirect(303, p.url);
      } catch (e) {
        console.error('Billing portal failed:', e.message);
        res.redirect('/account?err=' + encodeURIComponent("Couldn't open billing just now. Try again in a minute."));
      }
    }));
  }

  return { enabled: true, store, outbox, install, userFromCookie, access, handleStripeEvent, sign, emailKey };
}

module.exports = { createAccounts, emailKey, PLANS };
