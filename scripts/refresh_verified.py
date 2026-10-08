import json,re,pathlib,urllib.request,concurrent.futures,hashlib

def balanced(s,start):
 stack=[];quote=None;escape=False
 for i in range(start,len(s)):
  c=s[i]
  if quote:
   if escape:escape=False
   elif c=='\\':escape=True
   elif c==quote:quote=None
  elif c in '\"\'':quote=c
  elif c in '[{':stack.append(c)
  elif c in ']}':
   stack.pop()
   if not stack:return s[start:i+1]
 raise ValueError('unbalanced source data')
def literal(s):
 s=re.sub(r'"(?:\\.|[^"\\])*"|\b([A-Za-z_$][\w$]*)(?=\s*:)',lambda m:json.dumps(m[1]) if m[1] else m[0],s)
 return json.loads(s)
def nextdata(s):return json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',s,re.S).group(1))
def collect(P):
 audit=[]
 def get(name,url):
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept':'text/html,application/json'})
  with urllib.request.urlopen(req,timeout=45) as response:
   if response.status!=200:raise ValueError(name+' HTTP '+str(response.status))
   raw=response.read();s=raw.decode('utf-8');(P/name).write_text(s)
   audit.append({'file':name,'url':url,'sha256':hashlib.sha256(raw).hexdigest()})
   return s
 urls=[('tft-lolchess.txt','https://lolchess.gg/meta'),('tft-augments.txt','https://lolchess.gg/augments/set18'),('tft-academy.txt','https://tftacademy.com/tierlist/comps'),('tft-opgg.txt','https://op.gg/ko/tft/tier-list'),('tft-qq-mode.txt','https://lol.qq.com/tft/js/tft-mode-registry.js'),('tft-meta.txt','https://api-hc.metatft.com/tft-comps-api/comps_data'),('meta-stats.json','https://api-hc.metatft.com/tft-comps-api/comps_stats'),('meta-patch.json','https://api-hc.metatft.com/tft-stat-api/patch')]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(lambda v:get(*v),urls))
 for key in ['lolchess','augments']:(P/('lolchess-data.json' if key=='lolchess' else 'augment-data.json')).write_text(json.dumps(nextdata((P/('tft-'+key+'.txt')).read_text()),ensure_ascii=False))
 s=(P/'tft-academy.txt').read_text();p=s.index('data: [',s.index('node_ids:'));data=literal(balanced(s,s.index('[',p)));(P/'academy-data.json').write_text(json.dumps(data,ensure_ascii=False))
 chunks=[]
 for x in re.findall(r'self\.__next_f\.push\((.*?)\)</script>',(P/'tft-opgg.txt').read_text()):
  try:
   a=json.loads(x)
   if a[0]==1:chunks.append(a[1])
  except json.JSONDecodeError:pass
 found=[]
 def walk(v):
  if isinstance(v,dict):
   if 'comps' in v and 'initialCompDetail' in v:found.append(v)
   for w in v.values():walk(w)
  elif isinstance(v,list):
   for w in v:walk(w)
 for line in ''.join(chunks).splitlines():
  try:walk(json.loads(line.split(':',1)[1]))
  except (ValueError,IndexError):pass
 if len(found)!=1:raise ValueError('OP.GG public data shape changed')
 opgg=found[0];(P/'opgg-data.json').write_text(json.dumps(opgg,ensure_ascii=False))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(lambda c:get('opgg-'+str(c['id'])+'.json','https://op.gg/tft/api/tft/tier-list/comps/'+str(c['id'])+'?locale=ko'),[c for c in opgg['comps'] if c['tierLabel'] in ['S','A','B']]))
 qqurls=re.findall(r"lineupListUrl:\s*'([^']+)'",(P/'tft-qq-mode.txt').read_text());qqurl=next(u for u in qqurls if '/s18/6/lineup_detail_total.json' in u).split('?')[0];get('qq-lineups.json',qqurl)
 (P/'fetch-audit.json').write_text(json.dumps(audit,indent=2))
 return audit

import json,re,datetime,collections,pathlib,copy
import argparse,tempfile
parser=argparse.ArgumentParser();parser.add_argument('--source-dir');parser.add_argument('--output',default='data/latest.json');args=parser.parse_args()
temporary=tempfile.TemporaryDirectory(prefix='tft-sources-') if not args.source_dir else None
P=pathlib.Path(args.source_dir or temporary.name)
if not args.source_dir:collect(P)
read=lambda n:json.loads((P/n).read_text())
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
patch=read('academy-data.json')[0]['data']['patch']
if (P/'meta-patch.json').exists():
 metaPatch=read('meta-patch.json');assert str(metaPatch['patch']) in patch or patch in str(metaPatch['patch']), 'MetaTFT 패치 불일치'
