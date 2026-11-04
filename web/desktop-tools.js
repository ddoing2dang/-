'use strict';
window.MattoPCInit=function({getData,getState,catalogs,tipSummaries,E,toast,renderDecks}){
 const api=window.MattoDesktop;
 if(window.APP_CONFIG?.platform!=='desktop'||!api||api.version!==1)return;
 let visible=false,publishing=Promise.resolve(),requestedRef='',legacyMini=false;
 const toggle=document.createElement('button');toggle.id='toggleMiniWindow';toggle.type='button';toggle.textContent='▣ 미니 창 켜기';toggle.setAttribute('aria-pressed','false');
 const holder=document.createElement('div');holder.className='button-row desktop-tools';holder.append(toggle);document.querySelector('.header-right').append(holder);
 function update(next){visible=!!next.visible;toggle.textContent=visible?'▣ 미니 창 끄기':'▣ 미니 창 켜기';toggle.setAttribute('aria-pressed',String(visible));}
 function snapshot(preferApplied=false){const data=getData(),state=getState();return {patch:data.patch,publishedAt:data.publishedAt,selectedRef:preferApplied?state.deckRef:'',
  catalogs:{champions:catalogs.champions,items:catalogs.items,augments:catalogs.augments},
  decks:data.recommendations.map(d=>window.TFTPortraits?.deck(d)||d).map(d=>{const tip=tipSummaries[d.url];return {ref:d.url,title:d.title+' · v'+(d.patch||'미확인'),level:d.level,units:d.units,equipment:d.equipment,carries:d.carries,augments:d.augments,conditions:d.conditions,assist:window.MattoAssist?.alternatives(d,data)||[],pivot:window.MattoPivot?.forDeck(d,data)||null,guide:d.pcGuide||null,levelTips:window.MattoPCLevelTips?.forDeck(d)||null,tips:tip?.evidence===JSON.stringify([d.sourceTips,d.sourceAugmentTip])?tip.lines:[]};})};}
 function publish(preferApplied=false){publishing=publishing.catch(()=>{}).then(async()=>{const payload=snapshot(preferApplied);const sendLegacy=()=>{const ref=requestedRef||payload.selectedRef;const chosen=payload.decks.find(d=>d.ref===ref);const decks=payload.decks.slice(0,15);if(chosen&&!decks.some(d=>d.ref===ref))decks[14]=chosen;return api.publishMini({...payload,decks});};if(legacyMini)return sendLegacy();try{return await api.publishMini(payload);}catch(e){if(payload.decks.length!==20||!String(e.message).includes('미니 창 데이터 형식 오류'))throw e;legacyMini=true;return sendLegacy();}}).then(update);return publishing;}
 async function action(fn){toggle.disabled=true;try{await publish();update(await fn());}catch(e){toast(e.message||'미니 창을 열지 못했습니다.');}finally{toggle.disabled=false;}}
 toggle.onclick=()=>action(()=>api.toggleMini());
 window.MattoPCTools={deckButton(d){const b=E('button','mini-deck-button','▣ 이 덱 미니 창에 띄우기');b.type='button';b.onclick=()=>{requestedRef=d.url;return action(()=>api.showMini(d.url));};return b;}};
 api.onMiniState(update);window.addEventListener('matto:deck-change',()=>publish(true).catch(()=>{}));window.addEventListener('matto:data-ready',()=>publish().catch(()=>{}));
 publish(true).catch(()=>{});api.getMini().then(r=>update(r.state)).catch(()=>{});renderDecks();
};
