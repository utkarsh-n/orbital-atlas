import json, math, pathlib, struct, subprocess, urllib.parse, datetime, sys
PROJECT=pathlib.Path(__file__).resolve().parents[1]
ROOT=PROJECT/'data/moon-cache'
ROOT.mkdir(parents=True,exist_ok=True)
BASE=dict(format='json',COMMAND='301',EPHEM_TYPE='VECTORS',CENTER='500@399',REF_PLANE='ECLIPTIC',REF_SYSTEM='ICRF',OUT_UNITS='AU-D',VEC_TABLE='2',VEC_CORR='NONE',CSV_FORMAT='YES',TIME_TYPE='UT',CAL_TYPE='GREGORIAN',TIME_DIGITS='FRACSEC')
def request(params):
 q={**BASE,**params};url='https://ssd.jpl.nasa.gov/api/horizons.api?'+urllib.parse.urlencode({k:v if k=='format' else "'"+str(v)+"'" for k,v in q.items()})
 raw=subprocess.check_output(['curl','--fail','--silent','--show-error','--retry','2','--max-time','240',url]);obj=json.loads(raw);text=obj.get('result','')
 if '$$SOE' not in text: raise RuntimeError(str(obj)[:1000])
 rows=[]
 for line in text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
  c=line.split(',');rows.append([float(c[0]),*[float(x) for x in c[2:8]]])
 assert all(len(r)==7 and all(math.isfinite(v) for v in r) for r in rows)
 return rows,text,url,obj.get('signature')
if __name__=='__main__':
 allrows=[];requests=[];firsttext=None
 boundaries=['1900-01-01','1925-01-01','1950-01-01','1975-01-01','2000-01-01','2025-01-01','2050-01-01','2075-01-01','2100-01-01','2101-02-01']
 for start,stop in zip(boundaries,boundaries[1:]):
  cache=ROOT/f'{start}-cache.json'
  if cache.exists():rows,text,url,signature=json.loads(cache.read_text())
  else:
   rows,text,url,signature=request(dict(START_TIME=start,STOP_TIME=stop,STEP_SIZE='6 h'))
   cache.write_text(json.dumps([rows,text.split('$$SOE')[0]+'$$SOE$$EOE'+text.split('$$EOE')[1],url,signature]))
  if not firsttext:firsttext=text
  if allrows and allrows[-1][0]==rows[0][0]:rows=rows[1:]
  allrows.extend(rows);requests.append(url);print(start,stop,len(rows),flush=True)
 assert all(abs(r[0]-allrows[0][0]-.25*i)<1e-8 for i,r in enumerate(allrows))
 (PROJECT/'public/ephemeris/moon.bin').write_bytes(b''.join(struct.pack('<6d',*r[1:]) for r in allrows))
 meta=dict(id='moon',target='301',startJD=allrows[0][0],stopJD=allrows[-1][0],stepDays=.25,count=len(allrows),file='/ephemeris/moon.bin',frame='J2000 ecliptic',origin='Earth center',center='500@399',timeScale='UT',units='AU, AU/day',retrieved=datetime.datetime.now(datetime.timezone.utc).isoformat(),signature=signature,requestURLs=requests,header=firsttext.split('$$SOE')[0],footer=firsttext.split('$$EOE')[1])
 (PROJECT/'data/moon-meta.json').write_text(json.dumps(meta,indent=2));print('COMPLETE',len(allrows),(PROJECT/'public/ephemeris/moon.bin').stat().st_size,flush=True)

if __name__=='__main__':
 manifest=PROJECT/'public/ephemeris/manifest.json'
 content=json.loads(manifest.read_text());content['moon']=meta
 manifest.write_text(json.dumps(content,indent=2))
