import {generateKeyPairSync,privateDecrypt,createDecipheriv,createHash,constants} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const repo=process.env.GITHUB_REPOSITORY, branch=process.env.GITHUB_REF_NAME, run=String(process.env.GITHUB_RUN_ID);
const site=process.env.JEJU_SITE_ID, url='https://jeju-before-walk.netlify.app';
const gh=process.env.GH_TOKEN;
if(repo!=='kokoom94-ai/jeju-now-981'||branch!=='jeju-before-web'||site!=='16396ec7-5ee7-408d-84ce-8c7d93d866a9')throw new Error('Unexpected deployment scope');
const api=`https://api.github.com/repos/${repo}/contents/`;
const headers={Authorization:`Bearer ${gh}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function readFile(p){const r=await fetch(api+p+'?ref='+encodeURIComponent(branch),{headers});if(r.status===404)return null;if(!r.ok)throw new Error(`GitHub read failed: ${r.status}`);const j=await r.json();return {sha:j.sha,bytes:Buffer.from(j.content,'base64')};}
async function save(p,data){const old=await readFile(p);const r=await fetch(api+p,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:`JEJU BEFORE deployment ${run}: ${path.basename(p)}`,branch,content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64'),...(old?{sha:old.sha}:{})})});if(!r.ok)throw new Error(`GitHub result write failed: ${r.status}`);}
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
await save(`.deployment/public-key-${run}.json`,{runId:run,siteId:site,algorithm:'RSA-OAEP-SHA256 + AES-256-GCM',publicKey,createdAt:new Date().toISOString()});
console.log('One-time deployment session is ready. Only the public key is stored in Git.');
let encrypted,parts;
for(let n=0;n<240;n++){
 const session=await readFile(`.deployment/session-${run}.json`);
 if(session){
  parts=await Promise.all([1,2,3,4].map(i=>readFile(`.deployment/payload-${String(i).padStart(2,'0')}.b64`)));
  if(parts.every(Boolean)){encrypted=JSON.parse(session.bytes.toString());break;}
 }
 await sleep(5000);
}
if(!encrypted)throw new Error('Deployment session timed out without modifying the live site');
if(String(encrypted.runId)!==run||encrypted.siteId!==site)throw new Error('Session binding mismatch');
const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(encrypted.encryptedKey,'base64'));
const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(encrypted.iv,'base64'));
decipher.setAAD(Buffer.from(`${repo}|${run}|${site}`));decipher.setAuthTag(Buffer.from(encrypted.tag,'base64'));
const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext,'base64')),decipher.final()]).toString());
key.fill(0);
const proxy=payload.proxy;
if(payload.expiresAt<Date.now()||typeof proxy!=='string'||!proxy.startsWith('https://netlify-mcp.netlify.app/proxy/'))throw new Error('Expired or invalid deployment capability');
const redact=s=>String(s).split(proxy).join('[REDACTED]').split(proxy.split('/').at(-1)).join('[REDACTED]');
console.log(`::add-mask::${proxy}`);console.log(`::add-mask::${proxy.split('/').at(-1)}`);
const source=Buffer.from(parts.map(p=>p.bytes.toString().trim()).join(''),'base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
if(sha(source)!=='0dec99b555f5d06c3b5a556c8a6d40be3d9b8e56cefc4d1d2f17f73f40b6ace7')throw new Error('Compressed source integrity mismatch');
const html=brotliDecompressSync(source);
if(sha(html)!=='b295bbb513b950f38a1ec38dcbcae4828d24fabd1962f524bcf7327d452f9629')throw new Error('HTML source integrity mismatch');
const work=await mkdtemp(path.join(tmpdir(),'jeju-before-site-'));
try{
 await writeFile(path.join(work,'index.html'),html);
 await writeFile(path.join(work,'netlify.toml'),'[build]\n  publish = "."\n');
 await writeFile(path.join(work,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Robots-Tag: noindex, nofollow\n');
 const status={version:'1.0.0-beta.1',mapMode:'schematic',places:32,naverVerified:0,publicReleaseReviewed:false,notice:'공간 초안입니다. 실제 도로·건물·행정경계와 네이버 장소 전수 검증은 미완료입니다.',htmlSha256:sha(html),runId:run};
 await writeFile(path.join(work,'build-status.json'),JSON.stringify(status,null,2));
 console.log('Verified exact delivered HTML. Publishing only the standalone app and public status files.');
 try{const output=await exec('npx',['-y','@netlify/mcp@latest','--site-id',site,'--proxy-path',proxy],{cwd:work,timeout:540000,maxBuffer:8*1024*1024,env:{...process.env,CI:'true'}});console.log(redact(output.stdout));console.log(redact(output.stderr));}
 catch(e){console.log(redact(e.stdout||''));console.error(redact(e.stderr||''));throw new Error(redact(e.message));}
 let verified=false;
 for(let n=0;n<36;n++){
  try{const r=await fetch(url+'/?check='+run,{redirect:'follow'});if(r.ok&&sha(Buffer.from(await r.arrayBuffer()))===sha(html)){verified=true;break;}}catch{}
  await sleep(5000);
 }
 if(!verified)throw new Error('Remote deployment did not return the exact app HTML');
 const result={ok:true,siteId:site,url,runId:run,publishedAt:new Date().toISOString(),httpVerified:true,...status};
 await save('deploy/publish-result.json',result);
 console.log(JSON.stringify(result,null,2));
}finally{await rm(work,{recursive:true,force:true});}