qs=read('lolchess-data.json')['props']['pageProps']['dehydratedState']['queries']
ref=lambda k:next(q['state']['data'] for q in qs if q['queryKey'][0]==k)
champs=ref('championRefs')['champions'];items=ref('itemRefs')['items']
augs=read('augment-data.json')['props']['pageProps']['dehydratedState']['queries'][0]['state']['data']['augments']
def maps(rows):
 out={}
 for r in rows:
  for k in ['key','ingameKey']:out[r.get(k,'')]=r
 return out
cm=maps(champs);im=maps(items);am=maps(augs)
# These aliases are the same unit's published identifiers in the two current sources.
for alias,key in {'DA_18_GnarSmall':'Gnar','DA_Elderwood18_Lifeblossom':'Lifebloom','DA_Elderwood18_StonebarkTree':'StonebarkTree','DA_Elderwood18_Protector':'DeepwoodProtector','DA_Lux18_Base':'Lux'}.items():
 if key in cm:cm[alias]=cm[key]
missing=collections.Counter()
def lookup(m,key,kind):
 if key not in m:missing[(kind,key)]+=1;return None
 return m[key]
def augment_rows(ids):
 rows=[[],[],[]];raw=[]
 for key in ids:
  a=lookup(am,key,'augment')
  if a and a.get('tier') in [1,2,3]:
   row=rows[a['tier']-1]
   if a['name'] not in row:row.append(a['name']);raw.append({'id':key,'name':a['name'],'tier':a['tier']-1})
 return rows,raw

def board(slots):
 layout={};equipment={};stars={};summons=[];unitids={};unresolved=[];capacity=0
 for slot,key,itemids,star in slots:
  ch=lookup(cm,key,'champion')
  if not ch:unresolved.append(key);continue
  if not isinstance(slot,int) or not 0<=slot<28 or str(slot) in layout:unresolved.append('slot:'+str(slot));continue
  name=ch['name'];layout[str(slot)]=name;unitids[str(slot)]=key;stars[str(slot)]=star
  if ch['cost'][0]==0:summons.append(name)
  else:capacity+=2 if ch['key']=='TheElderDragon' else 1
  mapped=[]
  for ik in itemids:
   item=lookup(im,ik,'item')
   if not item:unresolved.append(ik)
   else:mapped.append(item['name'])
  if mapped:equipment[name]=mapped
 return dict(layout=layout,units=list(layout.values()),equipment=equipment,stars=stars,summons=summons,unitIds=unitids,capacity=capacity,unresolved=unresolved)

def finish(d,b,ids,main=None):
 d.update(b);d['augments'],d['augmentEvidence']=augment_rows(ids)
 d['carries']=[[n,*v] for n,v in b['equipment'].items()]
 d['carries'].sort(key=lambda c:(c[0]!=main,-len(c)))
 d['carries']=d['carries'][:3]
 d['level']=b['capacity'];d['layoutVerified']=True;d['checkedAt']=now
 d['fieldSources']={k:{'source':d['source'],'url':d['url'],'patch':d.get('patch'),'checkedAt':now} for k in ['layout','items','augments','level']}
 return d
all_decks=[]
assert patch in str(ref('getGuideDecks')['guides']), '사이트 간 패치 불일치'
guides=[g for g in ref('getGuideDecks')['guideDecks'] if g['season']=='set18' and '요약' not in g['name']][:30]
assert len(guides)==30, 'LoLCHESS 공략 30개 미달'
for rank,g in enumerate(guides,1):
 b=board([(int(s['index']),s['champion'],s.get('items',[]),s.get('star',1)) for s in g['data']['slots']])
 d=finish(dict(source='lolchess',title=g['name'],sourceTitle=g['name'],tier=None,patch=patch,rank=rank,url='https://lolchess.gg/builder/guide/'+g['teamBuilderKey']+'?type=guide'),b,g['data'].get('augments',[]))
 all_decks.append(d)
ags=read('academy-data.json')[2]['data']['guides']
for rank,g in enumerate([g for g in ags if g['tier'] in ['S','A','B','C']],1):
 b=board([(s.get('boardIndex'),s['apiName'],s.get('items',[]),s.get('stars',1)) for s in g['finalComp']])
 main=cm.get(g.get('mainChampion',{}).get('apiName'),{}).get('name')
 d=finish(dict(source='academy',title=g['title'],sourceTitle=g['title'],tier=g['tier'],patch=patch,rank=rank,url='https://tftacademy.com/tierlist/comps/'+g['compSlug'],style=g['style'],sourceUpdatedAt=g['updated'],mainCarry=main,sourceTips=g['tips'],sourceAugmentTip=g.get('augmentsTip',''),sourcePublic=g.get('isPublic')),b,[a['apiName'] for a in g['augments'] if not a.get('disabled')],main)
 d['levelUpOptions']=[{'unit':cm[x['apiName']]['name'],'level':int(p[-1]),'source':'academy'} for x in g.get('maxCap',[]) if x['apiName'] in cm for p in x.get('predecessors',[]) if re.fullmatch('TFT_Flex_Lv[789]',p)]
 all_decks.append(d)
