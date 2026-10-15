"""Refresh bundled JPL Horizons vectors. Calls are deliberately sequential."""
import json, math, pathlib, struct, subprocess, urllib.parse, datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
BODIES=[('mercury','199',1),('venus','299',2),('earth','399',2),('mars','499',4),('jupiter','5',8),('saturn','6',16),('uranus','7',32),('neptune','8',32),('pluto','9',32)]
BASE=dict(format='json',EPHEM_TYPE='VECTORS',CENTER='500@10',REF_PLANE='ECLIPTIC',REF_SYSTEM='ICRF',OUT_UNITS='AU-D',VEC_TABLE='2',VEC_CORR='NONE',CSV_FORMAT='YES',TIME_TYPE='UT',CAL_TYPE='GREGORIAN',TIME_DIGITS='FRACSEC')
def request(params):
 q={**BASE,**params};url='https://ssd.jpl.nasa.gov/api/horizons.api?'+urllib.parse.urlencode({k:v if k=='format' else "'"+str(v)+"'" for k,v in q.items()})
 raw=subprocess.check_output(['curl','--fail','--silent','--show-error','--retry','2','--max-time','180',url])
 obj=json.loads(raw);text=obj.get('result','')
 if '$$SOE' not in text: raise RuntimeError(obj)
 lines=text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines();rows=[]
 for line in lines:
  c=line.split(',');rows.append([float(c[0]),*[float(x) for x in c[2:8]]])
 assert all(len(r)==7 and all(math.isfinite(v) for v in r) for r in rows)
 return rows,text,url,obj.get('signature')
meta={}
for name,target,step in BODIES:
 output=ROOT/'public/ephemeris'/f'{name}.bin';mp=ROOT/'data'/f'{name}-meta.json'
 if output.exists() and mp.exists():meta[name]=json.loads(mp.read_text());continue
 rows,text,url,signature=request(dict(COMMAND=target,START_TIME='1900-01-01',STOP_TIME='2101-02-01',STEP_SIZE=f'{step} d'))
 assert len(rows)>2000 and all(abs(rows[i][0]-rows[0][0]-i*step)<1e-8 for i in range(len(rows)))
 output.write_bytes(b''.join(struct.pack('<6d',*r[1:]) for r in rows))
 m=dict(id=name,target=target,startJD=rows[0][0],stopJD=rows[-1][0],stepDays=step,count=len(rows),file=f'/ephemeris/{name}.bin',frame='J2000 ecliptic',origin='Sun center',timeScale='UT',units='AU, AU/day',retrieved=datetime.datetime.now(datetime.timezone.utc).isoformat(),signature=signature,requestURL=url,header=text.split('$$SOE')[0],footer=text.split('$$EOE')[1])
 mp.write_text(json.dumps(m,indent=2));meta[name]=m
 print(name,len(rows),output.stat().st_size,flush=True)
moon=ROOT/'data/moon-meta.json'
if moon.exists():
 meta['moon']={**json.loads(moon.read_text()),'id':'moon','file':'/ephemeris/moon.bin'}
(ROOT/'public/ephemeris/manifest.json').write_text(json.dumps(meta,indent=2))
