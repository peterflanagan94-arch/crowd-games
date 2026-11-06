// Gives the app's own sign-in page two calls into the app. Web pages (the host screen and
// anything it opens) get nothing.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('crowd', {
    signIn: (email, password) => ipcRenderer.invoke('signin', { email, password }),
    openSite: (route) => ipcRenderer.invoke('open-site', route),
  });
}
