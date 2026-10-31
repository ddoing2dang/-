"""Attach reviewed tournament archetype wins, never an exact-board or title claim."""
import json
from pathlib import Path

def attach_tournament_evidence(result):
    path = Path(__file__).resolve().parent.parent / 'data' / 'tournament-evidence.json'
    if not path.exists():
        return
    report = json.loads(path.read_text())
    if report.get('schema') != 1 or report.get('reviewedForPatch') != result['patch']:
        return
    decks = {d['url']: d for d in result['recommendations']}
    for record in report.get('records', []):
        deck = decks.get(record.get('deckRef'))
        if not deck or record.get('kind') != 'archetype-game-win':
            continue
        if sorted(deck['units']) != record.get('reviewedUnits'):
            continue
        if not all(deck.get('equipment', {}).get(n) for n in record.get('requiredCore', [])):
            continue
        games, wins = record.get('games', 0), record.get('wins', 0)
        if not isinstance(games, int) or not isinstance(wins, int) or not 0 < wins <= games:
            continue
        if abs(wins / games * 100 - record.get('sourceWinPercent', -1)) > .0051:
            continue
        deck['tournamentEvidence'] = {**record, **{k: report[k] for k in [
            'reviewedForPatch', 'verifiedAt', 'event', 'stage', 'eventDate', 'dateBasis',
            'eventPatch', 'source', 'sourceUrl', 'eventUrl']}}
