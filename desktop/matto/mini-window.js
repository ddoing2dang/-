const {BrowserWindow,ipcMain,screen}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{fileURLToPath}=require('node:url');

module.exports=function createMiniController(getMain){
 let mini=null,payload=null,selected='',timer,writing=Promise.resolve();
 let wantedVisible=false,ready=false,recoveryTimer,recoveryAvailable=false;
 let settings={pinned:true,opacity:1,expanded:false,collapsed:false};
 const webRoot=path.join(__dirname,'web');
 const settingsPath=path.join(require('electron').app.getPath('userData'),'mini-window.json');
 function permitted(event,role){
  const target=role==='main'?getMain():mini;
  if(!target||target.isDestroyed()||event.sender!==target.webContents||event.senderFrame!==target.webContents.mainFrame)return false;
  try{return fileURLToPath(event.senderFrame.url)===path.join(webRoot,role==='main'?'index.html':'pc-mini.html');}catch{return false;}
 }
 function alive(){return mini&&!mini.isDestroyed();}
 function state(){return {...settings,visible:!!alive()&&mini.isVisible()&&!mini.isMinimized(),pinned:alive()?mini.isAlwaysOnTop():settings.pinned};}
 function send(channel,value){for(const w of [getMain(),mini])if(w&&!w.isDestroyed())w.webContents.send(channel,value);}
 function announce(){send('matto:mini-state',state());}
 function data(){return payload?{...payload,selectedRef:selected,settings:state()}:null;}
 function save(){clearTimeout(timer);timer=setTimeout(()=>{const value=JSON.stringify(settings);writing=writing.then(()=>fs.writeFile(settingsPath,value)).catch(()=>{});},200);}
 function dimensions(){return {width:settings.expanded&&!settings.collapsed?760:344,height:settings.collapsed?36:settings.expanded?620:158};}
 function clampBounds(bounds,area){
  const width=Math.min(bounds.width,area.width),height=Math.min(bounds.height,area.height);
  return {width,height,x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))};
 }
 function resize(){
  if(!alive())return;
  const old=mini.getBounds();
  // Choose the current monitor BEFORE expanding; the enlarged rectangle may overlap another monitor.
  const area=screen.getDisplayMatching(old).workArea;
  const next=clampBounds({...old,...dimensions()},area);
  if(['x','y','width','height'].some(k=>old[k]!==next[k]))mini.setBounds(next);
 }
 function resetPosition(){
  if(!alive())return;
  const area=screen.getPrimaryDisplay().workArea,d=dimensions();
  mini.setBounds(clampBounds({...d,x:area.x+area.width-d.width-24,y:area.y+24},area));
 }
 function applyPin(){if(alive()&&mini.isAlwaysOnTop()!==settings.pinned)mini.setAlwaysOnTop(settings.pinned);}
 function present(reset){
  if(!alive()||!ready||!wantedVisible)return;
  if(mini.isMinimized())mini.restore();
  if(reset)resetPosition();else resize();
  applyPin();mini.showInactive();send('matto:mini-data',data());announce();
 }
 function recoverUnexpectedVisibility(){
  announce();
  // One recovery per explicit opening or interaction, never a polling/foreground loop.
  if(!wantedVisible||!ready||!alive()||!recoveryAvailable||recoveryTimer)return;
  recoveryAvailable=false;
  const target=mini;
  recoveryTimer=setTimeout(()=>{
   recoveryTimer=null;
   if(wantedVisible&&target===mini&&alive()&&(!mini.isVisible()||mini.isMinimized()))present(false);
  },120);
 }
 function hide(){wantedVisible=false;recoveryAvailable=false;clearTimeout(recoveryTimer);recoveryTimer=null;if(alive())mini.hide();announce();return state();}
 async function show(ref){
  if(!payload?.decks?.length)throw Error('추천덱을 먼저 불러와 주세요.');
  wantedVisible=true;recoveryAvailable=true;
  clearTimeout(recoveryTimer);recoveryTimer=null;
  if(typeof ref==='string'&&payload.decks.some(d=>d.ref===ref))selected=ref;
  if(!payload.decks.some(d=>d.ref===selected))selected=payload.decks[0].ref;
  if(!alive()){
   ready=false;
   const area=screen.getPrimaryDisplay().workArea;
   // Independent toolbar, not owned by the main window; retain mouse/keyboard interaction.
   mini=new BrowserWindow({width:344,height:158,x:area.x+area.width-368,y:area.y+24,type:'toolbar',parent:null,modal:false,frame:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,focusable:true,show:false,skipTaskbar:true,alwaysOnTop:settings.pinned,title:'마또 미니 도우미',backgroundColor:'#fff7f1',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
   const created=mini;
   created.setMenu(null);created.setOpacity(settings.opacity);
   created.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   created.webContents.on('will-navigate',event=>event.preventDefault());
   created.webContents.on('render-process-gone',()=>{
    if(mini!==created)return;
    wantedVisible=false;ready=false;clearTimeout(recoveryTimer);recoveryTimer=null;mini=null;
    if(!created.isDestroyed())created.destroy();announce();
   });
   created.on('close',event=>{event.preventDefault();hide();});
   created.on('hide',recoverUnexpectedVisibility);created.on('minimize',recoverUnexpectedVisibility);
   created.on('show',announce);created.on('restore',announce);created.on('always-on-top-changed',announce);
   created.once('ready-to-show',()=>{if(created.isDestroyed()||created!==mini)return;ready=true;present(true);});
   try{await created.loadFile(path.join(webRoot,'pc-mini.html'));}catch(error){
    if(mini===created){wantedVisible=false;ready=false;clearTimeout(recoveryTimer);recoveryTimer=null;mini=null;}
    if(!created.isDestroyed())created.destroy();announce();throw error;
   }
  }else present(!mini.isVisible()||mini.isMinimized());
  return state();
 }
 function handle(channel,role,fn){ipcMain.handle(channel,(event,value)=>{if(!permitted(event,role))throw Error('허용되지 않은 창 요청입니다.');if(role==='mini'&&state().visible)recoveryAvailable=true;return fn(value);});}
 handle('matto:mini-publish','main',next=>{
  if(!next||!Array.isArray(next.decks)||next.decks.length!==15||JSON.stringify(next).length>1500000||next.decks.some(d=>typeof d.ref!=='string'||typeof d.title!=='string'||!Array.isArray(d.units)||d.units.length>28))throw Error('미니 창 데이터 형식 오류');
  payload=next;
  if(next.selectedRef&&next.decks.some(d=>d.ref===next.selectedRef))selected=next.selectedRef;
  if(!next.decks.some(d=>d.ref===selected))selected=next.decks[0].ref;
  send('matto:mini-data',data());return state();
 });
 handle('matto:mini-toggle','main',()=>state().visible?hide():show());
 handle('matto:mini-show','main',ref=>show(ref));
 ipcMain.handle('matto:mini-get',event=>{if(!permitted(event,'main')&&!permitted(event,'mini'))throw Error('허용되지 않은 창 요청입니다.');return {state:state(),data:data()};});
 handle('matto:mini-close','mini',hide);
 handle('matto:mini-select','mini',ref=>{if(payload?.decks.some(d=>d.ref===ref)){selected=ref;send('matto:mini-data',data());}return state();});
 handle('matto:mini-configure','mini',next=>{
  if(!next||typeof next!=='object')return state();
  const before={...settings};
  for(const key of ['pinned','expanded','collapsed'])if(typeof next[key]==='boolean')settings[key]=next[key];
  if(Number.isFinite(next.opacity))settings.opacity=Math.max(.65,Math.min(1,next.opacity));
  if(alive()){
   if(before.pinned!==settings.pinned)applyPin();
   if(before.opacity!==settings.opacity)mini.setOpacity(settings.opacity);
   if(before.expanded!==settings.expanded||before.collapsed!==settings.collapsed)resize();
  }
  save();announce();return state();
 });
 const displayChanged=()=>{if(alive()&&ready&&wantedVisible)resize();};
 screen.on('display-removed',displayChanged);screen.on('display-metrics-changed',displayChanged);
 return {
  async load(){try{const saved=JSON.parse(await fs.readFile(settingsPath,'utf8'));for(const key of ['pinned','expanded','collapsed'])if(typeof saved[key]==='boolean')settings[key]=saved[key];if(Number.isFinite(saved.opacity))settings.opacity=Math.max(.65,Math.min(1,saved.opacity));}catch{}},
  destroy(){wantedVisible=false;ready=false;clearTimeout(timer);clearTimeout(recoveryTimer);recoveryTimer=null;screen.removeListener('display-removed',displayChanged);screen.removeListener('display-metrics-changed',displayChanged);if(alive())mini.destroy();mini=null;announce();}
 };
};
