'use strict';
window.MattoPCInit=function({getData,getState,catalogs,tipSummaries,E,toast,renderDecks}){
 const api=window.MattoDesktop;
 if(window.APP_CONFIG?.platform!=='desktop'||!api||api.version!==1)return;
 let visible=false,publishing=Promise.resolve();
 const toggle=document.createElement('button');toggle.id='toggleMiniWindow';toggle.type='button';toggle.textContent='▣ 미니 창 켜기';toggle.setAttribute('aria-pressed','false');
 const holder=document.createElement('div');holder.className='button-row desktop-tools';holder.append(toggle);document.querySelector('.header-right').append(holder);
 function update(next){visible=!!next.visible;toggle.textContent=visible?'▣ 미니 창 끄기':'▣ 미니 창 켜기';toggle.setAttribute('aria-pressed',String(visible));}
 function snapshot(preferApplied=false){const data=getData(),state=getState();return {patch:data.patch,publishedAt:data.publishedAt,selectedRef:preferApplied?state.deckRef:'',
  catalogs:{champions:catalogs.champions,items:catalogs.items,augments:catalogs.augments},
  decks:data.recommendations.map(d=>window.TFTPortraits?.deck(d)||d).map(d=>{const tip=tipSummaries[d.url];return {ref:d.url,title:d.title,level:d.level,units:d.units,equipment:d.equipment,carries:d.carries,augments:d.augments,conditions:d.conditions,guide:d.pcGuide||null,tips:tip?.evidence===JSON.stringify([d.sourceTips,d.sourceAugmentTip])?tip.lines:[]};})};}
 function publish(preferApplied=false){publishing=publishing.catch(()=>{}).then(()=>api.publishMini(snapshot(preferApplied))).then(update);return publishing;}
 async function action(fn){toggle.disabled=true;try{await publish();update(await fn());}catch(e){toast(e.message||'미니 창을 열지 못했습니다.');}finally{toggle.disabled=false;}}
 toggle.onclick=()=>action(()=>api.toggleMini());
 window.MattoPCTools={deckButton(d){const b=E('button','mini-deck-button','▣ 이 덱 미니 창에 띄우기');b.type='button';b.onclick=()=>action(()=>api.showMini(d.url));return b;}};
 api.onMiniState(update);window.addEventListener('matto:deck-change',()=>publish(true).catch(()=>{}));window.addEventListener('matto:data-ready',()=>publish().catch(()=>{}));
 publish(true).catch(()=>{});api.getMini().then(r=>update(r.state)).catch(()=>{});renderDecks();
};
