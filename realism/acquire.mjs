import fs from 'node:fs/promises';
import vm from 'node:vm';
const html=await fs.readFile('index.html','utf8');
const core=html.slice(html.indexOf('/* JEJU BEFORE · navigation'),html.indexOf('/* Shared OSM converter'));
const osm=html.slice(html.indexOf('/* Shared OSM converter'),html.indexOf('/* JEJU BEFORE · small, original WebGL'));
if(!core||!osm)throw Error('Expected v1 source markers not found');
vm.runInThisContext(core);vm.runInThisContext(osm);
const seed=JSON.parse(html.match(/globalThis\.JEJU_DATA=(.+);\n/)[1]);
const UA='JejuBefore-Realism-Build/2.0 (https://github.com/kokoom94-ai/jeju-now-981/tree/jeju-before-web)';
await fs.mkdir('realism/assets',{recursive:true});await fs.mkdir('realism/vendor',{recursive:true});
const report={version:'2.0.0-realism-beta',acquiredAt:new Date().toISOString(),textures:[],failures:[]};
async function response(url,timeout=45000,options={}){const r=await fetch(url,{...options,headers:{'User-Agent':UA,...options.headers},signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error('HTTP '+r.status+' '+url.split('?')[0]);return r;}
let elements=[];
const box='33.468,126.462,33.536,126.575';
const queries=[`[out:json][timeout:100];(way[highway](${box});way[natural=coastline](33.455,126.445,33.55,126.595);way[natural=water](${box});way[leisure=park](${box});way[aeroway](${box});node[natural=tree](${box});node[highway=crossing](${box}););out geom;`,`[out:json][timeout:100];way[building](${box});out geom;`];
for(let i=0;i<queries.length;i++){
 let data,last;
 for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
  try{console.log('Requesting geometry part',i+1,endpoint);data=await(await response(endpoint,125000,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:queries[i]})})).json();if(data.remark||!Array.isArray(data.elements))throw Error(data.remark||'Invalid Overpass response');break;}catch(e){last=e;console.log(String(e.message).slice(0,180));}
 }
 if(!data?.elements)throw last||Error('No geometry');elements.push(...data.elements);
}
const map=JejuOSM.convertOverpass({elements},{fallbackCoast:seed.map.coast});
const lookup=new Map(elements.filter(e=>e.type==='way').map(e=>[e.id,e.tags||{}]));
for(const b of map.buildings){const t=lookup.get(Number(b.id.replace('osm-way-','')))||{};b.name=t['name:ko']||t.name||'';b.wallColor=t['building:colour']||null;b.roofColor=t['roof:colour']||null;b.roofShape=t['roof:shape']||null;b.material=t['building:material']||null;}
for(const r of map.roads){const t=lookup.get(Number(r.id.match(/(?:osm-way-|osm-airway-)(\d+)/)?.[1]))||{};r.highway=t.highway||t.aeroway||'';r.surface=t.surface||null;r.bridge=t.bridge==='yes';r.tunnel=t.tunnel==='yes';r.sidewalk=t.sidewalk||null;}
map.points=elements.filter(e=>e.type==='node'&&JejuCore.validGeo(e.lon,e.lat)).map(e=>({id:e.id,lon:e.lon,lat:e.lat,kind:e.tags?.natural==='tree'?'tree':'crossing'}));
map.realismNotice='도로·건물 윤곽은 OSM 원본. 사진 재질·창문·수목 크기·조명은 시각화이며 실제 외관 촬영이나 측량이 아닙니다. 지형고도·보행안전·장소 출입구 미검증.';
await fs.writeFile('realism/world-v2.json',JSON.stringify(map));
report.geometry={roads:map.roads.length,buildings:map.buildings.length,coastSource:map.coastSource,coastPoints:map.coast.length,points:map.points.length,walkable:map.roads.filter(r=>r.walkable).length,heightExplicit:map.buildings.filter(b=>b.heightSource==='OSM height').length,heightFromLevels:map.buildings.filter(b=>b.heightSource==='OSM levels x assumed 3m').length,heightAssumed:map.buildings.filter(b=>b.heightSource==='Assumed 9m').length,bounds:map.bounds};
for(const [name,url]of [['three.module.js','https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'],['three.core.js','https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.js'],['Sky.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/objects/Sky.js'],['BufferGeometryUtils.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/utils/BufferGeometryUtils.js'],['THREE-LICENSE.txt','https://cdn.jsdelivr.net/npm/three@0.180.0/LICENSE']]){const bytes=Buffer.from(await(await response(url)).arrayBuffer());await fs.writeFile('realism/vendor/'+name,bytes);}
for(const [alias,ids]of [['road',['asphalt_01','asphalt_02']],['wall',['concrete_wall_006','concrete_wall_003','concrete_wall_002']],['paving',['pavement_02','pavement_01','concrete_floor_02']]]){
 let done=false;
 for(const id of ids){try{const files=await(await response('https://api.polyhaven.com/files/'+id)).json();for(const [channel,key]of [['color','diff'],['normal','nor_gl']]){const item=files[key]?.['1k']?.jpg;if(!item?.url)throw Error('Missing 1k JPG '+key);const bytes=Buffer.from(await(await response(item.url)).arrayBuffer());if(bytes.length<1000||bytes.length>4000000||bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG asset');await fs.writeFile(`realism/assets/${alias}-${channel}.jpg`,bytes);report.textures.push({alias,channel,id,source:item.url,sourcePage:'https://polyhaven.com/a/'+id,license:'CC0-1.0',bytes:bytes.length});}done=true;break;}catch(e){report.failures.push({asset:id,error:String(e.message).slice(0,160)});}}
 if(!done)throw Error('No licensed photograph material for '+alias);
}
await fs.writeFile('realism/acquisition.json',JSON.stringify(report,null,2));
await fs.writeFile('realism/LICENSES.txt','Geometry: © OpenStreetMap contributors, ODbL 1.0. Derived database: world-v2.json. https://www.openstreetmap.org/copyright\nPhoto materials: Poly Haven, CC0 1.0. See acquisition.json for each source. https://polyhaven.com/license\nThese materials are generic surface scans, NOT photos of Jeju streets.\nThree.js r180: MIT; see vendor/THREE-LICENSE.txt.\nNo Naver/Google/Esri satellite or street-view imagery is copied or bundled.\n');
console.log(JSON.stringify(report,null,2));
