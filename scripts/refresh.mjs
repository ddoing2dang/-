import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const { selectWeeklyDecks } = createRequire(import.meta.url)('./select-decks.cjs');

const root = new URL('../', import.meta.url);
const file = new URL('data/latest.json', root);
const snapshot = JSON.parse(await readFile(file, 'utf8'));
const championIds = JSON.parse(await readFile(new URL('data/champion_ids.json', root), 'utf8'));
const sources = [
  ['lolchess', 'https://lolchess.gg/meta', 'lolchess.gg'],
  ['opgg', 'https://op.gg/tft/meta-trends/comps', 'op.gg'],
  ['metatft', 'https://www.metatft.com/comps', 'metatft.com'],
  ['tactics', 'https://tactics.tools/team-compositions/gm', 'tactics.tools'],
  ['qq', 'https://lol.qq.com/tft/#/wrlineup', 'lol.qq.com'],
  ['academy', 'https://tftacademy.com/tierlist/comps', 'tftacademy.com'],
];
delete snapshot.sources.mobalytics; snapshot.decks=snapshot.decks.filter(d=>d.source!=='mobalytics');snapshot.schema=3;
const now = new Date().toISOString();
const browser = await chromium.launch({ headless: true });

function validLink(url, host) {
  try { return new URL(url).hostname === host || new URL(url).hostname.endsWith('.' + host); }
  catch { return false; }
}
function exactTier(text) {
  const match = text.match(/(?:^|\s|[·|])(?:SS|S|A|B)(?:\s*(?:티어|Tier|级))?(?=$|\s|[·|])/im);
  return match?.[0].trim().match(/SS|S|A|B/)?.[0] || null;
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function championName(id) {
  const key = id.replace(/^DA_(?:18_)?/i, '').replace(/18(?:_[A-Z]+)?$/i, '').replace(/[^A-Za-z]/g, '').toLowerCase();
  return championIds[key] || {sentry:'감시자',sentinel:'감시자',masteryiad:'마스터 이',gnarsmall:'나르',crimsonraptor:'어미 부리',elderdragon:'장로 드래곤'}[key] || null;
}
const championValues = unique(Object.values(championIds));
function rosterFromCandidate(candidate) {
  const text = [candidate.text, ...(candidate.images || [])].join(' ');
  const fromKorean = championValues.filter(name => text.includes(name));
  const fromEnglish = (candidate.images || []).map(value => championName(value));
  return unique([...fromKorean, ...fromEnglish]);
}
function newDeck({ source, tier, rank, url, title, units, style }) {
  const name = title.replace(/\s+/g, ' ').trim().slice(0, 70);
  return { source, tier, title: name, sourceTitle: name, url, style,
    rank, units, carries: [], note: '목록에서 유닛만 확인했습니다. 아이템과 증강은 원문 상세에서 검증되지 않았습니다.' };
}
const ACADEMY_ITEMS={"WarmogsArmor": "워모그의 갑옷", "BrambleVest": "덤불 조끼", "DragonsClaw": "용의 발톱", "InfinityEdge": "무한의 대검", "StrikersFlail": "타격대의 철퇴", "SpearOfShojin": "쇼진의 창", "LastWhisper": "최후의 속삭임", "RedBuff": "붉은 덩굴정령", "Deathblade": "죽음의 검", "GiantSlayer": "거인 학살자", "SteraksGage": "스테락의 도전", "ProtectorsVow": "수호자의 맹세", "ArchangelsStaff": "대천사의 지팡이", "HextechGunblade": "마법공학 총검", "GargoyleStoneplate": "가고일 돌갑옷", "Crownguard": "크라운가드", "VoidStaff": "공허의 지팡이", "RabadonsDeathcap": "라바돈의 죽음모자", "AdaptiveHelm": "적응형 투구", "JeweledGauntlet": "보석 건틀릿", "HandOfJustice": "정의의 손길", "IonicSpark": "이온 충격기", "SpiritVisage": "정령의 형상", "GuinsoosRageblade": "구인수의 격노검", "KrakensFury": "크라켄의 분노", "ThiefsGloves": "도적의 장갑", "Morellonomicon": "모렐로노미콘", "BlueBuff": "푸른 파수꾼", "Evenshroud": "저녁갑주"};
async function updateMetaTft() {
  const response = await fetch('https://api-hc.metatft.com/tft-comps-api/comps_data', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('MetaTFT HTTP ' + response.status);
  const data = await response.json();
  if (data.tft_set !== 'TFTSet18') throw new Error('다른 세트 데이터이므로 보관본 유지');
  const clusters = Object.values(data.results?.data?.cluster_details || {})
    .filter(c => c.overall?.count >= 10000 && Number.isFinite(c.overall?.avg))
    .sort((a, b) => a.overall.avg - b.overall.avg).slice(0, 20);
  if (clusters.length < 5) throw new Error('통계 표본이 부족합니다');
  const oldDecks = snapshot.decks.filter(d => d.source === 'metatft');
  let matched = 0;
  const next = [];
  for (let rank = 0; rank < clusters.length; rank++) {
    const c = clusters[rank];
    const roster = unique(c.units_string.split(',').map(x => championName(x.trim())));
    if (roster.length < 5) continue;
    const match = oldDecks.map(d => {
      const overlap = d.units.filter(name => roster.includes(name)).length;
      return { d, score: overlap / Math.max(d.units.length, roster.length) };
    }).sort((a, b) => b.score - a.score)[0];
    const tier = c.overall.avg <= 4.2 ? 'S' : c.overall.avg <= 4.6 ? 'A' : 'B';
    const style = `MetaTFT · 평균 순위 ${c.overall.avg.toFixed(2)} · ${c.overall.count.toLocaleString()}판`;
    if (match && match.score >= .65 && roster.includes(match.d.carries?.[0]?.[0]) && !match.d._matched) {
      match.d._matched = true;
      next.push({ ...match.d, tier, rank: rank + 1, style, units: roster });
      matched++;
    } else {
      next.push(newDeck({ source: 'metatft', tier, rank: rank + 1, url: 'https://www.metatft.com/comps',
        title: `${roster.slice(-2).join(' · ')} 조합`, units: roster, style }));
    }
  }
  oldDecks.forEach(d => delete d._matched);
  if (next.length < 5) throw new Error('표시할 수 있는 덱이 부족합니다');
  snapshot.decks = snapshot.decks.filter(d => d.source !== 'metatft').concat(next);
  snapshot.sources.metatft = { status: next.length === 20 ? 'verified' : 'partial', lastVerifiedAt: now, matched: next.length, total: 20, url: 'https://www.metatft.com/comps', patchSet: data.tft_set };
  console.log('metatft: ' + next.length + '/20 comps, ' + matched + ' prior guides matched');
}

try {
  for (const [id, url, host] of sources) {
    if (id === 'metatft') {
      try { await updateMetaTft(); }
      catch (error) { snapshot.sources[id] = { ...snapshot.sources[id], status: 'stale', checkedAt: now, error: String(error.message).slice(0, 180), url }; console.warn(id + ': retained prior data: ' + error.message); }
      continue;
    }
    if (id === 'opgg') {
      const tierUrl='https://op.gg/ko/tft/tier-list';
      const page=await browser.newPage({locale:'ko-KR'});
      let diagnostics={url:tierUrl};
      try{
        const response=await page.goto(tierUrl,{waitUntil:'domcontentloaded',timeout:30000});
        diagnostics.http=response?.status();
        if(!response?.ok())throw Error('OP.GG 티어리스트 HTTP '+response?.status());
        await page.waitForTimeout(1500);
        diagnostics=await page.evaluate(()=>{
          const scripts=[...document.querySelectorAll('script')].map(x=>x.textContent||'');
          const chunks=scripts.filter(x=>x.startsWith('self.__next_f.push(')).map(x=>{try{return JSON.parse(x.slice('self.__next_f.push('.length,-1))}catch{return null}}).filter(x=>x?.[0]===1).map(x=>x[1]).join('');
          const parsed=[];
          for(const line of chunks.split('\n')){const colon=line.indexOf(':');if(colon<0)continue;try{const v=JSON.parse(line.slice(colon+1));parsed.push(v)}catch{}}
          const arrays=[];const objects=[];
          function walk(x,path,depth){if(!x||typeof x!=='object'||depth>20)return;if(Array.isArray(x)&&x.length&&typeof x[0]==='object'&&!Array.isArray(x[0])&&x.length>=3)arrays.push({path,length:x.length,sample:x.slice(0,2)});if(!Array.isArray(x)&&Object.keys(x).some(k=>/tier|deck|comp|position/i.test(k)))objects.push({path,keys:Object.keys(x),value:x});for(const [k,v] of Object.entries(x))walk(v,path+'.'+k,depth+1)}
          parsed.forEach((v,i)=>walk(v,String(i),0));
          return {url:location.href,text:document.body.innerText.slice(0,12000),arrays:arrays.slice(0,20),objects:objects.slice(0,8),flightLines:chunks.split('\n').length,flightSample:chunks.split('\n').filter(x=>/tier|deck|composition|tftlabs/i.test(x)).map(x=>x.slice(0,2000)).slice(0,6)};
        });
        throw Error('티어리스트 구조 검증 중');
      }catch(error){snapshot.sources[id]={...snapshot.sources[id],status:'stale',checkedAt:now,url:tierUrl,error:String(error.message),diagnostics};console.warn(error.message)}
      finally{await page.close()}
      continue;
    }
    if (id === 'lolchess') {
      const page=await browser.newPage({locale:'ko-KR'});
      try{
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});if(!response?.ok())throw Error('HTTP '+response?.status());
        const payload=await page.evaluate(()=>JSON.parse(document.querySelector('#__NEXT_DATA__')?.textContent||'null'));
        const queries=payload?.props?.pageProps?.dehydratedState?.queries||[];
        const read=key=>queries.find(q=>q.queryKey?.[0]===key)?.state?.data;
        const champions=new Map((read('championRefs')?.champions||[]).map(c=>[c.key,c.name]));
        const items=new Map((read('itemRefs')?.items||[]).map(c=>[c.key,c.name]));
        const guides=(read('getGuideDecks')?.guideDecks||[]).filter(d=>d.season==='set18'&&!/요약/.test(d.name)).slice(0,20);
        const decks=guides.map((guide,rank)=>{
          const layout={},units=[],carries=[];
          for(const slot of guide.data?.slots||[]){const name=champions.get(slot.champion),idx=Number(slot.index);if(!name||!Number.isInteger(idx)||idx<0||idx>=28||units.includes(name))continue;layout[idx]=name;units.push(name);const equipped=(slot.items||[]).map(item=>items.get(item)).filter(Boolean).slice(0,3);if(equipped.length)carries.push([name,...equipped]);}
          return {source:id,tier:'상위',title:guide.name,sourceTitle:guide.name,url:'https://lolchess.gg/builder/guide/'+guide.teamBuilderKey+'?type=guide',style:'LoLCHESS 공략',rank:rank+1,units,carries:carries.sort((a,b)=>b.length-a.length).slice(0,3),layout,note:'원문 공략의 배치와 해당 유닛 아이템'};
        }).filter(d=>d.units.length>=5);
        if(decks.length<5)throw Error('공략 배치 확인 수 부족');
        snapshot.decks=snapshot.decks.filter(d=>d.source!==id).concat(decks);
        snapshot.sources[id]={status:decks.length===20?'verified':'partial',lastVerifiedAt:now,matched:decks.length,total:20,url};
        console.log('lolchess: '+decks.length+'/20');
      }catch(error){snapshot.sources[id]={...snapshot.sources[id],status:'stale',checkedAt:now,error:String(error.message).slice(0,180),url};console.warn('lolchess: retained prior data: '+error.message)}
      finally{await page.close()}
      continue;
    }
    if (id === 'tactics') {
      const page=await browser.newPage({locale:'ko-KR'});
      try{
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});if(!response?.ok())throw Error('HTTP '+response?.status());
        const payload=await page.evaluate(()=>JSON.parse(document.querySelector('#__NEXT_DATA__')?.textContent||'null'));
        const groups=payload?.props?.pageProps?.initialData?.groups||[];
        const next=[];
        for(const group of groups){
          for(const comp of (group.full?.comps||[]).filter(c=>c.count>=30).slice(0,20)){
            const units=unique(comp.units.map(championName));if(units.length<5)continue;
            const carried=(group.full?.carryUnits||[]).map(x=>championName(x[0])).filter(name=>units.includes(name)).slice(0,3);
            const carries=carried.map(name=>{const source=(group.full?.unitItems||[]).filter(x=>championName(x.unitId)===name).sort((a,b)=>b.count-a.count).slice(0,3);return [name,...source.map(x=>ACADEMY_ITEMS[String(x.itemId).replace(/^DA_/,'')]).filter(Boolean)]});
            const title=carried.slice(0,2).join(' · ')+' 조합';
            next.push({source:id,tier:'상위',title,sourceTitle:title,url,style:'GM 통계 · 평균 순위 '+comp.place.toFixed(2)+' · '+comp.count+'판',rank:next.length+1,units,carries,note:'GM 공개 통계의 변형 조합. 배치 좌표는 다른 동일 계열 공략을 참고'});
            if(next.length>=20)break;
          }
          if(next.length>=20)break;
        }
        if(next.length<5)throw Error('GM 표본 부족');
        snapshot.decks=snapshot.decks.filter(d=>d.source!==id).concat(next);
        snapshot.sources[id]={status:next.length===20?'verified':'partial',lastVerifiedAt:now,matched:next.length,total:20,url};
        console.log('tactics: '+next.length+'/20 variants');
      }catch(error){snapshot.sources[id]={...snapshot.sources[id],status:'stale',checkedAt:now,error:String(error.message).slice(0,180),url};console.warn('tactics: retained prior data: '+error.message)}
      finally{await page.close()}
      continue;
    }
    if (id === 'academy') {
      const page = await browser.newPage({ locale: 'ko-KR', viewport: { width: 1440, height: 1100 } });
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!response?.ok()) throw new Error('HTTP ' + response?.status());
        const links = await page.evaluate(() => {
          const result=[];
          for(const tier of ['S','A','B','C']){
            const parent=document.querySelector('.tier-'+tier) || [...document.querySelectorAll('*')].find(e=>e.className?.includes?.('tier-'+tier));
            for(const a of parent?.querySelectorAll('a[href*="/tierlist/comps/set-18-"]') || [])if(!result.some(x=>x.url===a.href))result.push({url:a.href,tier});
          }
          return result.slice(0,20);
        });
        const old=snapshot.decks.filter(d=>d.source==='academy');
        const next=[];
        for(const link of links){
          try{
            await page.goto(link.url,{waitUntil:'domcontentloaded',timeout:20000});
            const detail=await page.evaluate(()=>{
              const label=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()==='Positioning Example');
              const grid=label?.parentElement?.querySelector('[class*="w-[100%]"]');
              if(!grid)return null;
              const slots=[];
              [...grid.children].slice(0,4).forEach((row,y)=>[...row.children].forEach((cell,x)=>{
                const icon=cell.querySelector('img[src*="champion_icons"]');
                if(icon&&x>0&&x<8)slots.push({slot:y*7+x-1,id:icon.src.split('/').pop().replace(/\.webp$/,''),items:[...cell.querySelectorAll('img[src*="/items/"]')].map(img=>img.src.split('/').pop().replace(/\.webp$/,''))});
              }));
              return {title:document.querySelector('h1')?.innerText?.replace(/^Comps\s+/i,'').trim(),slots};
            });
            if(!detail?.slots?.length)continue;
            const layout={},units=[],carries=[];
            for(const entry of detail.slots){const name=championName(entry.id);if(!name||units.includes(name))continue;layout[entry.slot]=name;units.push(name);if(entry.items.length)carries.push([name,...entry.items.map(id=>ACADEMY_ITEMS[id.replace(/^DA_/, '')]).filter(Boolean).slice(0,3)]);}
            if(units.length<5)continue;
            const reference=old.map(d=>({d,overlap:d.units.filter(n=>units.includes(n)).length})).sort((a,b)=>b.overlap-a.overlap)[0];
            const verified=reference?.overlap>=Math.ceil(Math.min(units.length,reference.d.units.length)*.7)?reference.d:null;
            // Carry item labels are reused only when this is the same champion and original detail URL.
            const precise=carries;
            next.push({source:id,tier:link.tier,title:verified?.title||detail.title||units.slice(-2).join(' · '),sourceTitle:detail.title||'',url:link.url,style:'TFT Academy 상세 배치',rank:next.length+1,units,carries:precise,layout,note:'원문 배치 좌표 확인; 아이템은 새 원문 칸에서 유닛별로 확인된 경우에만 표시'});
          }catch(error){console.warn('academy detail:',String(error.message).slice(0,100));}
        }
        if(next.length<5)throw new Error('Academy 상세 덱을 5개 이상 확인하지 못함');
        snapshot.decks=snapshot.decks.filter(d=>d.source!==id).concat(next);
        snapshot.sources[id]={status:next.length===20?'verified':'partial',lastVerifiedAt:now,matched:next.length,total:20,url};
        console.log('academy: '+next.length+'/20');
      }catch(error){snapshot.sources[id]={...snapshot.sources[id],status:'stale',checkedAt:now,error:String(error.message).slice(0,180),url};console.warn('academy: retained verified prior data: '+error.message)}
      finally{await page.close()}
      continue;
    }
    const page = await browser.newPage({ locale: 'ko-KR', viewport: { width: 1440, height: 1100 } });
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!response?.ok()) throw new Error('HTTP ' + response?.status());
      await page.waitForTimeout(3500);
      const candidates = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => {
        const card = a.closest('article, li, [class*="comp"], [class*="card"], [class*="lineup"]') || a.parentElement;
        const text = (card?.innerText || '').slice(0, 1200);
        const images = [...(card?.querySelectorAll('img') || [])].map(img => img.alt || img.title || '').filter(Boolean).slice(0, 28);
        return { href: a.href, label: a.innerText.trim().slice(0, 180), text, images };
      }));
      const previous = snapshot.decks.filter(d => d.source === id);
      const confirmed = [];
      for (const old of previous) {
        const oldUrl = new URL(old.url);
        const position = candidates.findIndex(c => {
          if (!validLink(c.href, host)) return false;
          const link = new URL(c.href);
          const exactUrl = oldUrl.pathname !== '/' && link.pathname === oldUrl.pathname && link.hash === oldUrl.hash;
          const exactTitle = (c.label === old.sourceTitle || c.label === old.title) && c.label.length >= 4;
          return exactUrl || exactTitle;
        });
        if (position < 0) continue;
        const match = candidates[position];
        const tier = exactTier(match.text);
        // Sites with no tier are ordered recommendation lists; keep their original display convention.
        if (!tier && !['lolchess', 'tactics'].includes(id)) continue;
        confirmed.push({ old, tier: tier || '상위', position });
      }
      const ranked = [];
      const used = new Set();
      for (let position = 0; position < candidates.length && ranked.length < 20; position++) {
        const candidate = candidates[position];
        if (!validLink(candidate.href, host)) continue;
        const tier = exactTier(candidate.text) || (['lolchess', 'tactics'].includes(id) ? '상위' : null);
        if (!tier) continue;
        const old = confirmed.find(x => x.position === position)?.old;
        const units = rosterFromCandidate(candidate);
        if (!old && (units.length < 5 || units.length > 12)) continue;
        const title = (candidate.label || candidate.text.split('\n').find(line => line.trim().length > 3) || '').trim();
        if (!old && (title.length < 4 || title.length > 80)) continue;
        const signature = old ? old.units.slice().sort().join('|') : units.slice().sort().join('|');
        if (used.has(signature)) continue;
        used.add(signature);
        if (old) ranked.push({ ...old, rank: ranked.length + 1, tier });
        else ranked.push(newDeck({ source: id, tier, rank: ranked.length + 1, url: candidate.href,
          title, units, style: `${id} · 목록 추천` }));
      }
      if (ranked.length < 5) throw new Error('검증된 덱이 5개 미만이라 보관본 유지');
      snapshot.decks = snapshot.decks.filter(d => d.source !== id).concat(ranked);
      snapshot.sources[id] = { status: ranked.length === 20 ? 'verified' : 'partial', lastVerifiedAt: now, matched: ranked.length, total: 20, url };
      console.log(id + ': ' + ranked.length + '/20 ranked decks, ' + confirmed.length + ' prior guides matched');
    } catch (error) {
      snapshot.sources[id] = { ...snapshot.sources[id], status: 'stale', checkedAt: now, error: String(error.message).slice(0, 180), url };
      console.warn(id + ': retained prior data: ' + error.message);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }

