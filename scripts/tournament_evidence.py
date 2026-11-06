"""Attach historical game wins to reviewed guide archetypes, including pivot-only decks."""
import json
from pathlib import Path

def attach_tournament_evidence(result):
    path=Path(__file__).resolve().parent.parent/'data'/'tournament-evidence.json'
    report=json.loads(path.read_text()) if path.exists() else {}
    if report.get('schema')!=2:return
    for deck in result.get('decks',[])+result.get('recommendations',[]):
        deck.pop('tournamentEvidence',None)
        matches=[]
        for r in report['records']:
            if r.get('kind')!='archetype-game-win' or r.get('deckRef')!=deck['url']:continue
            if sorted(deck['units'])!=r.get('reviewedUnits'):continue
            if not all(n in deck.get('equipment',{}) for n in r.get('requiredCore',[])):continue
            if not (isinstance(r.get('games'),int) and isinstance(r.get('wins'),int) and 0<r['wins']<=r['games']):continue
            if abs(r['wins']/r['games']*100-r.get('sourceWinPercent',-1))>.0051:continue
            matches.append(r)
        if matches:
            matches.sort(key=lambda r:(bool(r.get('player')),r.get('eventDate') or r.get('sourcePublishedAt') or ''),reverse=True)
            deck['tournamentEvidence']={**matches[0],'records':matches}
