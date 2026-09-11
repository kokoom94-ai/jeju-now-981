import fs from 'node:fs/promises';
import path from 'node:path';
import {parsePlaces} from './bridge.mjs';
import {VERSION,PLANNED_URL,SITE_BRANCH} from './session.mjs';
const out=path.resolve('_precision_site');
await fs.mkdir(out,{recursive:true});
const original=await fs.readFile('index.html','utf8');
const places=parsePlaces(original);if(places.length!==32)throw Error('Unexpected original place set; review before deployment');
let bridge=await fs.readFile('precision/bridge.mjs','utf8');
const old="send('model-picked',{properties});";
const replacement=`let lon=null,lat=null;
          try {
            if(viewer.scene.pickPositionSupported){
              const point=viewer.scene.pickPosition(m.position);
              if(point){const cart=C.Cartographic.fromCartesian(point);lon=C.Math.toDegrees(cart.longitude);lat=C.Math.toDegrees(cart.latitude);}
            }
          } catch {}
          send('model-picked',{providerType:'Cesium3DTileFeature',properties,lon,lat});`;
if(bridge.includes(old))bridge=bridge.replace(old,replacement);
else if(!bridge.includes("providerType:'Cesium3DTileFeature'"))throw Error('Unrecognized bridge; refuse to patch');
await fs.writeFile('precision/bridge.mjs',bridge);
for(const name of ['index.html','app.mjs','bridge.mjs','session.mjs'])await fs.copyFile('precision/'+name,path.join(out,name));
await fs.writeFile(path.join(out,'places.json'),JSON.stringify(places,null,2));
await fs.writeFile(path.join(out,'.nojekyll'),'');
const sourceReadme=await fs.readFile('precision/README.md','utf8');
const additions=`# JEJU:BEFORE precision — connection gate\n\nVersion: ${VERSION}\n\nThis site has no API credential and no verified Jeju precision building connection. It does not draw substitute buildings. Existing main and real.html remain unchanged.\n\n## Dedicated hosting setup\n\nGitHub Settings > Pages > Deploy from a branch > ${SITE_BRANCH} > /(root). This setting is not changed by the workflow.\nPlanned dedicated URL (not active until Pages is enabled): ${PLANNED_URL}\nThe shared rawcdn preview disables the key field and refuses SDK requests.\nA user-owned VWorld WebGL 3D key must be registered to the dedicated site and entered there, not in chat, GitHub source or the shared CDN. No key is stored by this app.\n\n## Observation records\n\nSix area review targets, not surveyed administrative boundaries. One picked Cesium tile feature is only an object observation. Selection position must be within the project extent and within 1,700m of the chosen review point. This is NOT proof that it lies within the administrative region. All accuracy, full-coverage, source-date and walking validation flags remain false or null. Reload clears records; export the diagnostic JSON first.\n\n## Build and test\n\nSource: precision/ on jeju-before-web. Run node precision/prepare.mjs, node --test precision/*.test.mjs, then serve _precision_site. The browser QA checks the real public preview in the unconfigured state and a local dedicated-host layout. It does NOT simulate a successful provider connection.\n\n---\n\n`;
await fs.writeFile(path.join(out,'README.md'),additions+sourceReadme);
await fs.writeFile(path.join(out,'site.json'),JSON.stringify({app:'JEJU:BEFORE precision',version:VERSION,sourceBranch:'jeju-before-web',siteBranch:SITE_BRANCH,places:places.length,generatedBuildingFallback:false,providerConfigured:false,productionReady:false,plannedDedicatedUrl:PLANNED_URL},null,2));
console.log(JSON.stringify({built:true,output:out,places:places.length,providerConfigured:false,productionReady:false}));
