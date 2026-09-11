import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {normalizeObservation,normalizeSkt,buildLive,createSources,auth,normalizeWeather,TTL} from '../lib/source-data.mjs';
const now=Date.now(),iso=new Date(now).toISOString();
const record={zoneId:'race-start',observedAt:iso,attested:true,level:'busy'};
for(const [title,p]of [
 ['no attestation',{...record,attested:false}],['bad zone',{...record,zoneId:'fake'}],
 ['stale',{...record,observedAt:new Date(now-TTL-1000).toISOString()}],
 ['future',{...record,observedAt:new Date(now+120000).toISOString()}],
 ['no timezone',{...record,observedAt:'2026-09-11T12:00:00'}],
 ['negative count',{...record,count:-1}],['string count',{...record,count:'30'}],
 ['fraction count',{...record,count:1.5}],['null input',null],
 ['car/people confusion',{...record,occupiedCars:30}],
 ['empty observation',{...record,level:null}]
])test('rejects '+title,()=>assert.throws(()=>normalizeObservation(p,now)));
test('level-only observations do not invent counts',()=>{const r=normalizeObservation(record,now);assert.equal(r.count,null);const l=buildLive({reports:[r],now});assert.equal(l.people.total,null);assert.equal(l.people.locals,null);assert.equal(l.zones.find(z=>z.id==='race-start').status,'busy');assert.equal(l.zones.find(z=>z.id==='race-1').status,'unknown');});
test('cars remain a separate unit',()=>{const r=normalizeObservation({...record,zoneId:'parking',occupiedCars:18},now);const l=buildLive({reports:[r],now});assert.equal(l.zones.find(z=>z.id==='parking').count,null);assert.equal(l.zones.find(z=>z.id==='parking').occupiedCars,18);});
test('expired field data are not retained as current',()=>{const r=normalizeObservation(record,now);assert.equal(buildLive({reports:[r],now:now+TTL+1}).mode,'unobserved');});
test('default has no imaginary occupancy or demographics',()=>{const l=buildLive({now});assert.deepEqual(l.people,{total:null,locals:null,tourists:null});assert.ok(l.zones.every(z=>z.count===null&&z.status==='unknown'));});
test('simulation requires explicit option',()=>{const l=buildLive({now,demo:true});assert.equal(l.source,'SIMULATION');assert.equal(l.people.total,l.zones.reduce((s,z)=>s+z.count,0));});
const skt={scopeId:'test-boundary',scopeType:'park-boundary',metric:'instantaneous-population',source:'JTO_SKT_REALTIME',observedAt:iso,people:{total:100,locals:null,tourists:null}};
test('SKT accepts missing demographics without filling them',()=>{assert.deepEqual(normalizeSkt(skt,'test-boundary',now).people,skt.people);});
test('surrounding population cannot be relabelled as the park',()=>assert.throws(()=>normalizeSkt({...skt,scopeType:'neighbourhood'},'test-boundary',now)));
test('density is not a headcount',()=>assert.throws(()=>normalizeSkt({...skt,metric:'density'},'test-boundary',now)));
test('old SKT data expire by observation time',()=>assert.equal(buildLive({anchor:normalizeSkt(skt,'test-boundary',now),now:now+TTL+1}).people.total,null));
test('totals cannot create zone populations',()=>{const l=buildLive({anchor:normalizeSkt(skt,'test-boundary',now),now});assert.equal(l.people.total,100);assert.ok(l.zones.every(z=>z.count===null));});
test('inconsistent demographic counts rejected',()=>assert.throws(()=>normalizeSkt({...skt,people:{total:100,locals:80,tourists:90}},'test-boundary',now)));
test('tokens fail closed',()=>{assert.equal(auth('Bearer x',''),false);assert.equal(auth('Bearer incorrect','long-test-token-1234'),false);assert.equal(auth('Bearer long-test-token-1234','long-test-token-1234'),true);});
test('newer observation required',()=>{const s=createSources({weatherEnabled:false,clock:()=>now});s.put(record);assert.throws(()=>s.put(record));s.stop();});
const weather={geometry:{coordinates:[126.3643,33.3901,443]},properties:{meta:{updated_at:iso,units:{air_temperature:'celsius',wind_speed:'m/s',precipitation_amount:'mm'}},timeseries:[{time:iso,data:{instant:{details:{air_temperature:20,wind_speed:4}},next_1_hours:{details:{precipitation_amount:0},summary:{symbol_code:'fair_day'}}}}]}};
test('weather retains source model time and forecast nature',()=>{const w=normalizeWeather(weather,now);assert.equal(w.generatedAt,iso);assert.equal(w.kind,'weather-forecast-not-observation');});
test('weather location mismatch rejected',()=>assert.throws(()=>normalizeWeather({...weather,geometry:{coordinates:[127,37]}},now)));
test('weather errors do not manufacture usable weather',async()=>{const s=createSources({clock:()=>now,fetchImpl:async()=>{throw Error('test network failure');}});await s.pollWeather();assert.equal(s.weather().available,false);assert.equal(s.weather().data,null);s.stop();});
test('HTTP server: authentication, map update, SSE, secrets isolation',async()=>{
 const port=18000+Math.floor(Math.random()*10000),base='http://127.0.0.1:'+port,key=randomBytes(24).toString('hex');
 const p=spawn(process.execPath,['server-v22.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),WEATHER_ENABLED:'false',DATA_MODE:'estimated',INGEST_TOKEN:key},stdio:'ignore'});
 try{
  let healthy=false;for(let i=0;i<30;i++){try{const r=await fetch(base+'/health');if(r.ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,80));}assert.ok(healthy);
  for(const path of ['/.env','/server.mjs','/lib/source-data.mjs','/docs/JTO_CONNECTION_STATUS.md'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/%E0%A4%A')).status,400);
  const post=async(payload,secret)=>fetch(base+'/api/v1/observations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify(payload)});
  assert.equal((await post({...record,observedAt:new Date().toISOString()},'bad')).status,401);
  const response=await post({...record,observedAt:new Date().toISOString()},key);assert.equal(response.status,200);
  const l=await(await fetch(base+'/api/v1/parks/981/live')).json();assert.equal(l.mode,'field-observation');assert.equal(l.people.total,null);assert.equal(l.zones.find(z=>z.id==='race-start').status,'busy');
  const s=await fetch(base+'/api/v1/parks/981/stream',{signal:AbortSignal.timeout(2000)});const reader=s.body.getReader();const event=new TextDecoder().decode((await reader.read()).value);assert.match(event,/FIELD_OBSERVATION/);await reader.cancel();
  assert.match(await(await fetch(base+'/')).text(),/live-signals-2.2.0/);
  assert.equal((await fetch(base+'/observe')).status,200);
  assert.equal((await(await fetch(base+'/api/v1/parks/981/accuracy')).json()).accuracy,null);
 }finally{p.kill('SIGTERM');}
});
