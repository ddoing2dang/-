'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const root=path.resolve('desktop/matto'),source=fs.readFileSync(path.join(root,'mini-window.js'),'utf8');
function harness(saved={pinned:true},deferred=false){
 const handlers={},jobs=new Map(),writes=[];let serial=0,lastWindow,finishLoad;
 const primary={x:0,y:0,width:1920,height:1040},left={x:-1280,y:0,width:1280,height:984};
 const screen=new EventEmitter();screen.getPrimaryDisplay=()=>({workArea:primary});screen.getDisplayMatching=b=>({workArea:b.x<0?left:primary});
 class Window extends EventEmitter{
  constructor(options){super();lastWindow=this;this.options=options;this.visible=false;this.minimized=false;this.dead=false;this.top=options.alwaysOnTop;this.bounds={x:options.x,y:options.y,width:options.width,height:options.height};this.boundChanges=0;this.showCount=0;this.webContents=new EventEmitter();this.webContents.mainFrame={url:pathToFileURL(path.join(root,'web/pc-mini.html')).href};this.messages=[];this.webContents.send=(channel,value)=>this.messages.push({channel,value});this.webContents.setWindowOpenHandler=()=>{};}
  isDestroyed(){return this.dead}isVisible(){return this.visible}isMinimized(){return this.minimized}isAlwaysOnTop(){return this.top}
  setAlwaysOnTop(value,level){assert.equal(level,undefined);this.top=value;this.emit('always-on-top-changed')}
  setMenu(){}setOpacity(v){this.opacity=v}getBounds(){return {...this.bounds}}setBounds(b){this.boundChanges++;this.bounds={...b}}
  showInactive(){this.showCount++;this.visible=true;this.emit('show')}hide(){this.visible=false;this.emit('hide')}
  restore(){this.minimized=false;this.emit('restore')}destroy(){this.dead=true;this.visible=false;this.emit('hide')}
  focus(){assert.fail('must not force focus')}moveTop(){assert.fail('must not force z-order')}
  async loadFile(){if(deferred)await new Promise(resolve=>{finishLoad=()=>{this.emit('ready-to-show');resolve()}});else this.emit('ready-to-show')}
 }
 const main=new EventEmitter();main.isDestroyed=()=>false;main.minimized=false;main.bounds={x:0,y:0};main.webContents={mainFrame:{url:pathToFileURL(path.join(root,'web/index.html')).href},send(){}};
 const electron={BrowserWindow:Window,screen,ipcMain:{handle:(channel,fn)=>handlers[channel]=fn},app:{getPath:()=>'/test'}};
 const context={module:{exports:{}},__dirname:root,require:name=>name==='electron'?electron:name==='node:fs/promises'?{readFile:async()=>JSON.stringify(saved),writeFile:async(_p,v)=>writes.push(JSON.parse(v))}:require(name),setTimeout:(fn,delay)=>{const id=++serial;jobs.set(id,{fn,delay});return id},clearTimeout:id=>jobs.delete(id),setInterval:()=>assert.fail('no periodic recovery allowed')};
 vm.runInNewContext(source,context);const controller=context.module.exports(()=>main);
 const invoke=(name,value,role='mini')=>{const w=role==='main'?main:lastWindow;return handlers['matto:mini-'+name]({sender:w.webContents,senderFrame:w.webContents.mainFrame},value)};
 return {controller,main,screen,jobs,writes,invoke,get window(){return lastWindow},finish:()=>finishLoad(),flush(delay){for(const [id,j]of [...jobs])if(j.delay===delay){jobs.delete(id);j.fn()}},async init(){await controller.load();await invoke('publish',{decks:Array.from({length:15},(_,i)=>({ref:String(i),title:'덱',units:[]}))},'main')}};
}
(async()=>{
 const h=harness();await h.init();await h.invoke('show',undefined,'main');const w=h.window;
 assert.equal(w.options.parent,null);assert.equal(w.options.type,'toolbar');assert.equal(w.options.minimizable,false);assert(w.options.focusable);
 h.main.minimized=true;h.main.emit('minimize');h.main.bounds={x:2200,y:100};h.main.emit('move');for(let i=0;i<100;i++){w.emit('focus');w.emit('blur')}
 assert(w.visible);assert.equal(w.showCount,1);assert.equal(h.jobs.size,0);
 w.bounds={x:-360,y:100,width:344,height:158};let changes=w.boundChanges;
 let state=await h.invoke('configure',{pinned:false});assert.equal(state.pinned,false);assert.equal(w.top,false);assert.equal(w.boundChanges,changes);assert(w.visible);
 await h.invoke('configure',{opacity:.8});assert.equal(w.boundChanges,changes);assert.equal(w.opacity,.8);
 state=await h.invoke('configure',{pinned:true});assert(state.pinned);assert(w.top);assert.equal(w.boundChanges,changes);
 await h.invoke('configure',{expanded:true});assert(w.bounds.x<0);assert(w.bounds.x+w.bounds.width<=0);assert.equal(w.bounds.width,760);
 await h.invoke('select','4');assert(w.visible);assert.equal((await h.invoke('get')).data.selectedRef,'4');
 // One unexpected hide is recovered at the existing monitor, without a foreground loop.
 w.hide();h.flush(120);assert(w.visible);assert(w.bounds.x+w.bounds.width<=0);const shown=w.showCount;
 w.hide();h.flush(120);assert(!w.visible);assert.equal(w.showCount,shown);assert(![...h.jobs.values()].some(j=>j.delay===120));
 await h.invoke('show',undefined,'main');assert(w.visible);assert(w.bounds.x>=0);
 w.minimized=true;w.visible=false;w.emit('minimize');h.flush(120);assert(!w.minimized);assert(w.visible);
 await h.invoke('close');h.flush(120);assert(!w.visible);
 await h.invoke('show',undefined,'main');w.hide();await h.invoke('close');h.flush(120);assert(!w.visible);
 await h.invoke('show',undefined,'main');w.bounds.x=-9999;h.screen.getDisplayMatching=()=>({workArea:{x:0,y:0,width:1920,height:1040}});h.screen.emit('display-removed');assert(w.bounds.x>=0);
 await h.invoke('configure',{pinned:false});h.flush(200);await new Promise(r=>setImmediate(r));assert.equal(h.writes.at(-1).pinned,false);
 h.controller.destroy();assert(w.dead);assert.equal(h.jobs.size,0);assert.equal(h.screen.listenerCount('display-removed'),0);
 const restored=harness({pinned:false});await restored.init();await restored.invoke('show',undefined,'main');assert.equal(restored.window.top,false);restored.controller.destroy();
 const loading=harness({},true);await loading.init();const pending=loading.invoke('show',undefined,'main');await loading.invoke('close');loading.finish();await pending;assert(!loading.window.visible);loading.controller.destroy();
 console.log('PASS native controller mocks: pin persistence, independent toolbar, main minimized/moved, click/focus, monitor-bound expansion, bounded recovery, close/load race, cleanup; no polling or forced focus');
})().catch(e=>{console.error(e);process.exitCode=1});
