"""PC mini-guide fields, preserving each source's boards and priority order."""
import unicodedata

def attach_pc_guides(result, guides, champions, items, source_dir):
    by_slug={g['compSlug']:g for g in guides if g.get('isPublic')}
    name_map={unicodedata.normalize('NFC',c['name']):c for c in champions.values()}
    def item(key):
        r=items.get(key)
        return {'name':r['name'],'url':r['imageUrl']} if r else None
    for deck in result['recommendations']:
        raw=by_slug.get(deck['url'].rsplit('/',1)[-1])
        if not raw:continue
        guide={'source':'academy','url':deck['url'],'updatedAt':raw['updated'],'early':[],
               'priority':[],'levelPlans':[],'options':deck.get('levelUpOptions',[]),
               'augmentTypes':[{'ECON':'경제','ITEMS':'아이템','COMBAT':'전투'}.get(x,x) for x in raw.get('augmentTypes',[])],
               'augmentNote':raw.get('augmentsTip',''),'itemAlternatives':[]}
        for unit in raw.get('earlyComp',[]):
            c=champions.get(unit['apiName'])
            if c:guide['early'].append({'name':c['name'],'url':c['imageUrl']})
        guide['priority']=[r for x in raw.get('carousel',[]) if (r:=item(x['apiName']))]
        for alt in raw.get('altBuilds',[]):
            c=champions.get(alt['apiName']);its=[r for k in alt.get('items',[]) if (r:=item(k))]
            if c and its:guide['itemAlternatives'].append({'unit':c['name'],'items':its})
        # Match final comp first, then display the source's early boards separately.
        target=set(deck['units'])-set(deck.get('summons',[]));matches=[]
        for other in result['decks']:
            if other['source']!='opgg':continue
            units=set(other['units']);overlap=len(target&units)/max(len(target),len(units),1)
            if overlap>=.70 and (deck.get('mainCarry') in units or overlap>=.9):matches.append((overlap,other))
        matches.sort(key=lambda x:(-x[0],x[1]['rank']))
        if matches:
            overlap,other=matches[0];file=source_dir/('opgg-'+str(other['sourceId'])+'.json')
            if file.exists():
                import json
                details=json.loads(file.read_text())
                for buildup in details['comp'].get('buildup',[]):
                    for level,board in buildup.get('boards',{}).items():
                        if level not in ['5','6','7','8','9'] or not board:continue
                        units=[]
                        for slot in board:
                            n=unicodedata.normalize('NFC',slot.get('champion',{}).get('name',''))
                            c=name_map.get(n)
                            if not c:break
                            units.append({'name':c['name'],'url':c['imageUrl']})
                        else:
                            if len({u['name'] for u in units})==len(units):
                                guide['levelPlans'].append({'level':int(level),'title':buildup.get('name','빌드업'),
                                    'source':'opgg','url':other['url'],'patch':details['patch'],
                                    'match':'동일 공략 빌드업' if overlap==1 else '유사 공략 빌드업','units':units})
        deck['pcGuide']=guide
