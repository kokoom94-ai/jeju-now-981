// Local diagnostics only. No credentials, generated buildings or accuracy shortcuts.
export const VERSION='3.1.0-connection-gate';
export const PLANNED_URL='https://kokoom94-ai.github.io/jeju-now-981/';
export const SETTINGS_URL='https://github.com/kokoom94-ai/jeju-now-981/settings/pages';
export const SITE_BRANCH='jeju-precision-site';
export const TARGETS=Object.freeze([
 {id:'ildo',name:'일도동',lon:126.527,lat:33.512,height:500},
 {id:'ido',name:'이도동',lon:126.532,lat:33.500,height:700},
 {id:'geonip',name:'건입동',lon:126.537,lat:33.515,height:600},
 {id:'samdo',name:'삼도동',lon:126.52155,lat:33.51325,height:450},
 {id:'yongdam',name:'용담동',lon:126.512,lat:33.516,height:600},
 {id:'airport',name:'제주공항 일대',lon:126.491,lat:33.500,height:1500}
]);
export function hostPolicy(value){
 try{
  const u=new URL(value);
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&['http:','https:'].includes(u.protocol);
  const owned=['https://kokoom94-ai.github.io','https://jeju-before-walk.netlify.app'].includes(u.origin);
  return {canConnect:local||owned,origin:u.origin,mode:local?'local-test':owned?'dedicated-host':'read-only-preview'};
 }catch{return {canConnect:false,origin:'unavailable',mode:'read-only-preview'};}
}
export function createObservations(){return Object.fromEntries(TARGETS.map(t=>[t.id,{id:t.id,name:t.name,status:'not-inspected',object:null,observedAt:null}]));}
export function cleanProperties(value){
 if(!Array.isArray(value))return [];
 return value.filter(p=>Array.isArray(p)&&p.length===2&&!/token|secret|password|key|cookie|authorization/i.test(String(p[0])))
 .filter(p=>['string','number','boolean'].includes(typeof p[1]))
 .slice(0,40).map(p=>[String(p[0]).slice(0,80),String(p[1]).slice(0,240)]);
}
export function cleanObject(value){
 if(!value||value.providerType!=='Cesium3DTileFeature')return null;
 const lon=Number.isFinite(value.lon)?value.lon:null,lat=Number.isFinite(value.lat)?value.lat:null;
 if(lon!==null&&(lon<126.462||lon>126.575))return null;
 if(lat!==null&&(lat<33.468||lat>33.536))return null;
 return {providerType:'Cesium3DTileFeature',lon,lat,properties:cleanProperties(value.properties),heightVerified:false,shapeVerified:false};
}
export function addObservation(log,id,object,at=new Date().toISOString()){
 const t=TARGETS.find(t=>t.id===id),o=cleanObject(object);
 if(!t||!o||!Number.isFinite(Date.parse(at)))throw Error('유효한 원본 객체 선택이 먼저 필요합니다.');
 if(o.lon===null||o.lat===null)throw Error('원본 객체의 선택 위치를 확인하지 못했습니다. 좌표 확인 후 기록하세요.');
 const dx=(o.lon-t.lon)*92800,dy=(o.lat-t.lat)*111320;
 if(Math.hypot(dx,dy)>1700)throw Error('선택한 객체가 현재 확인 지점에서 너무 멉니다. 해당 지점으로 이동해 다시 선택하세요.');
 return {...log,[id]:{id,name:t.name,status:'sample-observed-not-validated',object:o,observedAt:new Date(at).toISOString()}};
}
export function diagnostics(state,log,origin,placeCount){
 const observations=TARGETS.map(t=>log[t.id]).filter(Boolean).map(r=>({id:r.id,name:r.name,status:r.status,observedAt:r.observedAt,object:r.object?cleanObject(r.object):null}));
 return {version:VERSION,checkedAt:new Date().toISOString(),origin:hostPolicy(origin).origin,
 provider:'VWorld WebGL 3.0',connectionState:String(state.state||'not-configured').slice(0,60),sdkReady:state.sdkReady===true,
 objectSelections:Number.isSafeInteger(state.modelSelections)?state.modelSelections:0,
 observations,places:Math.max(0,Number(placeCount)||0),
 scopeDefinition:'Six named area review targets. Camera points are not administrative boundaries or verified entrances.',
 regionBoundaryCoverageVerified:false,heightAccuracyVerified:false,roofShapeVerified:false,terrainAlignmentVerified:false,
 sourceDate:null,walkingCollisionVerified:false,productionReady:false,generatedBuildingFallback:false,
 note:'Runtime object observation only; not a survey, completeness certificate, or live data connection claim. No key is included.'};
}
