import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

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
delete snapshot.sources.mobalytics; snapshot.decks=snapshot.decks.filter(d=>d.source!=='mobalytics');snapshot.schema=2;
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
  return championIds[key] || null;
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
    if (id === 'academy') {
      const page = await browser.newPage({ locale: 'ko-KR', viewport: { width: 1440, height: 1100 } });
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!response?.ok()) throw new Error('HTTP ' + response?.status());
        const links = await page.evaluate(() => {
          const result=[];
          for(const tier of ['A','B']){
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
            for(const entry of detail.slots){const name=championName(entry.id);if(!name||units.includes(name))continue;layout[entry.slot]=name;units.push(name);if(entry.items.length)carries.push([name]);}
            if(units.length<5)continue;
            const reference=old.map(d=>({d,overlap:d.units.filter(n=>units.includes(n)).length})).sort((a,b)=>b.overlap-a.overlap)[0];
            const verified=reference?.overlap>=Math.ceil(Math.min(units.length,reference.d.units.length)*.7)?reference.d:null;
            // Carry item labels are reused only when this is the same champion and original detail URL.
            const precise=carries.map(c=>{const prior=verified?.url===link.url&&verified?.carries?.find(v=>v[0]===c[0]);return prior||c});
            next.push({source:id,tier:link.tier,title:verified?.title||detail.title||units.slice(-2).join(' · '),sourceTitle:detail.title||'',url:link.url,style:'TFT Academy 상세 배치',rank:next.length+1,units,carries:precise,layout,note:'원문 배치 좌표 확인; 아이템은 같은 원문에서 이름이 확인된 경우에만 표시'});
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

snapshot.checkedAt = now;
if (Object.values(snapshot.sources).some(s => ['verified', 'partial'].includes(s.status))) snapshot.publishedAt = now;
await writeFile(file, JSON.stringify(snapshot, null, 2) + '\n');
