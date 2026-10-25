"""Compare consecutive published recommendations; never infer historical tiers."""

def attach_changes(current, previous):
    old = {d['url']: d for d in previous.get('recommendations', [])}
    if not old or not previous.get('publishedAt'):
        return
    changes = {}
    def item_map(deck):
        return {n: sorted(items) for n, items in deck.get('equipment', {}).items() if items}
    for deck in current['recommendations']:
        prior = old.get(deck['url'])
        if not prior:
            changes[deck['url']] = {'new': True}
            continue
        record = {}
        if deck['tier'] != prior['tier']:
            record['tier'] = {'before': prior['tier'], 'after': deck['tier']}
        before, after = item_map(prior), item_map(deck)
        if before != after:
            record['items'] = [{'unit': n, 'before': before.get(n, []), 'after': after.get(n, [])}
                               for n in sorted(set(before) | set(after)) if before.get(n, []) != after.get(n, [])]
        if deck.get('layout') != prior.get('layout'):
            record['board'] = True
        if deck.get('augments') != prior.get('augments'):
            record['augments'] = True
        if [deck.get('sourceTips'), deck.get('sourceAugmentTip')] != [prior.get('sourceTips'), prior.get('sourceAugmentTip')]:
            record['tips'] = True
        if record:
            changes[deck['url']] = record
    current['deckChanges'] = {'from': previous['publishedAt'], 'to': current['publishedAt'],
                             'previousPatch': previous['patch'], 'patch': current['patch'], 'byUrl': changes}
