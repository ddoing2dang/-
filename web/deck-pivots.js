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
   const canonical=s=>(s||'').replace(/\s+/g,'').toLowerCase();if(canonical(target.title)===canonical(source.title)||canonical(target.sourceTitle)===canonical(source.sourceTitle))continue;
   const other=units(target);if(other.slice().sort().join('|')===own.slice().sort().join('|'))continue;
   const required=[...emblems(target)].filter(([n,k])=>(owned.get(n)||0)<k).map(([n,k])=>n+' '+(k-(owned.get(n)||0))+'개');
   const to=main(target),remaining=[...(target.equipment[to]||[])],items=[];
   for(const item of held){const i=remaining.indexOf(item);if(i>=0){items.push(item);remaining.splice(i,1);}}
   const shared=own.filter(n=>other.includes(n)),removed=own.filter(n=>!other.includes(n)),added=other.filter(n=>!own.includes(n));
   const sameCarry=to===carry,reroll=(source.style||'').includes('Reroll')||(target.style||'').includes('Reroll');
   const warnings=[];
   if(required.length)warnings.push('추가 필요: '+required.join(' · '));
   if(reroll&&!sameCarry)warnings.push('주력 3성 투자 전 방향 변경용');
   if(!items.length)warnings.push('현재 주력과 원문 핵심 아이템이 겹치지 않아요');
   if(target.source==='lolchess')warnings.push('LoLCHESS는 주력 역할 미표기 · 첫 아이템 기물 기준 비교');
   if(Math.abs(source.level-target.level)>1)warnings.push('완성 레벨 차이가 커요');
   const score=shared.length*10+items.length*9+(sameCarry?15:0)-required.length*25-Math.abs(target.level-source.level)*4-(reroll&&!sameCarry?12:0);
   const label=sameCarry?'핵심 기물 유지':items.length>=2?'아이템 활용 후보':'새 방향 후보';
   candidates.push({mode:'recommend',label,primary:to,ref:target.url,title:target.title,level:target.level,units:other,shared,removed,added,transfer:{from:carry,to,items},source:target.referenceSource||target.source,url:target.url,score,required,warnings,note:'구성·아이템 유사도 순 추천이며 즉시 전환 권장이 아니에요. '+(warnings.length?warnings.join(' · '):'상점·체력·골드·별 등급은 반영하지 않아요.')});
  }
  candidates.sort((a,b)=>a.required.length-b.required.length||b.score-a.score||a.ref.localeCompare(b.ref));
  const distinct=[];for(const r of candidates){if(distinct.some(x=>x.primary===r.primary))continue;distinct.push(r);if(distinct.length===3)break;}
  const branches=distinct.map((r,i)=>({...r,label:(i+1)+'순위 · '+r.label}));
  return branches.length?{...branches[0],branches}:{...strengthen(source),branches:[]};
 }
 return {forDeck};
})();