for rank,c in enumerate([c for c in read('opgg-data.json')['comps'] if c['tierLabel'] in ['S','A','B']],1):
 raw=read('opgg-'+str(c['id'])+'.json');g=raw['comp'];units=[s.get('champion',{}).get('name') for s in g['board']];units=[s for s in units if s]
 all_decks.append(dict(source='opgg',title=g['title'],sourceTitle=g['title'],units=units,tier=g['tier'],patch=raw['patch'],rank=rank,url='https://op.gg/ko/tft/tier-list',checkedAt=now,sourceUpdatedAt=g['updated_at'],comparisonOnly=True,sourceId=g['id']))
for rank,g in enumerate(read('qq-lineups.json')['lineup_list'],1):
 dt=json.loads(g['detail'],strict=False);ids=[s['hero_id'] for s in dt.get('hero_location_l9',[])];units=[cm[k]['name'] for k in ids if k in cm]
 all_decks.append(dict(source='qq',title=dt['line_name'],sourceTitle=dt['line_name'],units=units,tier=g['quality'],patch=g['simulator_edition'],rank=rank,url='https://lol.qq.com/tft/#/index',checkedAt=now,sourceUpdatedAt=g['rel_time'],comparisonOnly=True,sourceId=g['id']))
meta=read('tft-meta.txt');stats=read('meta-stats.json');statmap={s['cluster']:s for s in stats['results']};clusters=meta['results']['data']['cluster_details']
for rank,(key,g) in enumerate(clusters.items(),1):
 ids=[s.strip() for s in g['units_string'].split(',')];units=[cm[k]['name'] for k in ids if k in cm];s=statmap.get(key,{});places=s.get('places',[])[:8];count=sum(places);avg=sum((i+1)*v for i,v in enumerate(places))/count if count else None
 all_decks.append(dict(source='metatft',title=g['name_string'],sourceTitle=g['name_string'],units=units,tier=None,patch=patch,rank=rank,url='https://www.metatft.com/comps',checkedAt=now,sourceUpdatedAt=datetime.datetime.fromtimestamp(meta['updated']/1000,datetime.timezone.utc).isoformat(),comparisonOnly=True,sourceId=key,statistics={'count':count,'averagePlacement':avg},tierUnavailable=True))
# Retain source boards intact; do not combine item sets or move units between sources.
translations={"Lunarwood Kha'zix":'달빛 다이애나 카직스','Azir Rammus':'람머스 아지르','Ahri Morgana':'기원자 모르가나 아리','Aphelios Nidalee':'니달리 아펠리오스','Draven AD 9':'고밸류 드레이븐','Riftbeast Reroll':'협곡야수 리롤','Eclipse Kayle':'일식 케일','Invoker Morgana':'기원자 모르가나','Malphite AP Flex':'말파이트 AP 조합','6 Juggernaut Flex':'6전쟁기계 AP 조합','Dragon 9':'장로 드래곤 고밸류','Yi Rengar':'마스터 이 렝가','Caitlyn Hunters':'사냥꾼 케이틀린','Ashe Juggernauts':'전쟁기계 애쉬','Solar Melee':'햇빛 근접 리롤','Warwick Reroll':'검은 가시 워윅','Aphelios Vanguards':'선봉대 아펠리오스','Aphelios Rapidfire':'5속사포 아펠리오스','Spirit Blossom':'개화 고밸류','6 Juggernaut AD':'6전쟁기계 AD 조합'}
excluded={'Elderwood Veigar','Defender Cassio'}
def matching(d,s):
 a=set(d['units'])-set(d.get('summons',[]));b=set(s['units']);overlap=len(a&b)/max(len(a),len(b),1)
 return overlap>=.70 and (d.get('mainCarry') in b or overlap>=.9)
