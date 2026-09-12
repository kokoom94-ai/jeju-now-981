import fs from 'node:fs/promises';
import path from 'node:path';
import {parsePlaces} from './bridge.mjs';
import {VERSION,PLANNED_URL,SITE_BRANCH} from './session.mjs';
const out=path.resolve('_precision_site');
const places=parsePlaces(await fs.readFile('index.html','utf8'));
if(places.length!==32)throw Error('Unexpected original place set; review before deployment');
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
// Build copies source verbatim. It never patches tracked code or reads .env files.
for(const name of ['index.html','app.mjs','bridge.mjs','session.mjs','connection.mjs','CONNECT_3_2.md']){
  await fs.copyFile('precision/'+name,path.join(out,name));
}
await fs.writeFile(path.join(out,'places.json'),JSON.stringify(places,null,2));
await fs.writeFile(path.join(out,'.nojekyll'),'');
const note='# JEJU:BEFORE '+VERSION+'\n\nCurrent connection instructions: [CONNECT_3_2.md](CONNECT_3_2.md).\n\nThe service key has been issued by the user but is NOT configured in this build. SDK reception, Jeju building coverage and geometry accuracy are unverified.\n\nThe following 3.1 document is historical context; use CONNECT_3_2.md for the current connection procedure.\n\n---\n\n';
await fs.writeFile(path.join(out,'README.md'),note+await fs.readFile('precision/README.md','utf8'));
await fs.writeFile(path.join(out,'site.json'),JSON.stringify({app:'JEJU:BEFORE precision',version:VERSION,sourceBranch:'jeju-before-web',siteBranch:SITE_BRANCH,places:places.length,generatedBuildingFallback:false,providerConfigured:false,productionReady:false,plannedDedicatedUrl:PLANNED_URL,availableTransports:['direct-sdk','sdk-bootstrap-proxy'],proxyDeploymentVerified:false},null,2));
console.log(JSON.stringify({built:true,output:out,places:places.length,providerConfigured:false,productionReady:false}));
