const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const APP_URL = 'https://tft-matto-board.dm26754899.chatgpt.site/';
const HOST = new URL(APP_URL).hostname;
function external(url) { try { const u=new URL(url); if(u.protocol==='https:'||u.protocol==='mailto:')shell.openExternal(url); } catch {} }
function createWindow(){
 const win=new BrowserWindow({width:1440,height:940,minWidth:960,minHeight:650,title:'TFT 마또 스튜디오',backgroundColor:'#ede5e1',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'}});
 win.webContents.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(u.protocol==='https:'&&u.hostname===HOST)return}catch{}event.preventDefault();external(url)});
 win.webContents.on('did-fail-load',(event,code,description,url,isMainFrame)=>{if(!isMainFrame||code===-3)return;win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html lang="ko"><meta charset="utf-8"><title>연결 오류</title><body style="font:18px system-ui;background:#292329;color:white;text-align:center;padding:15vh 20px"><h1>마또 스튜디오에 연결할 수 없습니다</h1><p>인터넷 연결을 확인한 뒤 Ctrl+R로 다시 시도하세요.</p></body></html>'))});
 win.loadURL(APP_URL);
}
app.whenReady().then(()=>{app.setAppUserModelId('gg.tft.muse.studio');app.setPath('userData',path.join(app.getPath('appData'),'TFT Muse Studio'));createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow()})});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
