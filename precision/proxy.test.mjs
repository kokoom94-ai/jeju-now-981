import test from 'node:test';
import assert from 'node:assert/strict';
import {createProxyServer,serviceURL} from './proxy-server.mjs';
import {proxyBase,proxySDK,resolveProxy,PROXY_ORIGIN} from './connection.mjs';
import {frameHTML,initialState} from './bridge.mjs';
const TEST_KEY='TEST-ONLY-NOT-A-REAL-KEY-00000';
const page='https://kokoom94-ai.github.io/jeju-now-981/';
const origin=new URL(page).origin;
async function fixture(t, options={}){
  let calls=0;
  const app=createProxyServer({registeredUrl:page,fetchImpl:async()=>{calls++;throw Error('Unexpected external request');},...options});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{app.server.closeAllConnections();app.server.close(r);}));
  const base='http://127.0.0.1:'+app.server.address().port;
  return {...app,calls:()=>calls,get:(path,init={})=>fetch(base+path,init)};
}
test('missing key: healthy process is not a live 3D connection',async t=>{
 const app=await fixture(t);const r=await app.get('/healthz');const j=await r.json();
 assert.equal(r.status,200);assert.equal(j.keyConfigured,false);assert.equal(j.productionReady,false);assert.equal(app.calls(),0);
});
test('public configuration never returns credential or claims geometry',async t=>{
 const app=await fixture(t,{apiKey:TEST_KEY});const r=await app.get('/api/vworld/config',{headers:{Origin:origin}});const text=await r.text();
 assert.equal(r.headers.get('access-control-allow-origin'),origin);assert(!text.includes(TEST_KEY));
 const j=JSON.parse(text);assert.equal(j.keyConfigured,true);assert.equal(j.sdkLiveTested,false);assert.equal(j.jejuPrecisionModelsReceived,false);assert.equal(app.calls(),0);
});
test('keyless SDK request fails closed without upstream contact',async t=>{
 const app=await fixture(t);const r=await app.get('/api/vworld/sdk.js',{headers:{Origin:origin}});
 assert.equal(r.status,503);assert.equal(app.calls(),0);
});
test('unknown, forged and conflicting browser origins are refused',async t=>{
 const app=await fixture(t,{apiKey:TEST_KEY});
 for(const headers of [{},{Origin:'https://attacker.example'},{Referer:'https://kokoom94-ai.github.io.evil.example/'},{Origin:origin,Referer:'https://attacker.example/'},{Origin:'null',Referer:page}]){
  const r=await app.get('/api/vworld/sdk.js',{headers});assert.equal(r.status,403);
 }
 assert.equal(app.calls(),0);
});
test('arbitrary URLs, credential query strings and write methods are rejected',async t=>{
 const app=await fixture(t,{apiKey:TEST_KEY});
 assert.equal((await app.get('/api/vworld/sdk.js?url=https://example.com',{headers:{Origin:origin}})).status,400);
 assert.equal((await app.get('/api/vworld/sdk.js?apiKey='+TEST_KEY,{headers:{Origin:origin}})).status,400);
 assert.equal((await app.get('/api/vworld/sdk.js',{method:'POST',headers:{Origin:origin}})).status,405);
 assert.equal((await app.get('/api/vworld/tiles/1')).status,404);assert.equal(app.calls(),0);
});
test('CORS preflight grants only registered origin and GET',async t=>{
 const app=await fixture(t);
 const ok=await app.get('/api/vworld/sdk.js',{method:'OPTIONS',headers:{Origin:origin}});
 assert.equal(ok.status,204);assert.equal(ok.headers.get('access-control-allow-methods'),'GET');
 assert.equal((await app.get('/api/vworld/sdk.js',{method:'OPTIONS',headers:{Origin:'https://evil.example'}})).status,403);
});
test('transport fixture uses fixed official endpoint, validated referrer and no redirects',async t=>{
 let request;
 const app=await fixture(t,{apiKey:TEST_KEY,fetchImpl:async(url,options)=>{request={url,options};return new Response('/* transport fixture: not VWorld or a model */',{headers:{'content-type':'text/javascript;charset=UTF-8'}});}});
 const r=await app.get('/api/vworld/sdk.js',{headers:{Origin:origin,Referer:page}});
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(await r.text(),/transport fixture/);
 const u=new URL(request.url);assert.equal(u.origin,'https://map.vworld.kr');assert.equal(u.pathname,'/js/webglMapInit.js.do');assert.equal(u.searchParams.get('apiKey'),TEST_KEY);
 assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Referer,page);
 assert.equal(app.status().sdkLiveTested,false);assert.equal(app.status().productionReady,false);
});
test('provider HTTP errors never echo body or credential',async t=>{
 const app=await fixture(t,{apiKey:TEST_KEY,fetchImpl:async()=>new Response(TEST_KEY,{status:403})});
 const r=await app.get('/api/vworld/sdk.js',{headers:{Origin:origin}});assert.equal(r.status,502);assert(!(await r.text()).includes(TEST_KEY));
});
test('HTML auth pages are not executed as JavaScript',async t=>{
 const app=await fixture(t,{apiKey:TEST_KEY,fetchImpl:async()=>new Response('<html>auth failed</html>',{headers:{'content-type':'text/html'}})});
 assert.equal((await app.get('/api/vworld/sdk.js',{headers:{Origin:origin}})).status,502);
});
test('oversized and empty SDK responses fail closed',async t=>{
 for(const body of ['', 'x'.repeat(2*1024*1024+1)]){
 const app=await fixture(t,{apiKey:TEST_KEY,fetchImpl:async()=>new Response(body,{headers:{'content-type':'application/javascript'}})});
 assert.equal((await app.get('/api/vworld/sdk.js',{headers:{Origin:origin}})).status,502);
 }
});
test('upstream timeout is bounded and sanitized',async t=>{
 const app=await fixture(t,{apiKey:TEST_KEY,timeoutMs:20,fetchImpl:async(u,o)=>new Promise((r,j)=>o.signal.addEventListener('abort',()=>j(Error(TEST_KEY)),{once:true}))});
 const r=await app.get('/api/vworld/sdk.js',{headers:{Origin:origin}});assert.equal(r.status,504);assert(!(await r.text()).includes(TEST_KEY));
});
test('global bootstrap quota limits requests',async t=>{
 let calls=0;
 const app=await fixture(t,{apiKey:TEST_KEY,limit:1,fetchImpl:async()=>{calls++;return new Response('/* fixture */',{headers:{'content-type':'application/javascript'}});}});
 assert.equal((await app.get('/api/vworld/sdk.js',{headers:{Origin:origin}})).status,200);
 const second=await app.get('/api/vworld/sdk.js',{headers:{Origin:origin}});assert.equal(second.status,429);assert.equal(second.headers.get('retry-after'),'60');assert.equal(calls,1);
});
test('service URL rejects credentials, fragments, queries and hosted plaintext',()=>{
 for(const u of ['http://example.com','https://u:p@example.com/','https://example.com/?key=test','https://example.com/#key'])assert.throws(()=>serviceURL(u));
 assert.equal(serviceURL('http://localhost:8000').href,'http://localhost:8000/');
 assert.throws(()=>createProxyServer({apiKey:'bad'}));
});
test('browser proxy URL allowlist rejects lookalikes and mixed-content hosts',()=>{
 assert.equal(proxyBase(PROXY_ORIGIN,page),PROXY_ORIGIN);
 for(const v of ['https://evil.example','http://localhost:8787',PROXY_ORIGIN+'.evil.example',PROXY_ORIGIN+'/?key=bad',PROXY_ORIGIN+'/path'])assert.throws(()=>proxyBase(v,page));
 assert.equal(proxyBase('http://127.0.0.1:8787','http://localhost:8000/'),'http://127.0.0.1:8787');
 assert.throws(()=>proxySDK(PROXY_ORIGIN+'/api/vworld/sdk.js?key=bad',page));
});
const config={provider:'VWorld WebGL 3.0',transport:'sdk-bootstrap-proxy',serviceUrl:page,keyConfigured:true,sdkPath:'/api/vworld/sdk.js'};
test('proxy preflight validates contract and sends no credential',async()=>{
 let options;const result=await resolveProxy(PROXY_ORIGIN,page,async(u,o)=>{options=o;assert.equal(u,PROXY_ORIGIN+'/api/vworld/config');return Response.json(config);});
 assert.equal(result.sdkSource,PROXY_ORIGIN+'/api/vworld/sdk.js');assert.equal(options.credentials,'omit');assert(!JSON.stringify(options).includes(TEST_KEY));
});
test('preflight refuses wrong site, missing key, malicious SDK path and HTML',async()=>{
 for(const obj of [{...config,keyConfigured:false},{...config,serviceUrl:'https://evil.example/'},{...config,sdkPath:'https://evil.example/a.js'},{...config,serviceUrl:origin+'/another-project/'}]){
  await assert.rejects(resolveProxy(PROXY_ORIGIN,page,async()=>Response.json(obj)));
 }
 await assert.rejects(resolveProxy(PROXY_ORIGIN,page,async()=>new Response('<html>not configured</html>')));
});
test('frame in proxy mode contains proxy route but no key',()=>{
 const h=frameHTML({sdkSource:PROXY_ORIGIN+'/api/vworld/sdk.js',channel:'test-channel-123',origin});
 assert(h.includes('/api/vworld/sdk.js'));assert(!h.includes(TEST_KEY));assert(!h.includes('apiKey='));
 assert.throws(()=>frameHTML({key:TEST_KEY,sdkSource:PROXY_ORIGIN+'/api/vworld/sdk.js',channel:'test-channel-123',origin}));
 assert.equal(initialState().productionReady,false);
});
