import {readFile,writeFile} from 'node:fs/promises';
import {brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const repo=process.env.GITHUB_REPOSITORY,branch=process.env.GITHUB_REF_NAME;
if(repo!=='kokoom94-ai/jeju-now-981'||branch!=='jeju-before-web')throw Error('Unexpected publication scope');
const hash=b=>createHash('sha256').update(b).digest('hex');
const parts=await Promise.all([1,2,3,4].map(i=>readFile(`.deployment/payload-${String(i).padStart(2,'0')}.b64`,'utf8')));
const packed=Buffer.from(parts.map(x=>x.trim()).join(''),'base64');
if(hash(packed)!=='0dec99b555f5d06c3b5a556c8a6d40be3d9b8e56cefc4d1d2f17f73f40b6ace7')throw Error('Packed source mismatch');
const html=brotliDecompressSync(packed);
if(hash(html)!=='b295bbb513b950f38a1ec38dcbcae4828d24fabd1962f524bcf7327d452f9629')throw Error('HTML source mismatch');
const base=`https://api.github.com/repos/${repo}/contents/`;
const headers={Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
async function save(p,bytes){
 const r=await fetch(base+p+'?ref='+branch,{headers});let sha;
 if(r.ok)sha=(await r.json()).sha;else if(r.status!==404)throw Error('Read failed '+r.status);
 const put=await fetch(base+p,{method:'PUT',headers,body:JSON.stringify({message:`JEJU BEFORE: publish ${p}`,branch,content:Buffer.from(bytes).toString('base64'),...(sha?{sha}:{})})});
 if(!put.ok)throw Error('Publication failed '+put.status);return await put.json();
}
const commit=(await save('index.html',html)).commit.sha;
const url=`https://rawcdn.githack.com/${repo}/${commit}/index.html`;
const status={ok:true,kind:'public-cdn-beta',url,sourceUrl:`https://github.com/${repo}/blob/${branch}/index.html`,commit,htmlSha256:hash(html),bytes:html.length,places:32,mapMode:'schematic',naverVerified:0,netlifyDeployed:false,netlifyFailure:'Account credit usage exceeded',publishedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID};
let response;
for(let n=0;n<10;n++){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});const b=Buffer.from(await r.arrayBuffer());response={status:r.status,contentType:r.headers.get('content-type'),sha256:hash(b)};if(r.ok&&hash(b)===hash(html))break;}catch(e){response={error:e.message};}
 await new Promise(r=>setTimeout(r,5000));
}
status.httpCheck=response;status.httpVerified=response?.status===200&&response.sha256===hash(html);
await writeFile('cdn-target.json',JSON.stringify(status,null,2));
await save('deploy/cdn-publication.json',JSON.stringify(status,null,2)+'\n');
await save('README.md',`# JEJU BEFORE — public beta\n\n[Open the 3D walking map](${url})\n\nThe app is published as a static beta via GitHub + a third-party CDN. Netlify deployment was blocked by exhausted account credits; no payment or billing settings were changed. A first-visit confirmation may appear before the HTML opens.\n\n**This is a schematic spatial draft, not a verified map of real streets or Naver places.** It contains 32 draft places, third-person walking, clickable place information and browser-local itinerary/avatar settings. No API credentials are included. Do not enter sensitive data in this preview.\n\nThis isolated branch does not modify the repository's main branch or the existing 9.81 service. The readable standalone source is index.html. Machine-readable publication and browser test results are under deploy/.\n`);
console.log(JSON.stringify(status,null,2));
if(!status.httpVerified)throw Error('CDN has not returned the exact verified HTML');
