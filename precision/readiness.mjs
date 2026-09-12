// Read-only deployment probe. No provider credential and no provider SDK request.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {VERSION,PLANNED_URL} from './session.mjs';
const repo=process.env.GITHUB_REPOSITORY;
if(repo!=='kokoom94-ai/jeju-now-981'||process.env.GITHUB_REF_NAME!=='jeju-before-web')throw Error('Unexpected audit repository or branch');
const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(process.env.GH_TOKEN?{Authorization:'Bearer '+process.env.GH_TOKEN}:{})};
async function api(path){const r=await fetch('https://api.github.com/repos/'+repo+path,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Metadata HTTP '+r.status);return r.json();}
const [meta,main]=await Promise.all([api(''),api('/git/ref/heads/main')]);
const hash=b=>createHash('sha256').update(b).digest('hex');
const names=['index.html','app.mjs','bridge.mjs','session.mjs','connection.mjs','places.json','site.json'];
const checks=await Promise.all(names.map(async name=>{
 const url=new URL(name==='index.html'?'':name,PLANNED_URL).href;
 try {
  const r=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  const content=Buffer.from(await r.arrayBuffer());
  return {file:name,status:r.status,contentType:r.headers.get('content-type'),matchesStaged:r.ok&&hash(content)===hash(await fs.readFile('_precision_site/'+name))};
 }catch {return {file:name,status:null,matchesStaged:false,error:'NETWORK_OR_REDIRECT'};}
}));
const expected={main:'c5578da4d1ba24a8341de512552db69d56c14aba','index.html':'aa421d0027e8df0781284bd77e12208aa384bd0d','real.html':'960b23903202d64f30128d99ee415d5e8108e92c'};
const protectedFiles=Object.fromEntries(['index.html','real.html'].map(f=>{const sha=execFileSync('git',['hash-object',f],{encoding:'utf8'}).trim();return [f,{sha,unchangedSinceAuditStart:sha===expected[f]}];}));
const result={version:VERSION,checkedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID,sourceCommit:process.env.GITHUB_SHA,
 dedicatedUrl:PLANNED_URL,pagesEnabled:meta.has_pages===true,pagesSettingChanged:false,dedicatedSiteMatchesStaged:checks.every(c=>c.matchesStaged),httpChecks:checks,
 mainSha:main.object.sha,mainUnchangedSinceAuditStart:main.object.sha===expected.main,protectedFiles,
 userReportedKeyIssued:true,keyUsedByAudit:false,proxyDeploymentVerified:false,sdkLiveTested:false,jejuPrecisionModelsReceived:false,productionReady:false,
 blockers:[...(meta.has_pages?[]:['ENABLE_GITHUB_PAGES']),...(checks.every(c=>c.matchesStaged)?[]:['VERIFY_DEDICATED_SITE_BYTES']),'CONFIGURE_USER_KEY_IN_BROWSER_OR_PROXY_ENV','VERIFY_REAL_VWORLD_SDK_AND_JEJU_GEOMETRY']};
await fs.writeFile('precision/readiness.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(!result.mainUnchangedSinceAuditStart||Object.values(protectedFiles).some(f=>!f.unchangedSinceAuditStart))throw Error('Protected content changed; inspect before claiming preservation');