candidates=[]
for original in all_decks:
 d=copy.deepcopy(original)
 if d['source']!='academy' or not d.get('sourcePublic') or d['title'] in excluded or d['title'] not in translations:continue
 if d['unresolved'] or d['level'] not in [7,8,9] or len(set(d['units']))!=len(d['units']) or not d['carries'] or not d['augmentEvidence']:continue
 d['sourceTitle']=d['title'];d['title']=translations[d['title']];comparisons=[]
 for source in ['lolchess','opgg','qq','metatft']:
  matches=[s for s in all_decks if s['source']==source and matching(d,s)]
  matches.sort(key=lambda s:(-len(set(d['units'])&set(s['units'])),s['rank']))
  if matches:
   s=matches[0];comparisons.append({k:s.get(k) for k in ['source','title','tier','patch','url','sourceUpdatedAt','rank','statistics'] }|{'match':'동일 구성' if set(s['units'])==set(d['units']) else '유사 구성','freshness':'현재 패치' if source in ['lolchess','metatft'] else '이전/별도 패치'})
 d['comparisons']=comparisons;d['sources']=['academy']+[s['source'] for s in comparisons];d['sourceCount']=len(d['sources']);d['referenceSource']='academy';d['referenceCheckedAt']=now;d['source']='curated';d['selectionVersion']=2;d['strictSourceData']=True
 d['score']={'S':100,'A':75,'B':50,'C':25}[d['tier']]+sum(5 if s['source']=='lolchess' else 2 if s['source']=='metatft' else 0 for s in comparisons)
 d['evidence']=f"Academy {d['tier']} · {patch} · {len(comparisons)}개 출처 비교"
 d['operationLevel']={'3-Cost Reroll':7,'4-Cost Fast 8':8,'Fast 9':9,'1-Cost Reroll':5,'2-Cost Reroll':6}.get(d.get('style'))
 d['conditions']=[n+' · '+i for n,its in d['equipment'].items() for i in its if '상징' in i]
 d['summary']=f"완성 배치: {d['level']}레벨 · 원문 배치 {len(d['units'])}칸\n아이템·배치·증강: TFT Academy 동일 공략 기준\n"+('소환물 '+', '.join(d['summons'])+'은 레벨 인원에서 제외' if d['summons'] else '장로 드래곤은 팀 슬롯 2개 사용' if '장로 드래곤' in d['units'] else '원문 유닛과 아이템 연결 유지')
 candidates.append(d)
candidates.sort(key=lambda d:(-d['score'],d['rank']))
selected=[]
for d in candidates:
 if any(set(d['units'])==set(o['units']) for o in selected):continue
 selected.append(d)
 if len(selected)==15:break
print('CANDIDATES',len(candidates),'SELECTED',len(selected))
for i,d in enumerate(selected,1):d['rank']=i;print(i,d['title'],d['tier'],d['level'],d['sources'],len(d['augmentEvidence']))
print('MISSING',missing)
sourceReports=[{'id':k,'collected':sum(d['source']==k for d in all_decks),'target':30 if k=='lolchess' else None,'status':'verified' if k in ['lolchess','academy'] else 'comparison','patch':patch if k in ['lolchess','academy','metatft'] else read('opgg-data.json')['patch'] if k=='opgg' else read('qq-lineups.json')['lineup_list'][0]['simulator_edition'],'note':'S/A/B 필드는 원자료에 없음 · 통계만 비교' if k=='metatft' else '이전/별도 패치 · 티어 산정에서 제외' if k in ['opgg','qq'] else 'S/A/B/C 원문' if k=='academy' else '요약 제외 상위 30개'} for k in ['lolchess','opgg','qq','academy','metatft']]
usedNames=set(n for d in selected for n in d['units']);usedItems=set(n for d in selected for v in d['equipment'].values() for n in v);usedAugs=set(n for d in selected for row in d['augments'] for n in row);usedAugIds=set(a['id'] for d in selected for a in d['augmentEvidence'])
catalogs={'champions':[{'name':c['name'],'url':c['imageUrl'],'cost':c['cost'][0]} for c in champs if c['name'] in usedNames and not c['key'].startswith('Set17')],'items':[{'name':c['name'],'url':c['imageUrl']} for c in items if c['name'] in usedItems],'augments':[{'name':c['name'],'url':c['imageUrl'],'tier':c['tier']-1} for c in { (am[k]['name'],am[k]['tier']):am[k] for k in usedAugIds }.values()]}
result={'schema':4,'patch':patch,'publishedAt':now,'checkedAt':now,'sources':{r['id']:{'status':r['status'],'matched':r['collected'],'lastVerifiedAt':now,'patch':r['patch'],'note':r['note']} for r in sourceReports},'decks':all_decks,'recommendations':selected,'catalogs':catalogs,'refreshReport':{'checkedAt':now,'status':'verified-with-source-differences','published':len(selected)==15,'recommendationCount':len(selected),'sourceReports':sourceReports,'selectionVersion':2},'methodology':'배치·아이템·증강은 동일한 최신 Academy 공략을 그대로 사용. 다른 출처는 동일/유사 구성으로 구분하여 비교하며 예전 패치 티어는 최신 티어에 합산하지 않음. 표시 티어는 Academy 원문 티어. MetaTFT는 공개 데이터에 S/A/B가 없어 통계만 비교.'}
assert len(selected)==15, '검증 완료된 서로 다른 추천 15개 미달: 이전 데이터 유지'
if (P/'fetch-audit.json').exists():result['fetchAudit']=read('fetch-audit.json')
pathlib.Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
