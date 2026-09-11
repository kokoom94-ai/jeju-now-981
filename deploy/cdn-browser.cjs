const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const target=JSON.parse(fs.readFileSync('cdn-target.json','utf8'));
const parsed=new URL(target.url);
if(parsed.origin!=='https://rawcdn.githack.com'||!parsed.pathname.startsWith('/kokoom94-ai/jeju-now-981/'))throw Error('Unexpected preview URL');
let code=fs.readFileSync('deploy/smoke.cjs','utf8');
code=code.replace("const url='https://jeju-before-walk.netlify.app/';",'const url='+JSON.stringify(target.url)+';');
code=code.replace("location.origin==='https://jeju-before-walk.netlify.app'","location.origin==='https://rawcdn.githack.com'");
code=code.replace('deploy/browser-result.json','deploy/cdn-browser-result.json');
code=code.replace("await page.waitForFunction('window.__JEJU_DEBUG__?.state.frames>3'",`if(!await page.evaluate('Boolean(window.__JEJU_DEBUG__)')){
  await page.waitForTimeout(2500);
  if(!await page.evaluate('Boolean(window.__JEJU_DEBUG__)')){
    const text=await page.locator('body').innerText();
    console.log('Initial CDN screen: '+text.slice(0,1600));
    const choices=page.getByRole('button',{name:/continue|proceed|confirm|open|yes|view/i});
    if(await choices.count())await choices.first().click();
    else{const links=page.getByRole('link',{name:/continue|proceed|confirm|open|yes|view/i});if(await links.count())await links.first().click();}
  }
}
await page.waitForFunction('window.__JEJU_DEBUG__?.state.frames>3'`);
fs.writeFileSync('deploy/cdn-smoke.cjs',code);
const r=spawnSync(process.execPath,['deploy/cdn-smoke.cjs'],{stdio:'inherit',env:process.env});
process.exitCode=r.status||0;
