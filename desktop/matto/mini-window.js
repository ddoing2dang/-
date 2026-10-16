const {BrowserWindow,ipcMain,screen}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{fileURLToPath}=require('node:url');

module.exports=function createMiniController(getMain){
 let mini=null,payload=null,selected='',timer,topTimer,writing=Promise.resolve();
 let settings={pinned:true,opacity:1,expanded:false,collapsed:false};
 const webRoot=path.join(__dirname,'web');
 const settingsPath=path.join(require('electron').app.getPath('userData'),'mini-window.json');
 function permitted(event,role){
  const target=role==='main'?getMain():mini;
  if(!target||target.isDestroyed()||event.sender!==target.webContents||event.senderFrame!==target.webContents.mainFrame)return false;
  try{return fileURLToPath(event.senderFrame.url)===path.join(webRoot,role==='main'?'index.html':'pc-mini.html');}catch{return false;}
 }
 function state(){return {visible:!!mini&&!mini.isDestroyed()&&mini.isVisible(),...settings};}
 function send(channel,value){for(const w of [getMain(),mini])if(w&&!w.isDestroyed())w.webContents.send(channel,value);}
 function announce(){send('matto:mini-state',state());}
 function data(){return payload?{...payload,selectedRef:selected,settings:state()}:null;}
 function save(){clearTimeout(timer);timer=setTimeout(()=>{const value=JSON.stringify(settings);writing=writing.then(()=>fs.writeFile(settingsPath,value)).catch(()=>{});},200);}
 function clampBounds(bounds){
  const area=screen.getDisplayMatching(bounds).workArea;
  const width=Math.min(bounds.width,area.width),height=Math.min(bounds.height,area.height);
  return {width,height,x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))};
 }
 function resize(){
  if(!mini||mini.isDestroyed())return;
  const old=mini.getBounds();
  const width=settings.expanded&&!settings.collapsed?760:344;
  const height=settings.collapsed?36:settings.expanded?620:158;
  // Expand toward the available side, keeping the whole window on its display.
  mini.setBounds(clampBounds({...old,width,height}));
 }
 function resetPosition(){
  if(!mini||mini.isDestroyed())return;
  const area=screen.getPrimaryDisplay().workArea;
  const width=Math.min(settings.expanded&&!settings.collapsed?760:344,area.width);
  const height=Math.min(settings.collapsed?36:settings.expanded?620:158,area.height);
  mini.setBounds({width,height,x:Math.max(area.x,area.x+area.width-width-24),y:Math.min(area.y+24,area.y+area.height-height)});
 }
 function enforceTop(){
  if(!mini||mini.isDestroyed()||!mini.isVisible())return;
  mini.setAlwaysOnTop(true,'screen-saver');
  mini.moveTop(); // Changes z-order without taking keyboard focus from the game.
 }
 function keepTop(){
  clearInterval(topTimer);enforceTop();
  topTimer=setInterval(enforceTop,2000);
 }
 function hide(){clearInterval(topTimer);if(mini&&!mini.isDestroyed())mini.hide();announce();return state();}
 async function show(ref){
  if(!payload?.decks?.length)throw Error('추천덱을 먼저 불러와 주세요.');
  if(typeof ref==='string'&&payload.decks.some(d=>d.ref===ref))selected=ref;
  if(!payload.decks.some(d=>d.ref===selected))selected=payload.decks[0].ref;
  if(!mini||mini.isDestroyed()){
   const area=screen.getPrimaryDisplay().workArea;
   mini=new BrowserWindow({width:344,height:158,x:area.x+area.width-368,y:area.y+24,frame:false,resizable:false,maximizable:false,fullscreenable:false,show:false,skipTaskbar:true,alwaysOnTop:true,title:'마또 미니 도우미',backgroundColor:'#fff7f1',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
   mini.setMenu(null);mini.setOpacity(settings.opacity);mini.setAlwaysOnTop(true,'screen-saver');
   mini.on('blur',enforceTop);mini.on('restore',enforceTop);
   mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   mini.webContents.on('will-navigate',event=>event.preventDefault());
   mini.webContents.on('render-process-gone',()=>{clearInterval(topTimer);const broken=mini;mini=null;if(broken&&!broken.isDestroyed())broken.destroy();announce();});
   mini.on('close',event=>{event.preventDefault();hide();});
   const created=mini;
   created.once('ready-to-show',()=>{if(created.isDestroyed()||created!==mini)return;resetPosition();created.showInactive();keepTop();send('matto:mini-data',data());announce();});
   try{await created.loadFile(path.join(webRoot,'pc-mini.html'));}catch(error){clearInterval(topTimer);if(!created.isDestroyed())created.destroy();if(mini===created)mini=null;announce();throw error;}
  }else{if(!mini.isVisible())resetPosition();else resize();mini.showInactive();keepTop();send('matto:mini-data',data());announce();}
  return state();
 }
 function handle(channel,role,fn){ipcMain.handle(channel,(event,value)=>{if(!permitted(event,role))throw Error('허용되지 않은 창 요청입니다.');return fn(value);});}
 handle('matto:mini-publish','main',next=>{
  if(!next||!Array.isArray(next.decks)||next.decks.length!==15||JSON.stringify(next).length>1500000||next.decks.some(d=>typeof d.ref!=='string'||typeof d.title!=='string'||!Array.isArray(d.units)||d.units.length>28))throw Error('미니 창 데이터 형식 오류');
  payload=next;
  if(next.selectedRef&&next.decks.some(d=>d.ref===next.selectedRef))selected=next.selectedRef;
  if(!next.decks.some(d=>d.ref===selected))selected=next.decks[0].ref;
  send('matto:mini-data',data());return state();
 });
 handle('matto:mini-toggle','main',()=>mini?.isVisible()?hide():show());
 handle('matto:mini-show','main',ref=>show(ref));
 ipcMain.handle('matto:mini-get',event=>{if(!permitted(event,'main')&&!permitted(event,'mini'))throw Error('허용되지 않은 창 요청입니다.');return {state:state(),data:data()};});
 handle('matto:mini-close','mini',hide);
 handle('matto:mini-select','mini',ref=>{if(payload?.decks.some(d=>d.ref===ref)){selected=ref;send('matto:mini-data',data());}return state();});
 handle('matto:mini-configure','mini',next=>{
  if(!next||typeof next!=='object')return state();
  for(const key of ['expanded','collapsed'])if(typeof next[key]==='boolean')settings[key]=next[key];
  if(Number.isFinite(next.opacity))settings.opacity=Math.max(.65,Math.min(1,next.opacity));
  if(mini&&!mini.isDestroyed()){mini.setAlwaysOnTop(true,'screen-saver');enforceTop();mini.setOpacity(settings.opacity);resize();}
  save();announce();return state();
 });
 return {
  async load(){try{const saved=JSON.parse(await fs.readFile(settingsPath,'utf8'));for(const key of ['expanded','collapsed'])if(typeof saved[key]==='boolean')settings[key]=saved[key];if(Number.isFinite(saved.opacity))settings.opacity=Math.max(.65,Math.min(1,saved.opacity));}catch{}},
  destroy(){clearTimeout(timer);clearInterval(topTimer);if(mini&&!mini.isDestroyed())mini.destroy();mini=null;announce();}
 };
};
