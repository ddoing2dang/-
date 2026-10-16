"""Attach evidence-backed trends without treating average placement as win rate."""
import datetime as dt
import math

def stamp(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))

def attach_trends(result, meta, stats, champions, previous):
    updated = dt.datetime.fromtimestamp(stats['updated'] / 1000, dt.timezone.utc)
    daily_updated = dt.datetime.fromtimestamp(meta['updated'] / 1000, dt.timezone.utc)
    scope = {'source': 'metatft', 'patch': result['patch'], 'set': stats['tft_set'],
             'queue': stats['queue_id'], 'clusters': stats['cluster_id'],
             'endpoint': 'https://api-hc.metatft.com/tft-comps-api/comps_stats', 'filters': 'default'}
    if any(meta[k] != stats[k] for k in ['tft_set', 'queue_id', 'cluster_id']):
        raise ValueError('MetaTFT statistics scope mismatch')
    rows = {str(s['cluster']): s for s in stats['results'] if s['cluster']}
    clusters = meta['results']['data']['cluster_details']
    snapshot = {'scope': scope, 'updatedAt': updated.isoformat(), 'records': {}}
    for key, comp in clusters.items():
        places = rows.get(str(key), {}).get('places', [])[:8]
        if len(places) != 8 or any(not isinstance(n, (int, float)) or not math.isfinite(n) or n < 0 for n in places):
            continue
        count = sum(places)
        if not count:
            continue
        units = sorted(s.strip() for s in comp['units_string'].split(','))
        snapshot['records'][str(key)] = {'units': units, 'count': count, 'wins': places[0], 'winRate': places[0] / count}
    history = [h for h in previous.get('statisticsHistory', []) if h.get('scope') == scope
               and dt.timedelta(0) < updated - stamp(h['updatedAt']) <= dt.timedelta(days=14)]
    history.sort(key=lambda h: h['updatedAt'])
    baselines = [h for h in history if dt.timedelta(hours=12) <= updated - stamp(h['updatedAt']) <= dt.timedelta(days=8)]
    baseline = baselines[-1] if baselines else None
    trend_map = {}
    for key, comp in clusters.items():
        key = str(key)
        current = snapshot['records'].get(key)
        info = {'source': 'metatft', 'url': 'https://www.metatft.com/comps', 'sourceId': key,
                'updatedAt': updated.isoformat(), 'winStatus': 'baseline-needed', 'pickStatus': 'insufficient-data', 'badges': []}
        if current:
            info['winRate'] = current['winRate']
            info['count'] = current['count']
        old = baseline['records'].get(key) if baseline else None
        if current and old and old['units'] == current['units'] and min(old['count'], current['count']) >= 1000:
            change = current['winRate'] - old['winRate']
            relative = change / old['winRate'] if old['winRate'] else None
            info.update(winStatus='compared', winDeltaPp=change * 100, winPreviousAt=baseline['updatedAt'])
            if change >= .02 and relative is not None and relative >= .10:
                info['badges'].append({'kind': 'win', 'label': '승률 급상승', 'deltaPp': round(change * 100, 2),
                    'relativePercent': round(relative * 100, 1), 'from': baseline['updatedAt'], 'to': updated.isoformat(),
                    'previousRate': old['winRate'], 'currentRate': current['winRate'],
                    'previousCount': old['count'], 'currentCount': current['count']})
        days = sorted([d for d in comp.get('trends', []) if stamp(d['day']).date() < daily_updated.date()], key=lambda d: d['day'])
        if len(days) >= 2:
            a, b = days[-2:]
            if (stamp(b['day']) - stamp(a['day']) == dt.timedelta(days=1)
                    and stamp(b['day']).date() == daily_updated.date() - dt.timedelta(days=1)
                    and min(a['count'], b['count']) >= 1000 and 0 < a['pick'] <= 1 and 0 <= b['pick'] <= 1):
                delta = b['pick'] - a['pick']
                relative = delta / a['pick']
                info.update(pickStatus='compared', pickRate=b['pick'], pickDeltaPp=delta * 100)
                if delta >= .002 and relative >= .20:
                    info['badges'].append({'kind': 'pick', 'label': '픽 급상승', 'deltaPp': round(delta * 100, 2),
                        'relativePercent': round(relative * 100, 1), 'from': a['day'], 'to': b['day'],
                        'previousRate': a['pick'], 'currentRate': b['pick'],
                        'previousCount': a['count'], 'currentCount': b['count']})
        trend_map[key] = info
    for deck in result['recommendations']:
        target = set(deck['units']) - set(deck.get('summons', []))
        matches = []
        for key, comp in clusters.items():
            ids = [s.strip() for s in comp['units_string'].split(',')]
            if any(s not in champions for s in ids):
                continue
            units = {champions[s]['name'] for s in ids}
            overlap = len(units & target) / max(len(units), len(target), 1)
            if overlap >= .85 and deck.get('mainCarry') in units:
                matches.append((overlap, str(key), units))
        matches.sort(key=lambda x: (-x[0], x[1]))
        # Ambiguous equally close compositions are not assigned a trend badge.
        if matches and (len(matches) == 1 or matches[0][0] > matches[1][0]):
            overlap, key, units = matches[0]
            deck['trend'] = dict(trend_map[key], match='동일 구성' if units == target else '유사 구성', overlap=overlap)
        else:
            deck['trend'] = {'source': 'metatft', 'badges': [], 'winStatus': 'unmatched', 'pickStatus': 'unmatched'}
    # Keep one observation per UTC date for comparison across refreshes.
    by_day = {stamp(h['updatedAt']).date().isoformat(): h for h in history}
    by_day[updated.date().isoformat()] = snapshot
    result['statisticsHistory'] = [by_day[k] for k in sorted(by_day)][-14:]
    result['trendPolicy'] = {'version': 1, 'source': 'MetaTFT', 'winDefinition': '1위 비율',
        'winMinimumDeltaPp': 2, 'winMinimumRelativePercent': 10, 'pickMinimumDeltaPp': .2,
        'pickMinimumRelativePercent': 20, 'minimumGames': 1000,
        'winComparison': '같은 패치·집계 조건의 직전 수집값 대비(12시간~8일 간격)',
        'pickComparison': 'UTC 기준 최근 완료된 두 날짜 비교', 'winBaselineReady': baseline is not None,
        'updatedAt': updated.isoformat()}
