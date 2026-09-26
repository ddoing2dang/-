import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const file = new URL('data/latest.json', root);
const snapshot = JSON.parse(await readFile(file, 'utf8'));
const knownUnits = new Set(JSON.parse(await readFile(new URL('data/catalog.json', root), 'utf8')));
const championIds = JSON.parse(await readFile(new URL('data/champion_ids.json', root), 'utf8'));
const sources = [
  ['lolchess', 'https://lolchess.gg/meta', 'lolchess.gg'],
  ['opgg', 'https://op.gg/tft/tier-list', 'op.gg'],
  ['metatft', 'https://www.metatft.com/comps', 'metatft.com'],
  ['tactics', 'https://tactics.tools/ko/team-compositions', 'tactics.tools'],
  ['qq', 'https://lol.qq.com/tft/#/index', 'lol.qq.com'],
  ['mobalytics', 'https://mobalytics.gg/tft/team-comps', 'mobalytics.gg'],
];
const now = new Date().toISOString();
const browser = await chromium.launch({ headless: true });

function validLink(url, host) {
  try { return new URL(url).hostname === host || new URL(url).hostname.endsWith('.' + host); }
  catch { return false; }
}
function exactTier(text) {
  const match = text.match(/(?:^|\s|[·|])(?:SS|S|A)(?:\s*(?:티어|Tier|级))?(?=$|\s|[·|])/im);
  return match?.[0].trim().match(/SS|S|A/)?.[0] || null;
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function championName(id) {
  const key = id.replace(/^DA_(?:18_)?/i, '').replace(/18(?:_[A-Z]+)?$/i, '').replace(/[^A-Za-z]/g, '').toLowerCase();
  return championIds[key] || null;
}
async function updateMetaTft() {
  const response = await fetch('https://api-hc.metatft.com/tft-comps-api/comps_data', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('MetaTFT HTTP ' + response.status);
  const data = await response.json();
  if (data.tft_set !== 'TFTSet18') throw new Error('다른 세트 데이터이므로 보관본 유지');
  const clusters = Object.values(data.results?.data?.cluster_details || {})
    .filter(c => c.overall?.count >= 10000 && Number.isFinite(c.overall?.avg))
    .sort((a, b) => a.overall.avg - b.overall.avg).slice(0, 5);
  if (clusters.length < 5) throw new Error('통계 표본이 부족합니다');
  const oldDecks = snapshot.decks.filter(d => d.source === 'metatft');
  let matched = 0;
  for (let rank = 0; rank < clusters.length; rank++) {
    const c = clusters[rank];
    const roster = unique(c.units_string.split(',').map(x => championName(x.trim())));
    if (roster.length < 5) continue;
    const match = oldDecks.map(d => {
      const overlap = d.units.filter(name => roster.includes(name)).length;
      return { d, score: overlap / Math.max(d.units.length, roster.length) };
    }).sort((a, b) => b.score - a.score)[0];
    if (!match || match.score < .55 || match.d._matched) continue;
    match.d._matched = true;
    match.d.rank = rank + 1;
    match.d.tier = c.overall.avg <= 4.2 ? 'S' : 'A';
    match.d.units = roster;
    match.d.style = `MetaTFT · 평균 순위 ${c.overall.avg.toFixed(2)} · ${c.overall.count.toLocaleString()}판`;
    matched++;
  }
  oldDecks.forEach(d => delete d._matched);
  if (!matched) throw new Error('상위 통계와 연결되는 기존 덱이 없습니다');
  snapshot.sources.metatft = { status: matched === oldDecks.length ? 'verified' : 'partial', lastVerifiedAt: now, matched, total: oldDecks.length, url: 'https://www.metatft.com/comps', patchSet: data.tft_set };
  console.log('metatft: ' + matched + '/' + oldDecks.length + ' decks matched with public stats');
}

try {
  for (const [id, url, host] of sources) {
    if (id === 'metatft') {
      try { await updateMetaTft(); }
      catch (error) { snapshot.sources[id] = { ...snapshot.sources[id], status: 'stale', checkedAt: now, error: String(error.message).slice(0, 180), url }; console.warn(id + ': retained prior data: ' + error.message); }
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
        const images = [...(card?.querySelectorAll('img[alt], img[title]') || [])].map(img => img.alt || img.title);
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
        const roster = unique(match.images.filter(name => knownUnits.has(name)));
        confirmed.push({ old, tier: tier || '상위', roster, position });
      }
      if (!confirmed.length) throw new Error('확인 가능한 덱 링크와 등급이 없습니다');
      confirmed.sort((a, b) => a.position - b.position);
      for (let index = 0; index < confirmed.length; index++) {
        const { old, tier, roster } = confirmed[index];
        old.tier = tier;
        old.rank = index + 1;
        // Only replace a roster if at least five actual champion image labels were read
        // from that same source card. Item and augment labels require separate verification.
        if (roster.length >= 5) old.units = roster.slice(0, 10);
      }
      snapshot.sources[id] = { status: confirmed.length === previous.length ? 'verified' : 'partial', lastVerifiedAt: now, matched: confirmed.length, total: previous.length, url };
      console.log(id + ': ' + confirmed.length + '/' + previous.length + ' ranked decks verified');
    } catch (error) {
      snapshot.sources[id] = { ...snapshot.sources[id], status: 'stale', checkedAt: now, error: String(error.message).slice(0, 180), url };
      console.warn(id + ': retained prior data: ' + error.message);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }

snapshot.checkedAt = now;
if (Object.values(snapshot.sources).some(s => ['verified', 'partial'].includes(s.status))) snapshot.publishedAt = now;
await writeFile(file, JSON.stringify(snapshot, null, 2) + '\n');
