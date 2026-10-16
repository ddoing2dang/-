'use strict';
const api=window.MattoDesktop,$=id=>document.getElementById(id);
const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let payload=null,settings={},tab='levels',chosenLevel=null,lastRef='';
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
 const guide=d.guide||{},tabs=element('div',undefined,'level-tabs');
 const available=(guide.levelPlans||[]);
 const options=[{key:'early',label:'초반'},...[5,6,7,8,9].map(level=>({key:String(level),label:level+'레벨'}))];
 if(chosenLevel===null)chosenLevel=String(d.level);
 for(const o of options){const b=element('button',o.label);b.setAttribute('aria-pressed',String(chosenLevel===o.key));b.onclick=()=>{chosenLevel=o.key;renderDetail();};tabs.append(b);}
 $('content').append(tabs);
 if(chosenLevel==='early'){
  $('content').append(element('h2','초반 빌드업'));
  if(guide.early?.length){roster($('content'),guide.early);$('content').append(element('p','초반에 활용할 원문 예시입니다. 특정 레벨의 완성 배치는 아닙니다.','muted'));}
  else $('content').append(element('p','현재 공략에 초반 구성 예시가 없습니다.','muted'));
 }else{
  const level=Number(chosenLevel);$('content').append(element('h2',level+'레벨 구성'));
  if(level===d.level){roster($('content'),d.units);$('content').append(element('p','TFT Academy 추천 완성 배치 · '+d.level+'레벨','muted'));}
  else{
   const plans=available.filter(p=>p.level===level);
   if(plans.length)for(const plan of plans){const box=section(plan.title||'빌드업 예시');roster(box,plan.units);box.append(element('p',sourceNote(plan),'muted'));}
   else $('content').append(element('p','현재 출처에서 이 레벨의 확정 구성을 제공하지 않습니다. 초반 구성이나 완성 레벨을 확인해 주세요.','muted'));
  }
  const additions=(guide.options||[]).filter(o=>o.level===level);
  if(additions.length){const box=section('이 레벨의 추가 후보');roster(box,additions.map(o=>o.unit));box.append(element('p','원문 확장 후보이며, 모두 동시에 넣는 구성은 아닙니다.','muted'));}
 }
 if(d.tips?.[0])$('content').append(element('p',d.tips[0]));
}
function renderItems(d){
 const priority=d.guide?.priority||[];$('content').append(element('h2','아이템 우선순위'));
 if(priority.length){$('content').append(element('p','원문 회전초밥 우선순위 · 완성 아이템과 재료가 함께 표시됩니다.','muted'));priority.forEach((r,i)=>{const box=element('div',undefined,'item-row');box.append(element('strong',(i+1)+'순위'));box.append(namedIcon(r));$('content').append(box);});}
 else $('content').append(element('p','이 공략에는 아이템 제작 순서가 없습니다. 아래는 챔피언별 추천 완성 아이템입니다.','muted'));
 section('챔피언별 추천 아이템');
 for(const [name,items] of Object.entries(d.equipment)){const box=element('div',undefined,'item-row');box.append(element('strong',name));const row=element('div',undefined,'icons');items.forEach(n=>row.append(namedIcon(record('items',n))));box.append(row);$('content').append(box);}
 const alts=d.guide?.itemAlternatives||[];
 if(alts.length){const box=section('원문 대체 아이템 후보');for(const alt of alts){const row=element('div',undefined,'item-row');row.append(element('strong',alt.unit));const icons=element('div',undefined,'icons');alt.items.forEach(item=>icons.append(namedIcon(item)));row.append(icons);box.append(row);}}
 if(d.tips?.[1])$('content').append(element('p',d.tips[1]));
}
function renderAugments(d){
 $('content').append(element('h2','추천 증강'));
 if(d.guide?.augmentTypes?.length)$('content').append(element('p','원문 추천 유형: '+d.guide.augmentTypes.join(' · '),'muted'));
 ['실버','골드','프리즘'].forEach((tier,i)=>{const box=section(tier);if(!d.augments[i]?.length)box.append(element('p','원문 추천 없음','muted'));else for(const name of d.augments[i]){const row=element('div',undefined,'augment-row');row.append(namedIcon(record('augments',name)));box.append(row);}});
 if(d.conditions?.length){const box=section('필수 조건');for(const c of d.conditions)box.append(element('p',c));}
 if(d.guide?.augmentNote){const box=section('원문 선택 기준');box.append(element('p',d.guide.augmentNote,'muted'));}
}
function renderDetail(){
 const d=deck();if(!d)return;$('content').replaceChildren();
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
 if(tab==='levels')renderLevels(d);else if(tab==='items')renderItems(d);else if(tab==='augments')renderAugments(d);else{
  $('content').append(element('h2','운영 TIP'));const list=element('ol');for(const line of d.tips||[])list.append(element('li',line));$('content').append(list);if(!d.tips?.length)$('content').append(element('p','현재 공략의 요약이 준비되지 않았습니다.','muted'));
 }
 $('content').scrollTop=0;$('sourceNote').textContent='공략 기준: TFT Academy · '+payload.patch+' · '+(d.guide?.updatedAt?.slice(0,10)||payload.publishedAt.slice(0,10))+' · 빌드업 출처는 각 구성에 별도 표시';
}
function render(){
 const d=deck();if(!d)return;
 if(lastRef!==d.ref){chosenLevel=String(d.level);lastRef=d.ref;}
 $('deckSelect').replaceChildren();for(const x of payload.decks){const o=element('option',x.title);o.value=x.ref;$('deckSelect').append(o);}$('deckSelect').value=d.ref;$('deckSelect').title=d.title;
 $('levelBadge').textContent=d.level+'레벨';$('roster').replaceChildren();for(const n of d.units)$('roster').append(picture(record('champions',n)));
 const priority=d.guide?.priority||[];const fallback=d.carries?.[0]?.slice(1)||[];
 $('priorityLabel').textContent=priority.length?'우선 아이템':'핵심 아이템';$('priorityIcons').replaceChildren();for(const r of (priority.length?priority:fallback.map(n=>record('items',n))).slice(0,3)){const p=picture(r);$('priorityIcons').append(...p.childNodes);}
 $('patch').textContent='패치 '+payload.patch;renderDetail();
}
function updateState(next){settings=next;document.body.classList.toggle('expanded',!!next.expanded);document.body.classList.toggle('collapsed',!!next.collapsed);$('detail').hidden=!next.expanded;$('expand').textContent=next.expanded?'접기 ‹':'상세보기 ›';$('expand').setAttribute('aria-expanded',String(!!next.expanded));$('pin').setAttribute('aria-pressed','true');$('opacity').value=String(Math.round(next.opacity*100));$('collapse').textContent=next.collapsed?'+':'−';$('collapse').title=next.collapsed?'미니 창 펼치기':'한 줄로 접기';$('collapse').setAttribute('aria-label',$('collapse').title);}
if(!api){error(Error('PC 프로그램에서 미니 창을 열어 주세요.'));}else{
 api.onMiniData(next=>{payload=next;if(next?.settings)updateState(next.settings);render();});api.onMiniState(updateState);
 request(async()=>{const initial=await api.getMini();updateState(initial.state);if(initial.data){payload=initial.data;render();}});
 $('close').onclick=()=>request(()=>api.closeMini());$('pin').onclick=()=>request(()=>api.configureMini({pinned:true}));$('collapse').onclick=()=>request(()=>api.configureMini({collapsed:!settings.collapsed}));$('expand').onclick=()=>request(()=>api.configureMini({expanded:!settings.expanded,collapsed:false}));$('opacity').oninput=()=>request(()=>api.configureMini({opacity:Number($('opacity').value)/100}));$('deckSelect').onchange=()=>request(()=>api.selectDeck($('deckSelect').value));
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderDetail();});document.addEventListener('keydown',e=>{if(e.key==='Escape')request(()=>api.configureMini({expanded:false,collapsed:false}));});
}
