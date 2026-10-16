/* Missing source portraits use explicitly labelled owner/representative icons. */
window.TFTPortraits=(()=>{'use strict';
const excluded=new Set(['골렘','꼬마 부리','깊은숲 수호자','꼬마 돌거북','생명꽃','정령 주술사','돌껍질 나무','훈련 봇']);
const visible=name=>!excluded.has(name);
const replacements={'탑':{url:'https://cdn.lolchess.gg/upload/images/champions/Dummy_1689746192-tft_trainingdummy_donothing.png',note:'원본 초상화 미제공 · 훈련 봇 대표 아이콘'}};
function deck(d){return {...d,units:d.units.filter(visible),summons:d.summons.filter(visible),layout:Object.fromEntries(Object.entries(d.layout).filter(([,n])=>visible(n))),equipment:Object.fromEntries(Object.entries(d.equipment).filter(([n])=>visible(n))),carries:d.carries.filter(c=>visible(c[0]))};}

function apply(rows){for(let i=rows.length-1;i>=0;i--)if(!visible(rows[i].name))rows.splice(i,1);for(const c of rows){const replacement=replacements[c.name];if(replacement){c.url=replacement.url;c.portraitNote=replacement.note;}}}
function source(c){return window.TFTPortraitCache?.[c?.url]||c?.url;}
function image(im,c){
 im.alt=c.name;im.referrerPolicy='no-referrer';if(c.portraitNote)im.title=c.name+' · '+c.portraitNote;
 const urls=[...new Set([source(c),c.url].filter(Boolean))];let next=0;
 function retry(){if(next<urls.length){im.src=urls[next++];return;}im.onerror=null;im.hidden=false;im.title=c.name+' · 초상화를 불러오지 못했습니다.';const label=c.name.slice(0,2).replace(/[<>&"']/g,'');im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="10" fill="#e9d9cf"/><text x="48" y="58" text-anchor="middle" font-size="27" fill="#543641">'+label+'</text></svg>');}
 im.onerror=retry;retry();return im;
}
return {apply,image,source,visible,deck};})();
