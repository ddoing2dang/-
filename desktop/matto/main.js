const {app, BrowserWindow, shell, protocol, Notification} = require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{fileURLToPath}=require('node:url');
let activeWeb=path.join(__dirname,'web'),mainWindow=null,miniController=null;
if(!app.requestSingleInstanceLock())app.quit();
const APP_URL = 'https://matto-restored-pc.dm26754899.chatgpt.site/';
const APP_HOST = new URL(APP_URL).hostname;
const LOGIN_HOSTS = ['chatgpt.com', 'openai.com'];
function trustedLogin(url) {
  try {
    const parsed = new URL(url);
    if (url === require('url').pathToFileURL(require('path').join(__dirname,'web/index.html')).href) return true;
    return parsed.protocol === 'https:' && (parsed.hostname === APP_HOST || LOGIN_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host)));
  } catch { return false; }
}
function openExternal(url) {
  try { const parsed = new URL(url); if (['https:', 'mailto:'].includes(parsed.protocol)) shell.openExternal(url); } catch {}
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1024, minHeight: 680,
    title: '마또 도우미', icon: require('path').join(__dirname, 'icon.ico'), backgroundColor: '#f7f4f1',
    autoHideMenuBar: true,
    webPreferences: { preload:path.join(__dirname,'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  mainWindow=win;
  win.on('closed',()=>{miniController?.destroy();mainWindow=null;});
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
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>연결 오류</title><style>body{font:18px system-ui;background:#f7f4f1;color:#2b2029;display:grid;place-items:center;min-height:90vh;text-align:center}a{color:#f7d27e}</style><main><h1>배치툴에 연결할 수 없습니다</h1><p>인터넷 연결을 확인한 뒤 다시 시도하세요.</p><a href="${safe}">다시 연결</a></main></html>`));
  });
  win.loadFile(require('path').join(__dirname, 'web/index.html'));
}
app.whenReady().then(async () => {
  app.setAppUserModelId('gg.tft.matto.desktop');
  const updates=require('./web-updates')(path.join(app.getPath('userData'),'web-updates'));
  let opened=false;
  const pending=updates.refresh().then(changed=>{
    if(changed&&opened&&Notification.isSupported())new Notification({title:'마또 도우미',body:'화면 업데이트 완료 · 앱을 완전히 종료 후 다시 열면 적용됩니다.'}).show();
  }).catch(()=>{});
  let timer;await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(resolve,6000);})]);clearTimeout(timer);
  const downloaded=await updates.current();
  if(downloaded){try{await Promise.all(['desktop-tools.js','pc-mini.html','pc-mini.js','pc-mini.css'].map(name=>fs.access(path.join(downloaded,name))));activeWeb=downloaded;}catch{ /* Use the bundled 1.7 UI when an older cached snapshot is missing mini assets. */ }}
  // Keep the original file URL and localStorage while serving one complete snapshot.
  protocol.handle('file',async request=>{
    try{
      const relative=path.relative(path.join(__dirname,'web'),fileURLToPath(request.url));
      if(!relative||relative.startsWith('..')||path.isAbsolute(relative))return new Response('',{status:403});
      const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
      return new Response(await fs.readFile(path.join(activeWeb,relative)),{headers:{'Content-Type':types[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-store'}});
    }catch{return new Response('',{status:404});}
  });
  miniController=require('./mini-window')(()=>mainWindow);
  await miniController.load();
  opened=true;createWindow();
  app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
});
app.on('second-instance',()=>{const win=mainWindow;if(win){if(win.isMinimized())win.restore();win.focus();}});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

