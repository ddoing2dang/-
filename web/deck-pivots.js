/* Structural comparisons only: no live game state or automatic board edits. */
window.MattoPivot=(()=>{
 const units=d=>[...new Set(d.units.filter(n=>!(d.summons||[]).includes(n)))];
 const regular=n=>!['상징','유물','찬란','지원','전략가'].some(x=>n.includes(x));
 function strengthen(d){
  const options=d.pcGuide?.options||d.levelUpOptions||[];
  const actions=[(d.style||'').includes('Reroll')?'리롤 핵심 기물에 투자했다면 해당 기물을 유지하고 원문 3성 목표를 먼저 확인해요.':'현재 주력과 탱커의 2성·아이템 완성을 우선 확인해요.'];
  if(options.length)actions.push('원문 후반 보강 후보: '+options.map(o=>o.unit+'('+o.level+'레벨)').join(' · '));
  else actions.push('원문에는 추가 기물 후보가 없어요. 임의의 기물을 넣기보다 현재 공략의 핵심 업그레이드를 유지해요.');
  actions.push('주력 아이템을 다른 기물로 옮길 때는 판매·제거기 필요 여부를 먼저 확인해요.');
  return {mode:'strengthen',title:'현재 덱 보강',actions,note:'안전한 전환 후보가 부족할 때의 보강 체크예요. 원문에 없는 확정 배치를 만들지 않아요.'};
 }
 function forDeck(source,data){
  const own=units(source),candidates=[];
  const carry=source.carries?.[0]?.[0];
  const held=(source.equipment[carry]||[]).filter(regular);
  if(held.length<2)return strengthen(source);
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
   candidates.push({mode:'late',label:'후반 핵심 유지형',score,ref:target.url,title:target.title,level:target.level,shared,units:other,transfer:best,
    equipment:target.equipment,note:'구성 유사도로 고른 사전 참고 경로예요. 현재 상점·체력·골드·별 등급은 반영하지 않아요. 핵심 아이템 이동에는 기존 기물 판매나 제거기가 필요할 수 있어요.'});
  }
  candidates.sort((a,b)=>b.score-a.score||a.ref.localeCompare(b.ref));if(candidates.length)return candidates[0];
  // Early direction changes compare source early boards, before committing to stars.
  const early=(source.pcGuide?.early||[]).map(u=>u.name),earlyCandidates=[];
  for(const target of data.recommendations){
   if(target.url===source.url||(target.conditions||[]).length)continue;
   const sharedEarly=early.filter(n=>(target.pcGuide?.early||[]).some(u=>u.name===n));
   if(sharedEarly.length<2)continue;
   const to=target.carries?.[0]?.[0],remaining=[...(target.equipment[to]||[])],items=[];
   for(const item of held){const i=remaining.indexOf(item);if(i>=0){items.push(item);remaining.splice(i,1);}}
   if(items.length<2)continue;
   earlyCandidates.push({mode:'early',label:'초반 방향 변경용',ref:target.url,title:target.title,level:target.level,units:units(target),shared:sharedEarly,transfer:{from:carry,to,items},score:sharedEarly.length*10+items.length*8,note:'3성 리롤·핵심 기물 투자 전, 초반 공략 기물이 겹칠 때만 검토하는 경로예요. 완성덱 사이의 즉시 전환 권장은 아니에요. 아이템 이동에는 판매·제거기가 필요할 수 있어요.'});
  }
  earlyCandidates.sort((a,b)=>b.score-a.score||a.ref.localeCompare(b.ref));return earlyCandidates[0]||strengthen(source);
 }
 return {forDeck};
})();
