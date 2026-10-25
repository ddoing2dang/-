/* Structural comparisons only: no live game state or automatic board edits. */
window.MattoPivot=(()=>{
 const units=d=>[...new Set(d.units.filter(n=>!(d.summons||[]).includes(n)))];
 const regular=n=>!['상징','유물','찬란','지원','전략가'].some(x=>n.includes(x));
 function forDeck(source,data){
  const own=units(source),candidates=[];
  const carry=source.carries?.[0]?.[0];
  const held=(source.equipment[carry]||[]).filter(regular);
  if(held.length<2)return null;
  for(const target of data.recommendations){
   if(source.url===target.url||target.level<source.level||target.level-source.level>1)continue;
   // Avoid suggesting abandonment of a different reroll carry after investment.
   if(((source.style||'').includes('Reroll')||(target.style||'').includes('Reroll'))&&target.carries?.[0]?.[0]!==carry)continue;
   const needed=target.conditions||[],owned=source.conditions||[];
   if(needed.some(n=>!owned.includes(n)))continue;
   const other=units(target),shared=own.filter(n=>other.includes(n));
   if(shared.length<3||shared.length/Math.max(own.length,other.length)<.45)continue;
   let best=null;
   for(const [name,items]of Object.entries(target.equipment)){
    const remaining=[...items],matched=[];
    for(const item of held){const index=remaining.indexOf(item);if(index>=0){matched.push(item);remaining.splice(index,1);}}
    if(matched.length>=2&&(!best||matched.length>best.items.length))best={from:carry,to:name,items:matched};
   }
   if(!best)continue;
   const score=shared.length*10+best.items.length*8-Math.abs(source.level-target.level)*4;
   candidates.push({score,ref:target.url,title:target.title,level:target.level,shared,units:other,transfer:best,
    equipment:target.equipment,note:'구성 유사도로 고른 사전 참고 경로예요. 현재 상점·체력·골드·별 등급은 반영하지 않아요. 핵심 아이템 이동에는 기존 기물 판매나 제거기가 필요할 수 있어요.'});
  }
  candidates.sort((a,b)=>b.score-a.score||a.ref.localeCompare(b.ref));return candidates[0]||null;
 }
 return {forDeck};
})();
