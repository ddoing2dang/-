const {contextBridge,ipcRenderer}=require('electron');
const listen=(channel,callback)=>{if(typeof callback!=='function')return ()=>{};const listener=(_event,value)=>callback(value);ipcRenderer.on(channel,listener);return ()=>ipcRenderer.removeListener(channel,listener);};
contextBridge.exposeInMainWorld('MattoDesktop',Object.freeze({
 version:1,
 miniVersion:2,
 toggleMainWindow:()=>ipcRenderer.invoke('matto:main-toggle'),
 publishMini:payload=>ipcRenderer.invoke('matto:mini-publish',payload),
 toggleMini:()=>ipcRenderer.invoke('matto:mini-toggle'),
 showMini:ref=>ipcRenderer.invoke('matto:mini-show',ref),
 getMini:()=>ipcRenderer.invoke('matto:mini-get'),
 closeMini:()=>ipcRenderer.invoke('matto:mini-close'),
 selectDeck:ref=>ipcRenderer.invoke('matto:mini-select',ref),
 configureMini:settings=>ipcRenderer.invoke('matto:mini-configure',settings),
 onMiniState:callback=>listen('matto:mini-state',callback),
 onMiniData:callback=>listen('matto:mini-data',callback)
}));