async function refreshRankEvidence(){
 const base='https://tft.dakgg.io/api/v1';
 const get=async u=>{const r=await fetch(u,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json()};
 const season=(await get(base+'/seasons')).kr?.[0];
 if(season!=='set18')throw Error('현재 랭킹 시즌이 18이 아님');
 const board=await get(base+'/leaderboards/summoners/kr?hl=ko&season='+season+'&tier=CHALLENGER&queueId=1100&page=0');
 const players=(board.summonerRankings||[]).filter(p=>p.tier==='CHALLENGER'&&p.gameName&&p.tagLine).slice(0,10);
 if(players.length!==10)throw Error('랭킹 TOP10 확인 실패');
 const records=await Promise.allSettled(players.map(async p=>({p,matches:(await get(base+'/summoners/kr/'+encodeURIComponent(p.gameName+'-'+p.tagLine)+'/matches?season='+season+'&page=1&size=20')).matches||[]})));
 let loaded=0,tops=0,unmatched=0;const seen=new Set(),counts={};
 for(const record of records){if(record.status!=='fulfilled')continue;loaded++;const {p,matches}=record.value;for(const m of matches){const part=(m.participants||[]).find(x=>x.puuid===p.puuid),key=m.matchId+'_'+p.puuid;if(!part||seen.has(key)||Number(part.placement)<1||Number(part.placement)>4)continue;seen.add(key);tops++;
  const names=new Set((part.units||[]).map(u=>championName(String(u.character_id||u.characterId||u.name||''))).filter(Boolean));
  const candidates=snapshot.decks.map(d=>({d,overlap:d.units.filter(n=>names.has(n)).length})).filter(x=>x.overlap>=5&&x.overlap/x.d.units.length>=.65).sort((a,b)=>b.overlap/b.d.units.length-a.overlap/a.d.units.length||b.overlap-a.overlap);
  if(!candidates.length){unmatched++;continue}const signature=unique(candidates[0].d.units).sort().join('|');counts[signature]=(counts[signature]||0)+1;
 }}
 if(loaded<5||tops<5)throw Error('랭킹 전적 표본 부족');
 snapshot.rankEvidence={asOf:now,season,playerCount:loaded,top4:tops,unmatched,counts};
 console.log('ranking TOP10:',loaded,'players',tops,'TOP4 boards');
}
try{await refreshRankEvidence()}catch(error){console.warn('ranking: retained prior evidence:',error.message)}

snapshot.checkedAt = now;
const candidateRecommendations = selectWeeklyDecks(snapshot);
const sourceReports = sources.map(([id,url])=>{
 const status=snapshot.sources[id]||{};
 const refreshed=['verified','partial'].includes(status.status)&&status.lastVerifiedAt===now;
 return {id,url,status:refreshed?status.status:'stale',collected:refreshed?Number(status.matched)||0:0,target:20,retained:snapshot.decks.filter(d=>d.source===id).length,lastVerifiedAt:status.lastVerifiedAt||null,error:refreshed?null:status.error||'이번 실행에서 확인하지 못했습니다'};
});
const freshCount=sourceReports.filter(s=>s.collected>0).length;
const published=freshCount>0&&candidateRecommendations.length===15;
if(published){snapshot.recommendations=candidateRecommendations;snapshot.publishedAt=now;}
snapshot.refreshReport={checkedAt:now,status:published?(sourceReports.every(s=>s.collected===20)?'complete':'partial'):'failed',published,recommendationCount:snapshot.recommendations?.length||0,sourceReports,schedule:{timezone:'Asia/Seoul',day:'Thursday',hour:9},selectionVersion:1};
await writeFile(file, JSON.stringify(snapshot, null, 2) + '\n');
console.log('REFRESH_REPORT',JSON.stringify(snapshot.refreshReport));
if(!published){console.error('갱신 조건 미달: 이전 추천과 게시 시각을 유지합니다.');process.exitCode=1;}



