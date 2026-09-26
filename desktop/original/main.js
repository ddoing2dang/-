const {app, BrowserWindow, shell} = require('electron');
const APP_URL = 'https://tft-deck-board-editor.dm26754899.chatgpt.site/';
const APP_HOST = new URL(APP_URL).hostname;
const LOGIN_HOSTS = ['chatgpt.com', 'openai.com'];
function trustedLogin(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === APP_HOST || LOGIN_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host)));
  } catch { return false; }
}
function openExternal(url) {
  try { const parsed = new URL(url); if (['https:', 'mailto:'].includes(parsed.protocol)) shell.openExternal(url); } catch {}
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1024, minHeight: 680,
    title: 'TFT 덱 가이드 배치툴', backgroundColor: '#090d24',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  win.webContents.setWindowOpenHandler(({url}) => {
    if (trustedLogin(url)) return {action: 'allow'};
    openExternal(url); return {action: 'deny'};
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!trustedLogin(url)) { event.preventDefault(); openExternal(url); }
  });
  win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    const safe = APP_URL;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>연결 오류</title><style>body{font:18px system-ui;background:#090d24;color:#fff;display:grid;place-items:center;min-height:90vh;text-align:center}a{color:#f7d27e}</style><main><h1>배치툴에 연결할 수 없습니다</h1><p>인터넷 연결을 확인한 뒤 다시 시도하세요.</p><a href="${safe}">다시 연결</a></main></html>`));
  });
  win.loadURL(APP_URL);
}
app.whenReady().then(() => { app.setAppUserModelId('gg.tft.deckguide.desktop'); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
