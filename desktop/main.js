// Crowd QR Games desktop app (Mac and Windows).
//
// Runs the same server as the website, on this laptop. The host screen opens in this
// window, and guests scan the QR code to join over the local Wi-Fi, so no internet is
// needed during the event. The DJ signs in once with their Crowd QR account; the offline
// pass that comes back keeps the app working for up to 30 days without internet, and it
// renews by itself whenever the laptop is online.
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');

const ONLINE = (process.env.CROWD_QR_URL || 'https://crowd-qr-games.onrender.com').replace(/\/$/, '');
const PORTS = [3000, 3001, 3002, 3003, 8080, 0]; // 3000 first so guests' links stay the same between gigs

process.env.CROWD_DESKTOP = '1';
// The website's account and Stripe settings never apply on a laptop.
delete process.env.DATABASE_URL;
delete process.env.ACCOUNTS;
delete process.env.HOST_PASSWORD;

const licence = require('../licence');
const { server } = require('../server');

if (!app.requestSingleInstanceLock()) app.quit();

const savedFile = () => path.join(app.getPath('userData'), 'licence.json');
const readSaved = () => { try { return JSON.parse(fs.readFileSync(savedFile(), 'utf8')); } catch { return {}; } };
const save = (d) => fs.writeFileSync(savedFile(), JSON.stringify(d), { mode: 0o600 });
let saved = {};
let port = 0;
let win = null;

function listen() {
  return new Promise((resolve, reject) => {
    const tryNext = (i) => {
      const p = PORTS[i];
      server.once('error', (e) => (e.code === 'EADDRINUSE' && i + 1 < PORTS.length ? tryNext(i + 1) : reject(e)));
      server.listen(p, '0.0.0.0', () => resolve(server.address().port));
    };
    tryNext(0);
  });
}

async function call(route, body) {
  const res = await fetch(ONLINE + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Sign-in failed (${res.status})`), { reason: data.reason, status: res.status });
  return data;
}

function useLicence(d) {
  if (!licence.verify(d.licence)) throw new Error('The server sent a pass this app could not check. Update the app and try again.');
  saved = { licence: d.licence, renew: d.renew, plan: d.plan, email: licence.verify(d.licence).email };
  save(saved);
  licence.setCurrent(saved.licence);
}

// Renew quietly whenever we can. Offline, the saved pass keeps working until it runs out.
async function renew() {
  if (!saved.renew) return;
  try { useLicence(await call('/desktop/renew', { renew: saved.renew })); }
  catch (e) {
    if (e.status === 401 || e.status === 403) {
      saved = {}; save(saved);
      // Keep any in-date pass running for tonight; ask to sign in once it lapses.
      if (e.status === 403) dialog.showMessageBox({ type: 'info', message: 'Crowd QR Games', detail: e.message });
    }
  }
}

const hostUrl = () => `http://localhost:${port}/host`;
function showHost() { win.loadURL(hostUrl()); }
function showSignIn(message = '') {
  win.loadFile(path.join(__dirname, 'signin.html'), { query: { msg: message, site: ONLINE } });
}

// Only the app's own sign-in page may call these.
const fromApp = (e) => String(e.senderFrame?.url || '').startsWith('file:');
ipcMain.handle('signin', async (e, { email, password } = {}) => {
  if (!fromApp(e)) return { error: 'Not allowed' };
  try {
    useLicence(await call('/desktop/signin', { email, password }));
    showHost();
    return { ok: true };
  } catch (e) {
    if (e.name === 'TimeoutError' || e.cause) return { error: "Couldn't reach Crowd QR Games. Connect to the internet to sign in (only needed the first time)." };
    return { error: e.message };
  }
});
ipcMain.handle('open-site', (e, route) => fromApp(e) && shell.openExternal(ONLINE + (String(route).startsWith('/') ? route : '/')));

function signOut() {
  saved = {}; save(saved);
  licence.setCurrent('');
  showSignIn('Signed out.');
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Host screen', accelerator: 'CmdOrCtrl+H', click: () => (licence.currentValid() ? showHost() : showSignIn()) },
        { role: 'reload' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Account',
      submenu: [
        { label: 'Manage account online…', click: () => shell.openExternal(ONLINE + '/account') },
        { label: 'Check my access now', click: async () => {
          await renew();
          const p = licence.currentValid();
          dialog.showMessageBox(win, { message: p ? `Signed in as ${p.email}` : 'Not signed in', detail: p ? `Works offline until ${new Date(p.exp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : '' });
        } },
        { type: 'separator' },
        { label: 'Sign out', click: signOut },
      ],
    },
    { role: 'windowMenu' },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 860, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b0b14',
    title: 'Crowd QR Games',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // Pop-outs from the host screen (the DJ's private YouTube player, the phone remote page)
  // open as app windows; anything else opens in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${port}/`) || url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 900, height: 560, backgroundColor: '#000', autoHideMenuBar: true } };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(`http://localhost:${port}/`) || url.startsWith('file:')) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  if (licence.currentValid()) showHost();
  else showSignIn(saved.licence ? 'Your offline pass has run out. Connect to the internet and sign in to carry on.' : '');
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  saved = readSaved();
  licence.setCurrent(saved.licence);
  try { port = await listen(); }
  catch (e) { dialog.showErrorBox('Crowd QR Games', `Couldn't start the game server: ${e.message}`); return app.quit(); }
  buildMenu();
  createWindow();
  renew();
  setInterval(renew, 6 * 3600_000);
});
