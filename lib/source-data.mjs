import { timingSafeEqual, createHash } from 'node:crypto';

export const VERSION = 'live-signals-2.2.0';
export const TTL = 15 * 60_000;
export const ZONES = [
 ['indoor-lobby','실내 로비',72,140,'indoor'],['sports-lab','SPORTS LAB',64,120,'indoor'],
 ['ringggo','RINGGGO',36,80,'indoor'],['space-cup','SPACE CUP',44,90,'indoor'],
 ['ticket','티켓존',28,80,'indoor'],['race-start','레이스 출발',66,120,'outdoor'],
 ['race-1','코스 1',55,100,'outdoor'],['race-2','코스 2',52,100,'outdoor'],
 ['race-3','코스 3',47,100,'outdoor'],['return','자동회차',31,90,'outdoor'],
 ['outdoor','야외광장',45,140,'outdoor'],['parking','주차장',84,180,'outdoor'],
 ['viewing','관람 공간',40,100,'outdoor']
].map(([id,name,base,capacity,area])=>({id,name,base,capacity,area}));
export const LEVELS = { good:'쾌적', normal:'보통', busy:'혼잡', 'very-busy':'매우 혼잡', unknown:'미관측' };
export const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=33.3901&lon=126.3643';
export function auth(value, token) {
 if (!token || token.length < 16 || typeof value !== 'string') return false;
 const hash = x => createHash('sha256').update(x).digest();
 return timingSafeEqual(hash(value),hash(`Bearer ${token}`));
}
export function integer(value, name, maximum=200000) {
 if (value == null) return null;
 if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw Error(`${name}: non-negative integer required`);
 return value;
}
export function observationTime(value, now=Date.now(), ttl=TTL) {
 if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw Error('observedAt: ISO timestamp with timezone required');
 const t=Date.parse(value);
 if (!Number.isFinite(t) || t > now + 60_000 || now-t > ttl) throw Error('observation is stale or future-dated');
 return new Date(t).toISOString();
}
export function normalizeObservation(p, now=Date.now()) {
 if (!p || p.attested !== true) throw Error('attested: confirm a real on-site observation');
 if (!['park',...ZONES.map(z=>z.id)].includes(p.zoneId)) throw Error('unknown zoneId');
 const observedAt=observationTime(p.observedAt,now);
 const level=p.level ?? null;
 if (level !== null && !['good','normal','busy','very-busy'].includes(level)) throw Error('invalid level');
 const count=integer(p.count,'count'), waitMinutes=integer(p.waitMinutes,'waitMinutes',240);
 const occupiedCars=integer(p.occupiedCars,'occupiedCars',5000);
 if (occupiedCars !== null && p.zoneId !== 'parking') throw Error('cars are only valid for parking');
 if (count === null && level === null && waitMinutes === null && occupiedCars === null) throw Error('at least one observation is required');
 return {zoneId:p.zoneId, observedAt, receivedAt:new Date(now).toISOString(), expiresAt:new Date(Date.parse(observedAt)+TTL).toISOString(),
  source:'FIELD_OBSERVATION', basis:'operator-reported; not independently verified', count,level,waitMinutes,occupiedCars};
}
export function normalizeSkt(p, scope, now=Date.now()) {
 if (!scope || p?.scopeId !== scope || p.scopeType !== 'park-boundary' || p.metric !== 'instantaneous-population') throw Error('approved park-boundary scope and instantaneous-population metric required');
 if (!['JTO_SKT_REALTIME','SKT_REALTIME'].includes(p.source)) throw Error('source must identify an actual SKT feed');
 const total=integer(p.people?.total,'people.total');
 if (total===null) throw Error('people.total required');
 const locals=integer(p.people?.locals,'people.locals'), tourists=integer(p.people?.tourists,'people.tourists');
 if ((locals!==null && locals>total)||(tourists!==null && tourists>total)|| (locals!==null && tourists!==null && locals+tourists!==total)) throw Error('demographic counts do not match total');
 return {source:p.source,scopeId:scope,scopeType:p.scopeType,metric:p.metric,observedAt:observationTime(p.observedAt,now),people:{total,locals,tourists}};
}
export function normalizeWeather(payload, now=Date.now()) {
 const p=payload?.properties, generatedAt=p?.meta?.updated_at, t=Date.parse(generatedAt);
 if (!Number.isFinite(t)||now-t>18*3600000||t>now+60000) throw Error('weather model issue time invalid or stale');
 if (p.meta.units?.air_temperature!=='celsius'||p.meta.units?.wind_speed!=='m/s'||p.meta.units?.precipitation_amount!=='mm') throw Error('weather units changed');
 const c=payload.geometry?.coordinates;
 if (!Array.isArray(c)||Math.abs(c[0]-126.3643)>.03||Math.abs(c[1]-33.3901)>.03) throw Error('weather location mismatch');
 const points=(p.timeseries||[]).filter(x=>Date.parse(x.time)>=now-3600000&&Date.parse(x.time)<=now+7*3600000).map(x=>{
  const d=x.data?.instant?.details, h=x.data?.next_1_hours;
  const rain=h?.details?.precipitation_amount;
  if (!Number.isFinite(d?.air_temperature)||!Number.isFinite(d?.wind_speed)) throw Error('weather fields missing');
  return {validAt:x.time,temperatureC:d.air_temperature,windMs:d.wind_speed,rainMmNextHour:Number.isFinite(rain)?rain:null,symbol:h?.summary?.symbol_code||null};
 });
 if (!points.length || Math.abs(Date.parse(points[0].validAt)-now)>3600000) throw Error('no current forecast interval');
 return {source:'MET Norway',kind:'weather-forecast-not-observation',generatedAt,location:{lat:33.3901,lon:126.3643},points,
  attribution:'Based on data from MET Norway; selected fields and Korean labels',license:'CC BY 4.0',sourceUrl:MET_URL,licenseUrl:'https://creativecommons.org/licenses/by/4.0/'};
}
export async function readLimited(response, maximum=2_000_000) {
 let size=0;const parts=[];
 for await(const chunk of response.body) {size+=chunk.length;if(size>maximum)throw Error('response too large');parts.push(Buffer.from(chunk));}
 return Buffer.concat(parts).toString('utf8');
}
export function createSources({fetchImpl=fetch,clock=Date.now,weatherEnabled=true}={}) {
 const reports=new Map(); let weather=null, timer=null, inFlight=false, lastModified=null, failures=0;
 const status={state:weatherEnabled?'connecting':'disabled',lastAttemptAt:null,lastSuccessAt:null,lastError:null,nextAttemptAt:null};
 function freshReports() {
  const now=clock(); for(const [id,r] of reports) if(Date.parse(r.expiresAt)<=now)reports.delete(id);
  return [...reports.values()].sort((a,b)=>a.zoneId.localeCompare(b.zoneId));
 }
 function put(p) {const r=normalizeObservation(p,clock()),previous=reports.get(r.zoneId);
  if(previous && Date.parse(previous.observedAt)>=Date.parse(r.observedAt))throw Error('new observation must be newer than the existing observation');
  reports.set(r.zoneId,r);return r;
 }
 function weatherSnapshot() {
  const expired=!weather||clock()-Date.parse(weather.generatedAt)>18*3600000;
  const recent=weather?.points.filter(x=>Date.parse(x.validAt)>=clock()-3600000)||[];
  const usable=!expired&&recent.length>0&&Math.abs(Date.parse(recent[0].validAt)-clock())<=3600000;
  return {...status,available:usable,data:usable?{...weather,points:recent}:null};
 }
 async function pollWeather() {
  if(!weatherEnabled||inFlight)return;
  inFlight=true;status.lastAttemptAt=new Date(clock()).toISOString();let next=3600000;
  try {
   const headers={'User-Agent':'JejuNow981/2.2 (+https://github.com/kokoom94-ai/jeju-now-981)','Accept':'application/json'};
   if(lastModified)headers['If-Modified-Since']=lastModified;
   const r=await fetchImpl(MET_URL,{headers,signal:AbortSignal.timeout(12000)});
   const expires=Date.parse(r.headers.get('expires'));if(Number.isFinite(expires))next=Math.max(next,expires-clock());
   if(r.status===429||r.status===503){const a=r.headers.get('retry-after');const retry=/^\d+$/.test(a||'')?Number(a)*1000:Date.parse(a)-clock();if(Number.isFinite(retry))next=Math.max(next,retry);}
   if(r.status===304){if(!weather)throw Error('weather cache unavailable');}
   else {
    if(!r.ok)throw Error(`weather HTTP ${r.status}`);
    weather=normalizeWeather(JSON.parse(await readLimited(r)),clock());
    lastModified=r.headers.get('last-modified');
   }
   failures=0;status.state='connected';status.lastSuccessAt=new Date(clock()).toISOString();status.lastError=null;
  } catch(e) {failures++;status.state='unavailable';status.lastError=e.cause?.code||e.code||(e.name==='TimeoutError'?'TIMEOUT':String(e.message).slice(0,120));next=Math.max(next,Math.min(6*3600000,3600000*2**Math.min(failures-1,3)));}
  finally {inFlight=false;next+=Math.floor(Math.random()*120000);status.nextAttemptAt=new Date(clock()+next).toISOString();timer=setTimeout(pollWeather,next);timer.unref();}
 }
 return {put,reports:freshReports,weather:weatherSnapshot,pollWeather,start(){void pollWeather();},stop(){clearTimeout(timer);},
  snapshot(){return {version:VERSION,checkedAt:new Date(clock()).toISOString(),weather:weatherSnapshot(),observations:freshReports(),storage:'ephemeral; observations expire after 15 minutes or server restart'};}};
}
export function buildLive({anchor=null,reports=[],now=Date.now(),demo=false}={}) {
 const fresh=reports.filter(r=>Date.parse(r.expiresAt)>now), whole=fresh.find(r=>r.zoneId==='park');
 const validAnchor=anchor&&now-Date.parse(anchor.observedAt)<=TTL ? anchor : null;
 const people=demo?{total:624,locals:144,tourists:480}:{...(validAnchor?.people||{total:null,locals:null,tourists:null})};
 // A newer manually reported total is an independent source; never reuse its demographics from another observation.
 const useWhole=whole?.count!=null&&(!validAnchor||Date.parse(whole.observedAt)>Date.parse(validAnchor.observedAt));
 if(!demo&&useWhole){people.total=whole.count;people.locals=null;people.tourists=null;}
 let zoneRows=ZONES.map(z=>({...z,count:null,ratio:null,status:'unknown',label:LEVELS.unknown,waitMinutes:null,basis:'unobserved',observedAt:null}));
 if(demo){const base=ZONES.reduce((s,z)=>s+z.base,0);let remainder=624;
  zoneRows=zoneRows.map((z,i)=>{const n=i===ZONES.length-1?remainder:Math.round(z.base/base*624);remainder-=n;return {...z,count:n,ratio:n/z.capacity,status:'normal',label:'시연',basis:'simulation'};});
 } else zoneRows=zoneRows.map(z=>{const r=fresh.find(r=>r.zoneId===z.id);return r?{...z,count:r.count,status:r.level||'unknown',label:r.level?LEVELS[r.level]:'등급 미입력',waitMinutes:r.waitMinutes,basis:'operator-reported',observedAt:r.observedAt,expiresAt:r.expiresAt,occupiedCars:r.occupiedCars}:z;});
 const hasField=!demo&&fresh.length>0;
 const mode=demo?'estimated':validAnchor&&!useWhole?'skt-realtime':hasField?'field-observation':'unobserved';
 return {version:VERSION,parkId:'981',observedAt:new Date(now).toISOString(),source:demo?'SIMULATION':mode==='skt-realtime'?validAnchor.source:hasField?'FIELD_OBSERVATION':'NO_LIVE_POPULATION',mode,people,
  totalBasis:demo?'simulation':useWhole?'operator-reported':validAnchor?'telecom-estimate':'unobserved',
  sourceObservedAt:useWhole?whole.observedAt:validAnchor?.observedAt||null,
  crowd:{label:!demo&&whole?.level?LEVELS[whole.level]:demo?'시연':'미관측',status:!demo&&whole?.level?whole.level:demo?'normal':'unknown'},zones:zoneRows,
  recommendation:{label:'추천 보류',reason:'혼잡 예측에 필요한 검증 데이터 부족'},
  accuracy:{validated:false,accuracy:null,target:90,floor:80},observations:demo?[]:fresh};
}
