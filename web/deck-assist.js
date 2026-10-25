/* Explicitly separate source builds from situational suggestions. Never auto-equip. */
window.MattoAssist=(()=>{
 const reviewed={
 '마스터 이':[['피바라기','흡혈·보호막이 필요할 때 고려해요. 밤의 끝자락의 대상 해제 효과를 대신하지는 못해요.'],['스테락의 도전','근접 생존과 공격력 보강용이에요. 구인수의 지속 공속 효과를 대신하지는 못해요.']],
 '조약돌':[['쇼진의 창','마나 수급을 보완하는 선택지예요. 푸른 파수꾼과 스킬 시전 주기가 달라져요.'],['대천사의 지팡이','긴 전투에서 주문력을 쌓는 선택지예요. 즉시 화력보다 전투 시간이 중요해요.']],
 '카르마':[['쇼진의 창','마나 수급을 보완해요. 푸른 파수꾼과 같은 효과의 교체품은 아니에요.'],['대천사의 지팡이','전투가 길어질 때 주문력을 쌓는 선택지예요. 앞라인이 버텨야 효과를 보기 좋아요.']]
 };
 function alternatives(d,data){
  const normal=new Set(window.TFT_ITEM_POLICY.items.filter(i=>i.category==='normal').map(i=>i.name)),result=[];
  for(const [unit]of d.carries||[]){
   const base=new Set(d.equipment[unit]||[]),found=new Map();
   for(const other of data.decks||[]){if(other.patch!==data.patch||other.url===d.url||!['academy','lolchess'].includes(other.source))continue;
    for(const item of other.equipment?.[unit]||[]){if(!normal.has(item)||base.has(item)||item==='도적의 장갑')continue;
     if(!found.has(item))found.set(item,{name:item,note:'같은 챔피언의 다른 현재 패치 공략에서 사용된 일반 아이템이에요. 조합·다른 장비에 따라 효율이 달라져요.',sources:[]});
     const row=found.get(item);if(!row.sources.some(s=>s.url===other.url))row.sources.push({title:other.title,url:other.url});
    }
   }
   for(const [name,note]of reviewed[unit]||[])if(normal.has(name)&&!base.has(name)&&!found.has(name))found.set(name,{name,note,sources:[]});
   const items=[...found.values()].sort((a,b)=>b.sources.length-a.sources.length||a.name.localeCompare(b.name,'ko')).slice(0,4);
   if(items.length)result.push({unit,items});
  }
  return result;
 }
 return {alternatives};
})();
