const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(path.join(process.env.PLAYWRIGHT_ROOT,'node_modules/playwright'));
const publication=JSON.parse(fs.readFileSync('precision/publication.json','utf8'));
if(!publication.url.startsWith('https://rawcdn.githack.com/kokoom94-ai/jeju-now-981/'))throw Error('Unexpected preview');
const checks=[],errors=[],requests=[];const dir='precision-qa';fs.mkdirSync(dir,{recursive:true});
const record=(name,ok)=>{checks.push({name,passed:!!ok});if(!ok)throw Error(name);};
async function ready(page,url){
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});record('Page returns HTTP 200: '+new URL(url).host,response.status()===200);
 try{await page.waitForFunction('Boolean(window.__JEJU_PRECISION__)',{},{timeout:12000});}catch{
  const buttons=page.getByRole('button',{name:/continue|proceed|confirm|open|yes|view/i});
  const links=page.getByRole('link',{name:/continue|proceed|confirm|open|yes|view/i});
  if(await buttons.count())await buttons.first().click();else if(await links.count())await links.first().click();
  await page.waitForFunction('Boolean(window.__JEJU_PRECISION__)',{},{timeout:30000});
 }
 await page.waitForFunction('window.__JEJU_PRECISION__.placeCount===32',{},{timeout:15000});
}
function watch(page){page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{const host=new URL(r.url()).hostname;if(host==='vworld.kr'||host.endsWith('.vworld.kr'))requests.push({host,method:r.method()});});}
(async()=>{
 let browser,server,failed=null;
 try{
  const executable=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(p=>fs.existsSync(p));
  browser=await chromium.launch({...(executable?{executablePath:executable}:{}),headless:true,args:['--no-sandbox']});
  let ctx=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true}),p=await ctx.newPage();watch(p);await ready(p,publication.url);
  record('Public preview defaults to unconfigured',await p.evaluate("window.__JEJU_PRECISION__.status.state==='not-configured'"));
  record('Shared CDN password field disabled',await p.locator('#api-key').isDisabled());
  record('Shared CDN connect button disabled',await p.locator('#connect').isDisabled());
  record('All six review areas present',await p.locator('.area').count()===6);
  record('No provider iframe started',await p.locator('#frame').isHidden()&&!(await p.locator('#frame').getAttribute('srcdoc')));
  record('No generated city drawn',await p.locator('canvas').count()===0);
  record('Existing 32 place records retained',await p.locator('.place').count()===32);
  await p.locator('aside details').last().locator('summary').click();await p.locator('#search').fill('관덕정');
  record('Place search works',await p.locator('.place').count()>=1);await p.locator('.place').first().click();
  record('Place popup works before SDK',await p.locator('#feature').isVisible());
  record('Naver official search link retained',(await p.locator('#naver-link').getAttribute('href')).startsWith('https://map.naver.com/p/search/'));
  await p.locator('#close-feature').click();await p.locator('#search').fill('');
  await p.evaluate(()=>{document.querySelector('#api-key').value='TEST-ONLY-NOT-A-REAL-KEY-00000';document.querySelector('#connect-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  record('Programmatic submit cannot bypass shared-origin gate',await p.evaluate("window.__JEJU_PRECISION__.status.state==='not-configured'&&document.querySelector('#api-key').value===''"));
  await p.evaluate(()=>window.postMessage({type:'sdk-ready',channel:'spoofed-message'},location.origin));
  record('Forged window messages cannot mark provider ready',await p.evaluate('!window.__JEJU_PRECISION__.status.sdkReady'));
  const download=await Promise.all([p.waitForEvent('download'),p.locator('#report').click()]);await download[0].saveAs(dir+'/diagnostic.json');
  const diagnostic=JSON.parse(fs.readFileSync(dir+'/diagnostic.json','utf8'));
  record('Actual browser download keeps geometry flags unverified',diagnostic.productionReady===false&&diagnostic.heightAccuracyVerified===false&&diagnostic.observations.length===6);
  record('Diagnostic contains no credential',!JSON.stringify(diagnostic).includes('TEST-ONLY-NOT-A-REAL-KEY-00000'));
  await p.locator('#copy-registration').click();
  record('Registration fields can be copied or selected',(await p.locator('#registration-copy').innerText()).includes('https://kokoom94-ai.github.io/jeju-now-981/'));
  await p.screenshot({path:dir+'/desktop-preview.png',fullPage:true});await ctx.close();
  ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p=await ctx.newPage();watch(p);await ready(p,publication.url);
  record('Mobile has no horizontal overflow',await p.evaluate('document.documentElement.scrollWidth<=innerWidth'));
  record('Mobile shared-host key gate active',await p.locator('#api-key').isDisabled());
  await p.locator('aside details').last().locator('summary').click();await p.locator('#search').fill('휘슬락');await p.locator('.place').first().click();
  record('Mobile place popup accessible',await p.locator('#feature').isVisible());await p.screenshot({path:dir+'/mobile-preview.png',fullPage:true});await ctx.close();
  const root=path.resolve('_precision_site');
  server=http.createServer((req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),full=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!full.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const body=fs.readFileSync(full);res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'}[path.extname(full)]||'text/plain'});res.end(body);}catch{res.writeHead(404);res.end('not found');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port+'/';
  ctx=await browser.newContext({viewport:{width:1440,height:1000}});p=await ctx.newPage();watch(p);await ready(p,local);
  record('Local dedicated-host form enabled',await p.locator('#api-key').isEnabled()&&await p.locator('#connect').isEnabled());
  await p.locator('#connect').click();record('Blank key rejected without SDK',await p.evaluate("window.__JEJU_PRECISION__.status.state==='not-configured'"));
  await p.locator('#api-key').fill('bad-key');await p.locator('#confirmed').check();await p.locator('#connect').click();
  record('Malformed key rejected and cleared',await p.locator('#api-key').inputValue()==='');
  record('Actual native storage remains free of app credentials',await p.evaluate('localStorage.length===0&&sessionStorage.length===0'));
  record('Local inspection still not geometry-ready',await p.evaluate('!window.__JEJU_PRECISION__.report.productionReady'));
  await p.screenshot({path:dir+'/local-connection-form.png',fullPage:true});await ctx.close();
  record('No VWorld SDK or model request during no-key tests',requests.length===0);
  record('No JavaScript runtime errors',errors.length===0);
 }catch(e){failed=String(e);console.error(failed);}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
 const result={url:publication.url,testedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID,ok:!failed&&checks.every(c=>c.passed),passed:checks.filter(c=>c.passed).length,checks,errors,providerRequestCount:requests.length,failure:failed,
 sdkLiveTested:false,jejuModelReceived:false,actualGeometryVerified:false,scope:'Live public HTTPS no-key preview plus local-host browser checks. No successful provider response is mocked or claimed. Not a physical-phone performance test.'};
 fs.writeFileSync('precision/browser-result.json',JSON.stringify(result,null,2));fs.writeFileSync(dir+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
})().catch(e=>{console.error(String(e));process.exitCode=1;});
