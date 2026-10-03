(function(root){
  'use strict';
  const SOURCE_IDS=['lolchess','opgg','metatft','tactics','qq','academy'];
  const EXCLUDED=['나무정령 베이가','엄호대 카시오페아 & 람머스'];
  const weights={SS:6,S:5,A:4,'상위':3,B:2,C:1};
  const signature=d=>[...new Set(d.units)].sort().join('|');
  function completeLayout(d){
    const entries=Object.entries(d.layout||{});
    return entries.length===d.units.length&&entries.every(([slot,name])=>Number.isInteger(Number(slot))&&Number(slot)>=0&&Number(slot)<28&&d.units.includes(name))&&new Set(entries.map(x=>x[1])).size===d.units.length;
  }
  function selectWeeklyDecks(snapshot){
    const states=snapshot.sources||{};
    const eligible=(snapshot.decks||[]).filter(d=>SOURCE_IDS.includes(d.source)&&Array.isArray(d.units)&&d.units.length>=5&&d.units.length<=10&&new Set(d.units).size===d.units.length&&!EXCLUDED.includes(d.title)&&!/(나무정령.*베이가|베이가.*나무정령|엄호대.*카시오페아|카시오페아.*엄호대)/.test(d.title));
    const sourceRank=d=>Number.isFinite(d.rank)?d.rank:20;
    const current=d=>['verified','partial'].includes(states[d.source]?.status);
    eligible.sort((a,b)=>Number(current(b))-Number(current(a))||(weights[b.tier]||0)-(weights[a.tier]||0)||sourceRank(a)-sourceRank(b)||String(a.title).localeCompare(String(b.title)));
    const clusters=[];
    for(const deck of eligible){
      const group=clusters.find(items=>items.some(other=>{
        if(signature(other)===signature(deck)||String(other.title).split(/\s+/).sort().join('|')===String(deck.title).split(/\s+/).sort().join('|'))return true;
        const shared=other.units.filter(n=>deck.units.includes(n)).length;
        const overlap=shared/Math.max(other.units.length,deck.units.length);
        const sameCarry=(other.carries||[]).some(c=>(deck.carries||[]).some(x=>x[0]===c[0]));
        return shared>=5&&overlap>=.75&&(sameCarry||overlap>=.9);
      }));
      if(group)group.push(deck);else clusters.push([deck]);
    }
    return clusters.flatMap(group=>{
      const positioned=group.filter(completeLayout).sort((a,b)=>Number(current(b))-Number(current(a))||(weights[b.tier]||0)-(weights[a.tier]||0)||sourceRank(a)-sourceRank(b));
      const lead=positioned.find(d=>(d.carries||[]).some(c=>d.units.includes(c[0])&&c.length>1));
      if(!lead)return [];
      const sources=[...new Set(group.map(d=>d.source))];
      const active=sources.filter(s=>['verified','partial'].includes(states[s]?.status));
      const stale=sources.filter(s=>!active.includes(s));
      const newest=group.filter(current);const rated=newest.length?newest:group;
      const tier=rated.reduce((best,d)=>(weights[d.tier]||0)>(weights[best]||0)?d.tier:best,'상위');
      const score=active.length*12+stale.length*2+(weights[tier]||0)*3+Math.max(...rated.map(d=>Math.max(0,21-sourceRank(d))))*.3+Number(current(lead))*5;
      return [{...lead,source:'curated',sources,sourceCount:sources.length,tier,score,layoutVerified:true,carries:(lead.carries||[]).filter(c=>lead.units.includes(c[0])).map(c=>c.slice(0,4)),evidence:`${active.length}개 최신 출처 · ${group.length}개 유사 조합`+(stale.length?` · 보관 출처 ${stale.length}개`:'')+(!current(lead)?' · 배치·아이템은 이전 확인값':''),referenceSource:lead.source,referenceCheckedAt:states[lead.source]?.lastVerifiedAt||null,selectionVersion:1}];
    }).sort((a,b)=>b.score-a.score||String(a.title).localeCompare(String(b.title))).slice(0,15).map((d,index)=>({...d,rank:index+1}));
  }
  root.selectWeeklyDecks=selectWeeklyDecks;
  if(typeof module!=='undefined'&&module.exports)module.exports={selectWeeklyDecks};
})(globalThis);
