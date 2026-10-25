'use strict';
const api=window.MattoDesktop,$=id=>document.getElementById(id);
const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let payload=null,settings={},tab='levels',chosenLevel=null,lastRef='',pinPending=false,suppressPinClick=false;
const deck=()=>payload?.decks.find(d=>d.ref===payload.selectedRef)||payload?.decks[0];
function error(e){$('error').textContent=e?.message||'미니 창을 불러오지 못했습니다.';$('error').hidden=false;}
async function request(fn){try{await fn();$('error').hidden=true;}catch(e){error(e);}}
function picture(record,withName=false){
 const holder=element('div',undefined,'portrait');holder.title=record.name;
 const fallback=()=>{const x=element('span',record.name.slice(0,2),'missing');holder.prepend(x);};
 if(record.url&&/^https:\/\//.test(record.url)){const img=element('img');img.alt=record.name;img.title=record.name;if(window.TFTPortraits)TFTPortraits.image(img,record);else{img.src=record.url;img.onerror=()=>{const x=element('span',record.name.slice(0,2),'missing');x.title=record.name;img.replaceWith(x);};}holder.append(img);}else fallback();
 if(withName)holder.append(element('span',record.name));
 return holder;
}
function namedIcon(record){const h=element('div',undefined,'named-icon');const p=picture(record);h.append(...p.childNodes,element('span',record.name));return h;}
function record(type,name){return payload?.catalogs?.[type]?.find(r=>r.name===name)||{name};}
function section(title){const box=element('section');box.append(element('h3',title));$('content').append(box);return box;}
function roster(parent,units){const row=element('div',undefined,'unit-list');for(const unit of units.filter(u=>window.TFTPortraits?.visible(typeof u==='string'?u:u.name)!==false))row.append(picture(typeof unit==='string'?record('champions',unit):unit,true));parent.append(row);}
function sourceNote(plan){return `${plan.source==='opgg'?'OP.GG':'TFT Academy'} · ${plan.match||'원문 구성'} · 패치 ${plan.patch||payload.patch}${plan.source==='opgg'?' · 핫픽스 반영 미확인':''}`;}
function renderLevels(d){
 const tabs=element('div',undefined,'level-tabs');
 if(!['6','7','8','9'].includes(chosenLevel))chosenLevel=String(d.level);
 for(const level of [6,7,8,9]){const b=element('button',level+'레벨');b.setAttribute('aria-pressed',String(chosenLevel===String(level)));b.onclick=()=>{chosenLevel=String(level);renderDetail();};tabs.append(b);}
 $('content').append(tabs,element('h2',chosenLevel+'레벨 · 꿀팁 3줄'));
 const lines=d.levelTips?.levels?.[chosenLevel];
 if(lines?.length===3){const list=element('ol',undefined,'level-tip-lines');for(const line of lines)list.append(element('li',line));$('content').append(list);}
 else $('content').append(element('p','현재 원문과 일치하는 레벨별 요약이 아직 준비되지 않았습니다.','muted'));
}
function renderItems(d){
 $('content').append(element('h2','핵심 아이템'));
 const normal=new Set((payload.catalogs.items||[]).filter(i=>i.category==='normal').map(i=>i.name));
 for(const carry of (d.carries||[]).slice(0,3)){
  const name=carry[0],main=d.equipment[name]||[],box=element('div',undefined,'core-item-entry'),head=element('div',undefined,'core-item-head'),champ=element('div',undefined,'core-unit');
  champ.append(picture(record('champions',name)),element('strong',name));const icons=element('div',undefined,'core-item-icons');for(const item of main)icons.append(picture(record('items',item)));head.append(champ,icons);box.append(head);
  const alts=new Map();for(const build of d.guide?.itemAlternatives||[])if(build.unit===name)for(const item of build.items)if(normal.has(item.name)&&!main.includes(item.name))alts.set(item.name,'원문 대체 빌드');
  for(const item of d.assist?.find(r=>r.unit===name)?.items||[])if(!main.includes(item.name)&&!alts.has(item.name))alts.set(item.name,item.note);
  const line=element('div',undefined,'core-alt-line');line.append(element('span','대체'));for(const [item,note]of [...alts].slice(0,4)){const icon=picture(record('items',item));icon.title=item+' · '+note;line.append(icon);}if(!alts.size)line.append(element('span','—'));box.append(line);$('content').append(box);
 }
}
function renderAugments(d){
 $('content').append(element('h2','추천 증강'));
 if(d.guide?.augmentTypes?.length)$('content').append(element('p','원문 추천 유형: '+d.guide.augmentTypes.join(' · '),'muted'));
 ['실버','골드','프리즘'].forEach((tier,i)=>{const box=section(tier);if(!d.augments[i]?.length)box.append(element('p','원문 추천 없음','muted'));else for(const name of d.augments[i]){const row=element('div',undefined,'augment-row');row.append(namedIcon(record('augments',name)));box.append(row);}});
 if(d.conditions?.length){const box=section('필수 조건');for(const c of d.conditions)box.append(element('p',c));}
 if(d.guide?.augmentNote){const box=section('원문 선택 기준');box.append(element('p',d.guide.augmentNote,'muted'));}
}
function renderPivot(d){
 $('content').append(element('h2','다른 덱 추천 · 3개'));
 const plan=d.pivot;if(!plan)return;
 if(!plan.branches?.length){for(const action of plan.actions||[])$('content').append(element('p',action));return;}
 for(const route of plan.branches){const box=element('details',undefined,'pivot-branch'),heading=element('summary',undefined,'pivot-portrait-heading');heading.setAttribute('aria-label',route.label+' · '+route.title);heading.title=route.title;heading.append(element('span',route.label.split(' · ')[0],'pivot-rank'));const previews=element('span',undefined,'pivot-mini-roster');for(const name of route.units)previews.append(picture(record('champions',name)));heading.append(previews);box.append(heading);box.append(element('h3',route.level+'레벨 원문 구성'));roster(box,route.units);box.append(element('p',(route.mode==='early'?'초반 공통: ':'유지: ')+(route.shared.join(' · ')||'없음')),element('p','공통 기물 '+route.shared.length+'명 · 핵심 아이템 '+route.transfer.items.length+'개'+(route.transfer.items.length?' · '+route.transfer.from+' → '+route.transfer.to+' / '+route.transfer.items.join(' / '):'')),element('p','추가: '+(route.added.join(' · ')||'없음')),element('p','교체: '+(route.removed.join(' · ')||'없음')));box.append(element('p',(route.source==='academy'?'TFT Academy':'LoLCHESS')+' · '+route.url,'muted'),element('p',route.note,'muted'));$('content').append(box);}
}
function renderDetail(){
 const d=deck();if(!d)return;$('content').replaceChildren();
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
 if(tab==='pivot')renderPivot(d);else if(tab==='levels')renderLevels(d);else if(tab==='items')renderItems(d);else if(tab==='augments')renderAugments(d);else{
  $('content').append(element('h2','총 요약 · 3줄'));const lines=d.levelTips?.summary||d.tips||[];const list=element('ol',undefined,'level-tip-lines');for(const line of lines)list.append(element('li',line));$('content').append(list);if(!lines.length)$('content').append(element('p','현재 공략의 요약이 준비되지 않았습니다.','muted'));
 }
 $('content').scrollTop=0;$('sourceNote').textContent='공략 기준: TFT Academy · '+payload.patch+' · '+(d.guide?.updatedAt?.slice(0,10)||payload.publishedAt.slice(0,10))+(tab==='pivot'?' · 전환 후보는 구성 유사도 기준 사전 참고':' · 레벨별 TIP은 원문 운영 요약');
}
function render(){
 const d=deck();if(!d)return;
 if(lastRef!==d.ref){chosenLevel=String(d.level);lastRef=d.ref;}
 $('deckSelect').textContent=d.title+' ▾';$('deckSelect').title=d.title;
 $('deckMenu').replaceChildren();for(const x of payload.decks){const b=element('button',x.title);b.type='button';b.dataset.ref=x.ref;b.setAttribute('aria-pressed',String(x.ref===d.ref));b.onclick=()=>request(async()=>{closeDeckMenu();await api.selectDeck(x.ref);});$('deckMenu').append(b);}
 $('levelBadge').textContent=d.level+'레벨';$('roster').replaceChildren();for(const n of d.units)$('roster').append(picture(record('champions',n)));
 const priority=d.guide?.priority||[];const fallback=d.carries?.[0]?.slice(1)||[];
 $('priorityLabel').textContent=priority.length?'우선 아이템':'핵심 아이템';$('priorityIcons').replaceChildren();for(const r of (priority.length?priority:fallback.map(n=>record('items',n))).slice(0,3)){const p=picture(r);$('priorityIcons').append(...p.childNodes);}
 $('pivotQuick').textContent=d.pivot?.mode==='strengthen'?'덱 보강':'비상구';$('pivotQuick').title=d.pivot?(d.pivot.mode==='strengthen'?'현재 덱 보강':'전환 후보 '+d.pivot.title):'조건이 맞는 후보 없음';$('patch').textContent='패치 '+payload.patch;renderDetail();
}
function closeDeckMenu(){$('deckMenu').hidden=true;$('deckSelect').setAttribute('aria-expanded','false');}
function updateState(next){settings=next;if(next.collapsed||next.visible===false)closeDeckMenu();$('mainWindowToggle').hidden=typeof api?.toggleMainWindow!=='function';$('mainWindowToggle').textContent=next.mainHidden?'메인 창 다시 보기':'메인 창 숨기기';$('mainWindowToggle').setAttribute('aria-pressed',String(!!next.mainHidden));const pinned=!!next.pinned;$('pin').setAttribute('aria-pressed',String(pinned));$('pin').textContent=pinPending?'…':pinned?'고정':'해제';$('pin').setAttribute('aria-busy',String(pinPending));$('pin').setAttribute('aria-label',pinned?'항상 위 고정 켜짐':'항상 위 고정 꺼짐');$('pin').title=api?.miniVersion===2?(pinned?'항상 위 고정 켜짐 · 눌러서 해제':'항상 위 고정 꺼짐 · 눌러서 고정'):'고정 전환은 Windows 1.7.4 설치 후 사용할 수 있습니다.';$('pin').disabled=api?.miniVersion!==2||pinPending;document.body.classList.toggle('expanded',!!next.expanded);document.body.classList.toggle('collapsed',!!next.collapsed);$('detail').hidden=!next.expanded;$('expand').textContent=next.expanded?'접기 ‹':'상세보기 ›';$('expand').setAttribute('aria-expanded',String(!!next.expanded));$('opacity').value=String(Math.round(next.opacity*100));$('collapse').textContent=next.collapsed?'+':'−';$('collapse').title=next.collapsed?'미니 창 펼치기':'한 줄로 접기';$('collapse').setAttribute('aria-label',$('collapse').title);}
if(!api){error(Error('PC 프로그램에서 미니 창을 열어 주세요.'));}else{
 api.onMiniData(next=>{payload=next;if(next?.settings)updateState(next.settings);render();});api.onMiniState(updateState);
 request(async()=>{const initial=await api.getMini();updateState(initial.state);if(initial.data){payload=initial.data;render();}});
 $('mainWindowToggle').onclick=()=>request(async()=>{updateState(await api.toggleMainWindow());});// Handle the press directly: do not depend solely on a focus-dependent click.
 const changePin=async()=>{
  if(api.miniVersion!==2||pinPending)return;
  const wanted=!settings.pinned;pinPending=true;updateState(settings);
  try{
   const confirmed=await api.configureMini({pinned:wanted});
   if(typeof confirmed?.pinned!=='boolean')throw Error('고정 상태를 확인하지 못했습니다.');
   updateState(confirmed);
   if(confirmed.pinned!==wanted)throw Error('고정 상태가 변경되지 않았습니다.');
   $('error').hidden=true;
  }catch(e){error(e);}finally{pinPending=false;updateState(settings);}
 };
 $('pin').onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();suppressPinClick=true;void changePin();};
 $('pin').onclick=e=>{if(suppressPinClick&&e.detail>0){suppressPinClick=false;return;}suppressPinClick=false;void changePin();};
 $('pivotQuick').onclick=()=>request(async()=>{tab='pivot';updateState(await api.configureMini({expanded:true,collapsed:false}));renderDetail();});
 $('close').onclick=()=>request(()=>api.closeMini());$('collapse').onclick=()=>request(()=>api.configureMini({collapsed:!settings.collapsed}));$('expand').onclick=()=>request(()=>api.configureMini({expanded:!settings.expanded,collapsed:false}));$('opacity').oninput=()=>request(()=>api.configureMini({opacity:Number($('opacity').value)/100}));$('deckSelect').onclick=()=>request(async()=>{
  if(!$('deckMenu').hidden){closeDeckMenu();return;}
  if(settings.collapsed)updateState(await api.configureMini({collapsed:false}));
  $('deckMenu').hidden=false;$('deckSelect').setAttribute('aria-expanded','true');
 });
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('#deckMenu,#deckSelect'))closeDeckMenu();});
 // Keep deck selection inside the overlay: native select/context menus can create
 // separate popup windows with their own Windows activation behavior.
 document.addEventListener('contextmenu',e=>e.preventDefault());
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderDetail();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDeckMenu();request(()=>api.configureMini({expanded:false,collapsed:false}));}});
}
