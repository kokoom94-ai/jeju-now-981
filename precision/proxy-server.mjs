// Zero-dependency Node 22 bootstrap proxy. No tiles/meshes are downloaded or cached.
// SDK code and downstream browser requests can still reveal the JavaScript key.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {validateKey, sdkURL} from './bridge.mjs';
import {PLANNED_URL} from './session.mjs';
const MAX_BYTES = 2 * 1024 * 1024;
const local = h => ['localhost','127.0.0.1','[::1]'].includes(h);
export function serviceURL(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || (u.protocol !== 'https:' && !(u.protocol === 'http:' && local(u.hostname)))) {
    throw Error('VWORLD_SERVICE_URL must be the registered HTTPS site URL (HTTP loopback is local-only).');
  }
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u;
}
export function createProxyServer({apiKey='', registeredUrl=PLANNED_URL, fetchImpl=globalThis.fetch, limit=30, maxInFlight=4, timeoutMs=12000, now=Date.now}={}) {
  const registered=serviceURL(registeredUrl);
  // A malformed nonempty credential is a configuration error, never logged verbatim.
  const key=apiKey ? validateKey(apiKey) : '';
  let bucketStart=now(), count=0, inFlight=0;
  const stats={requests:0, upstreamSuccesses:0, upstreamFailures:0};
  const config=()=>({provider:'VWorld WebGL 3.0',transport:'sdk-bootstrap-proxy',serviceUrl:registered.href,
    keyConfigured:!!key,sdkPath:'/api/vworld/sdk.js',browserKeyMayBeVisible:true,
    sdkLiveTested:false,jejuPrecisionModelsReceived:false,productionReady:false});
  const server=http.createServer(async(req,res)=>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Vary':'Origin'};
    let referer=null;
    try { if(req.headers.referer) referer=new URL(req.headers.referer); } catch {}
    const origin=req.headers.origin;
    const originOK=origin===registered.origin;
    const refererOK=referer?.origin===registered.origin;
    const allowed=(!origin || originOK) && (!req.headers.referer || refererOK) && (originOK || refererOK);
    if(originOK) headers['Access-Control-Allow-Origin']=registered.origin;
    const send=(status,data,type='application/json; charset=utf-8')=>{
      if(res.destroyed) return;
      res.writeHead(status,{...headers,'Content-Type':type});res.end(typeof data==='string'?data:JSON.stringify(data));
    };
    let u;
    try {u=new URL(req.url,'http://proxy.invalid');} catch {return send(400,{error:'BAD_REQUEST'});}
    if(u.search || req.url.startsWith('http')) return send(400,{error:'QUERY_OR_ABSOLUTE_TARGET_REJECTED'});
    if(req.method==='OPTIONS'){
      if(!originOK || !['/api/vworld/config','/api/vworld/sdk.js'].includes(u.pathname)) return send(403,{error:'ORIGIN_DENIED'});
      headers['Access-Control-Allow-Methods']='GET';
      return send(204,'');
    }
    if(req.method!=='GET') {headers.Allow='GET, OPTIONS';return send(405,{error:'METHOD_NOT_ALLOWED'});}
    if(u.pathname==='/healthz') return send(200,{ok:true,service:'jeju-precision-proxy',keyConfigured:!!key,productionReady:false});
    if(!['/api/vworld/config','/api/vworld/sdk.js'].includes(u.pathname)) return send(404,{error:'NOT_FOUND'});
    // No Origin/Referer is not a trusted browser request. CORS is not authentication;
    // keep the provider domain restrictions, global quota and fixed upstream as well.
    if(!allowed) return send(403,{error:'ORIGIN_DENIED'});
    if(u.pathname==='/api/vworld/config') return send(200,config());
    if(!key) return send(503,{error:'VWORLD_KEY_NOT_CONFIGURED'});
    if(now()-bucketStart>=60000){bucketStart=now();count=0;}
    if(count>=limit || inFlight>=maxInFlight){headers['Retry-After']='60';return send(429,{error:'BOOTSTRAP_RATE_LIMIT'});}
    count++;inFlight++;stats.requests++;
    const aborter=new AbortController();
    const timer=setTimeout(()=>aborter.abort(),timeoutMs);
    const onClose=()=>{if(!res.writableEnded)aborter.abort();};res.once('close',onClose);
    try {
      const upstreamHeaders={'Accept':'application/javascript, text/javascript'};
      // Forward only real, validated request origin/referrer; never substitute an unrelated registered domain.
      if(originOK)upstreamHeaders.Origin=origin;
      if(refererOK)upstreamHeaders.Referer=referer.href;
      const upstream=await fetchImpl(sdkURL(key),{method:'GET',headers:upstreamHeaders,redirect:'error',signal:aborter.signal});
      if(!upstream.ok) throw Error('UPSTREAM_HTTP');
      const type=upstream.headers.get('content-type')||'';
      if(!/^(application|text)\/(javascript|x-javascript|ecmascript)(?:\s*;|$)/i.test(type)) throw Error('UPSTREAM_TYPE');
      if(Number(upstream.headers.get('content-length'))>MAX_BYTES) throw Error('UPSTREAM_SIZE');
      if(!upstream.body) throw Error('UPSTREAM_EMPTY');
      const reader=upstream.body.getReader(),chunks=[];let length=0;
      while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>MAX_BYTES){await reader.cancel();throw Error('UPSTREAM_SIZE');}chunks.push(Buffer.from(part.value));}
      if(length===0) throw Error('UPSTREAM_EMPTY');
      stats.upstreamSuccesses++;
      send(200,Buffer.concat(chunks).toString('utf8'),'application/javascript; charset=utf-8');
    } catch {
      stats.upstreamFailures++;
      send(aborter.signal.aborted?504:502,{error:aborter.signal.aborted?'UPSTREAM_TIMEOUT':'UPSTREAM_SDK_REJECTED'});
    } finally {clearTimeout(timer);aborter.abort();res.off('close',onClose);inFlight--;}
  });
  server.requestTimeout=20000;server.headersTimeout=10000;
  return {server, status:()=>({...config(),...stats})};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const port=Number(process.env.PORT||8787);
    if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
    const {server}=createProxyServer({apiKey:process.env.VWORLD_API_KEY||'',registeredUrl:process.env.VWORLD_SERVICE_URL||PLANNED_URL});
    server.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({service:'jeju-precision-proxy',port,keyConfigured:!!process.env.VWORLD_API_KEY,productionReady:false})));
    server.on('error',()=>{console.error('Proxy server failed to start. Check bind address and PORT.');process.exitCode=1;});
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();});
  } catch {console.error('Invalid proxy configuration. Check PORT, VWORLD_SERVICE_URL and VWORLD_API_KEY; credential values are not logged.');process.exitCode=1;}
}
