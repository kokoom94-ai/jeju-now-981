import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac,randomBytes} from 'node:crypto';
import {VERSION,ZONES,auth,normalizeSkt,createSources,buildLive,readLimited,TTL} from './lib/source-data.mjs';
const ROOT=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.PORT||8080);
const token=process.env.INGEST_TOKEN||'';
const scope=process.env.JTO_APPROVED_SCOPE_ID||'';
const upstream=process.env.JTO_SKT_API_URL||'';
const enabled=(process.env.DATA_MODE||'auto')!=='estimated';
const sources=createSources({weatherEnabled:process.env.WEATHER_ENABLED!=='false'});
const provider={configured:Boolean(upstream&&scope),state:enabled?'not-configured':'disabled',lastSuccessAt:null,lastError:null};
let anchor=null,sourceTimer=null,failures=0;
const streams=new Map(),rates=new Map(),salt=randomBytes(32),history=[];
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
function live(demo=false){return buildLive({anchor,reports:sources.reports(),demo});}
function sktStatus(){return {...provider,activeAnchor:Boolean(anchor&&Date.now()-Date.parse(anchor.observedAt)<=TTL),anchorObservedAt:anchor?.observedAt||null,
 required:!scope?['JTO_APPROVED_SCOPE_ID','approved timestamped SKT record']:!upstream?['push feed or JTO_SKT_API_URL']:[],accuracyValidated:false};}
async function poll(){
 if(!enabled||!provider.configured)return;
 provider.state='connecting';let delay=300000;
 try{
  const url=new URL(upstream);if(url.protocol!=='https:')throw Error('HTTPS required');
  const headers={Accept:'application/json','User-Agent':'JejuNow981/2.2'};
  if(process.env.JTO_SKT_API_TOKEN)headers[process.env.JTO_SKT_AUTH_HEADER||'Authorization']=(process.env.JTO_SKT_AUTH_SCHEME??'Bearer')+' '+process.env.JTO_SKT_API_TOKEN;
  const r=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('upstream HTTP '+r.status);
  const p=JSON.parse(await readLimited(r));anchor=normalizeSkt(p,scope);provider.state='connected';provider.lastSuccessAt=new Date().toISOString();provider.lastError=null;failures=0;
 }catch(e){provider.state='unavailable';provider.lastError=e.cause?.code||e.name;failures++;delay=Math.min(1800000,300000*2**Math.min(failures,3));}
 sourceTimer=setTimeout(poll,delay);sourceTimer.unref();
}
async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>16384)throw Error('request too large');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
function allowWrite(req,res){
 if(token.length<16){json(res,503,{ok:false,error:'INGEST_TOKEN must be configured (16+ characters)'});return false;}
 if(!auth(req.headers.authorization,token)){json(res,401,{ok:false,error:'invalid ingest token'});return false;}
 if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}catch{json(res,403,{ok:false,error:'origin not allowed'});return false;}}
 if(!String(req.headers['content-type']).startsWith('application/json')){json(res,415,{ok:false,error:'application/json required'});return false;}
 const key=createHmac('sha256',salt).update(req.socket.remoteAddress||'unknown').digest('hex');
 const now=Date.now();for(const[k,v]of rates)if(v.until<now)rates.delete(k);
 const v=rates.get(key)||{n:0,until:now+60000};v.n++;rates.set(key,v);
 if(v.n>30){json(res,429,{ok:false,error:'too many updates; retry next minute'});return false;}
 return true;
}
function broadcast(){for(const[res,demo]of streams){if(res.writableEnded||res.destroyed){streams.delete(res);continue;}const ok=res.write(`data: ${JSON.stringify(live(demo))}\n\n`);if(!ok){res.end();streams.delete(res);}}}
const allowed=new Set(['index-v22.html','observe.html','assets/village-v22.js','assets/village.css','assets/signals.js','assets/signals.css']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost'),path=u.pathname,demo=u.searchParams.get('demo')==='1';
  if(req.method==='POST'&&(path==='/api/v1/observations'||path==='/api/v1/ingest/skt')){
   if(!allowWrite(req,res))return;
   try{const p=await body(req);if(path.endsWith('/observations')){const report=sources.put(p);broadcast();return json(res,200,{ok:true,observation:report});}
    anchor=normalizeSkt(p,scope);provider.state='connected';provider.lastSuccessAt=new Date().toISOString();provider.lastError=null;broadcast();return json(res,200,{ok:true,observedAt:anchor.observedAt});
   }catch(e){return json(res,400,{ok:false,error:String(e.message).slice(0,180)});}
  }
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{ok:false,error:'method not allowed'});
  if(path==='/health'||path==='/healthz'){const x=live();return json(res,200,{ok:true,version:VERSION,mode:x.mode,source:x.source,provider:sktStatus(),weather:sources.weather().state});}
  if(path==='/api/v1/parks/981/live')return json(res,200,live(demo));
  if(path==='/api/v1/parks/981/skt/status')return json(res,200,sktStatus());
  if(path==='/api/v1/parks/981/signals')return json(res,200,{...sources.snapshot(),skt:sktStatus()});
  if(path==='/api/v1/parks/981/accuracy')return json(res,200,{validated:false,accuracy:null,floor:80,target:90,reason:'No independent ground truth validation'});
  if(path==='/api/v1/parks/981/history')return json(res,200,history);
  if(path==='/api/v1/parks/981/forecast')return json(res,200,{version:VERSION,points:[],reason:'No validated crowd forecast; weather is a separate forecast'});
  if(path==='/api/v1/observations')return json(res,200,{observations:sources.reports(),expiresAfterMinutes:15,authenticatedInputEnabled:token.length>=16,zones:[{id:'park',name:'파크 전체'},...ZONES.map(({id,name})=>({id,name}))]});
  if(path==='/api/v1/parks/981/stream'){
   if(streams.size>=200)return json(res,503,{ok:false,error:'stream capacity reached'});
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'});
   res.write(`retry: 5000\ndata: ${JSON.stringify(live(demo))}\n\n`);streams.set(res,demo);res.on('close',()=>streams.delete(res));return;
  }
  const name=path==='/'?'index-v22.html':path==='/observe'?'observe.html':decodeURIComponent(path.slice(1));
  if(!allowed.has(name))return json(res,404,{ok:false,error:'not found'});
  const b=await readFile(resolve(ROOT,name));res.writeHead(200,{'Content-Type':mime[extname(name)]||'application/octet-stream','Cache-Control':name.endsWith('.html')?'no-cache':'public, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'});res.end(req.method==='HEAD'?undefined:b);
 }catch{if(!res.headersSent)json(res,400,{ok:false,error:'invalid request'});else res.end();}
});
const tick=setInterval(()=>{broadcast();},5000);
const historyTick=setInterval(()=>{const x=live();history.push({observedAt:x.observedAt,people:x.people,mode:x.mode});if(history.length>60)history.shift();},60000);
server.requestTimeout=20000;server.headersTimeout=10000;
server.listen(port,'0.0.0.0',()=>{console.log(`JEJU NOW ${VERSION} on ${port}`);sources.start();void poll();});
function stop(){clearInterval(tick);clearInterval(historyTick);clearTimeout(sourceTimer);sources.stop();for(const r of streams.keys())r.end();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
