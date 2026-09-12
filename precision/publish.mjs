import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {VERSION,PLANNED_URL,SITE_BRANCH} from './session.mjs';
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GH_TOKEN;
if(repo!=='kokoom94-ai/jeju-now-981'||process.env.GITHUB_REF_NAME!=='jeju-before-web'||!token)throw Error('Unexpected repository, source branch or missing workflow credential');
const base='https://api.github.com/repos/'+repo;
const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
async function api(p,method='GET',body){const r=await fetch(base+p,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});if(r.status===404&&method==='GET')return null;if(!r.ok)throw Error('GitHub '+method+' '+p.split('?')[0]+' HTTP '+r.status);return r.json();}
const mainBefore=(await api('/git/ref/heads/main')).object.sha;
const previous=await api('/git/ref/heads/'+SITE_BRANCH);let baseTree;
if(previous){
 const marker=await api('/contents/site.json?ref='+SITE_BRANCH);
 if(!marker||JSON.parse(Buffer.from(marker.content,'base64').toString('utf8')).app!=='JEJU:BEFORE precision')throw Error('Existing branch is not an owned precision build; refusing to replace it');
 baseTree=(await api('/git/commits/'+previous.object.sha)).tree.sha;
}
const names=['.nojekyll','index.html','app.mjs','bridge.mjs','session.mjs','connection.mjs','CONNECT_3_2.md','places.json','site.json','README.md'];
const tree=[];for(const name of names)tree.push({path:name,mode:'100644',type:'blob',content:await fs.readFile('_precision_site/'+name,'utf8')});
const created=await api('/git/trees','POST',{...(baseTree?{base_tree:baseTree}:{}),tree});
const commit=await api('/git/commits','POST',{message:'Stage precision 3.2 proxy-capable connection gate; no key or model included',tree:created.sha,parents:previous?[previous.object.sha]:[]});
if(previous)await api('/git/refs/heads/'+SITE_BRANCH,'PATCH',{sha:commit.sha,force:false});
else await api('/git/refs','POST',{ref:'refs/heads/'+SITE_BRANCH,sha:commit.sha});
const url='https://rawcdn.githack.com/'+repo+'/'+commit.sha+'/index.html';
const expected=createHash('sha256').update(await fs.readFile('_precision_site/index.html')).digest('hex');
let check={ok:false,status:null,htmlSha256:null};
for(let attempt=0;attempt<4;attempt++){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(30000)}),body=Buffer.from(await r.arrayBuffer()),sha=createHash('sha256').update(body).digest('hex');check={ok:r.ok&&sha===expected,status:r.status,htmlSha256:sha,contentType:r.headers.get('content-type')};if(check.ok)break;}catch(e){check={ok:false,error:e.name};}
 await new Promise(r=>setTimeout(r,3000));
}
if(!check.ok)throw Error('Public HTML bytes not verified: '+JSON.stringify(check));
const meta=await api('');
const mainAfter=(await api('/git/ref/heads/main')).object.sha;
if(mainAfter!==mainBefore)throw Error('Main changed concurrently; inspect before reporting preservation');
const publication={version:VERSION,url,siteBranch:SITE_BRANCH,commit:commit.sha,sourceBranch:'jeju-before-web',sourceCommit:process.env.GITHUB_SHA,
 publishedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID,publicPreviewVerified:true,publicPreviewKeyEntryEnabled:false,htmlCheck:check,
 plannedDedicatedUrl:PLANNED_URL,pagesEnabled:meta.has_pages===true,pagesSettingChanged:false,pagesActionRequired:meta.has_pages!==true,
 userReportedKeyIssued:true,providerConfigured:false,proxyDeploymentVerified:false,sdkLiveTested:false,jejuPrecisionModelsReceived:false,productionReady:false,
 mainBranchModified:false,mainShaBefore:mainBefore,mainShaAfter:mainAfter,existingWalkingFilesModified:false,
 note:'Connection UI and proxy source prepared. User key already issued but not supplied to runtime. Check readiness.json for actual Pages HTTP/file state; staging a branch is not live provider validation.'};
await fs.writeFile('precision/publication.json',JSON.stringify(publication,null,2));
console.log(JSON.stringify(publication,null,2));
