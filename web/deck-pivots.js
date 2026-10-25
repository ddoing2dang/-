/* Compare verified full source boards; statistical comparison records are not boards. */
window.MattoPivot=(()=>{
 const units=d=>[...new Set(d.units.filter(n=>!(d.summons||[]).includes(n)))];
 const main=d=>d.mainCarry||d.carries?.[0]?.[0];
 const tier=d=>({S:0,A:1,B:2,C:3}[d.tier]??4);
 function pool(data){
  const known=new Map(data.recommendations.map(d=>[d.url,d])),seen=new Set(),out=[];
  const candidates=[...(data.decks||[])].sort((a,b)=>(a.source==='academy'?0:1)-(b.source==='academy'?0:1)||tier(a)-tier(b)||(a.rank||99)-(b.rank||99));
  for(const raw of candidates){
   if(!['academy','lolchess'].includes(raw.source)||raw.patch!==data.patch||!raw.layoutVerified||raw.unresolved?.length||!raw.layout||!raw.equipment||!main(raw)||!raw.equipment[main(raw)]?.length)continue;
   if(Object.keys(raw.layout).length!==raw.units.length||Object.keys(raw.layout).some(s=>!/^\d+$/.test(s)||+s>27))continue;
   if(raw.capacity!==raw.level||![7,8,9].includes(raw.level))continue;
   const names=raw.units.filter(n=>!(raw.summons||[]).includes(n));if(new Set(names).size!==names.length)continue;
   const signature=[...names].sort().join('|');if(seen.has(signature))continue;seen.add(signature);
   const saved=known.get(raw.url);out.push(saved?{...raw,...saved}:raw);
  }
  return out;
 }
 function strengthen(d){const options=d.pcGuide?.options||d.levelUpOptions||[];return {mode:'strengthen',title:'현재 덱 보강',actions:[(d.style||'').includes('Reroll')?'핵심 리롤 기물 유지 · 원문 3성 목표 우선':'주력·탱커 2성과 아이템 완성 우선',options.length?'원문 보강: '+options.map(o=>o.unit+'('+o.level+'레벨)').join(' · '):'원문 추가 기물 없음 · 현재 핵심 업그레이드 유지'],note:'안전한 전환 후보가 부족해 현재 덱의 보강 방향을 표시해요.'};}
 function forDeck(source,data){
  const normal=new Set((window.TFT_ITEM_POLICY?.items||[]).filter(i=>i.category==='normal').map(i=>i.name));
  const carry=main(source),held=(source.equipment[carry]||[]).filter(i=>normal.has(i)),own=units(source),candidates=[];
  const emblems=d=>{const bag=new Map();for(const items of Object.values(d.equipment))for(const item of items)if(item.includes('상징'))bag.set(item,(bag.get(item)||0)+1);return bag;};
  const owned=emblems(source);
  for(const target of pool(data)){
   const other=units(target);if(source.url===target.url||other.slice().sort().join('|')===own.slice().sort().join('|'))continue;
   if([...emblems(target)].some(([n,k])=>(owned.get(n)||0)<k))continue;
   let transfer=null;
   for(const from of [carry])for(const [to]of target.carries||[]){
    if(target.source==='lolchess'&&to!==from)continue;
    const remaining=[...(target.equipment[to]||[])],items=[];
    for(const item of source.equipment[from]||[]){if(!normal.has(item))continue;const i=remaining.indexOf(item);if(i>=0){items.push(item);remaining.splice(i,1);}}
    if(items.length>=2&&(!transfer||items.length>transfer.items.length||(items.length===transfer.items.length&&from===carry)))transfer={from,to,items};
   }
   if(!transfer)continue;
   const {to,items}=transfer;
   const shared=own.filter(n=>other.includes(n)),ratio=shared.length/Math.max(own.length,other.length);
   const reroll=(source.style||'').includes('Reroll')||(target.style||'').includes('Reroll');
   const early=(source.pcGuide?.early||[]).map(u=>u.name).filter(n=>(target.pcGuide?.early||[]).some(u=>u.name===n));
   let mode,label,kept=shared;
   if(transfer.from===carry&&to===carry&&shared.length>=3&&ratio>=.45&&target.level>=source.level&&target.level-source.level<=1){mode='late';label='핵심 유지형';}
   else if(!reroll&&shared.length>=2&&ratio>=.3&&target.level>=source.level&&target.level-source.level<=1){mode='items';label='아이템 활용형';}
   else if(early.length>=2){mode='early';label='초반 방향 변경용';kept=early;}
   else continue;
   candidates.push({mode,label,ref:target.url,title:target.title,level:target.level,units:other,shared:kept,removed:own.filter(n=>!other.includes(n)),added:other.filter(n=>!own.includes(n)),transfer,source:target.referenceSource||target.source,url:target.url,score:kept.length*10+items.length*8-Math.abs(target.level-source.level)*4,note:mode==='early'?'3성·핵심 투자 전에만 검토하는 사전 경로':'상점·체력·골드·별 등급 미반영 · 아이템 이동 시 판매·제거기 확인'});
  }
  candidates.sort((a,b)=>b.score-a.score||a.ref.localeCompare(b.ref));
  const branches=[];for(const mode of ['late','items','early']){const best=candidates.find(r=>r.mode===mode);if(best)branches.push(best);}
  // Fill remaining slots with distinct configurations, never duplicate the same board.
  for(const c of candidates)if(branches.length<3&&!branches.some(r=>r.ref===c.ref))branches.push(c);
  const fallback=strengthen(source);return branches.length?{...branches[0],branches}: {...fallback,branches:[]};
 }
 return {forDeck};
})();
