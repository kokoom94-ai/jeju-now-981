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
let map;
try{map=JSON.parse(await fs.readFile('realism/world-v2.json','utf8'));if(map.mode!=='osm')throw Error();console.log('Using existing OSM snapshot',map.capturedAt);}catch{
 const elements=[],box='33.468,126.462,33.536,126.575';
 const queries=[`[out:json][timeout:100];(way[highway](${box});way[natural=coastline](33.455,126.445,33.55,126.595);way[natural=water](${box});way[leisure=park](${box});way[aeroway](${box});node[natural=tree](${box});node[highway=crossing](${box}););out geom;`,`[out:json][timeout:100];way[building](${box});out geom;`];
 for(let i=0;i<queries.length;i++){
  let data,last;
  for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
   try{console.log('Requesting geometry part',i+1);data=await(await response(endpoint,125000,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:queries[i]})})).json();if(data.remark||!Array.isArray(data.elements))throw Error(data.remark||'Invalid Overpass response');break;}catch(e){last=e;data=null;console.log(e.message);}
  }
  if(!data?.elements)throw last||Error('No geometry');elements.push(...data.elements);
 }
 map=JejuOSM.convertOverpass({elements},{fallbackCoast:seed.map.coast});
 const lookup=new Map(elements.filter(e=>e.type==='way').map(e=>[e.id,e.tags||{}]));
 for(const b of map.buildings){const t=lookup.get(Number(b.id.replace('osm-way-','')))||{};b.name=t['name:ko']||t.name||'';b.wallColor=t['building:colour']||null;b.roofColor=t['roof:colour']||null;b.roofShape=t['roof:shape']||null;b.material=t['building:material']||null;}
 for(const r of map.roads){const t=lookup.get(Number(r.id.match(/(?:osm-way-|osm-airway-)(\d+)/)?.[1]))||{};r.highway=t.highway||t.aeroway||'';r.surface=t.surface||null;r.bridge=t.bridge==='yes';r.tunnel=t.tunnel==='yes';r.sidewalk=t.sidewalk||null;}
 map.points=elements.filter(e=>e.type==='node'&&JejuCore.validGeo(e.lon,e.lat)).map(e=>({id:e.id,lon:e.lon,lat:e.lat,kind:e.tags?.natural==='tree'?'tree':'crossing'}));
 map.realismNotice='도로·건물 윤곽은 OSM 원본. 재질·창문·수목 크기·조명은 시각화이며 실제 외관 촬영이나 측량이 아닙니다. 지형고도·보행안전·장소 출입구 미검증.';
 await fs.writeFile('realism/world-v2.json',JSON.stringify(map));
}
report.geometry={roads:map.roads.length,buildings:map.buildings.length,coastSource:map.coastSource,coastPoints:map.coast.length,points:map.points.length,walkable:map.roads.filter(r=>r.walkable).length,heightExplicit:map.buildings.filter(b=>b.heightSource==='OSM height').length,heightFromLevels:map.buildings.filter(b=>b.heightSource==='OSM levels x assumed 3m').length,heightAssumed:map.buildings.filter(b=>b.heightSource==='Assumed 9m').length,bounds:map.bounds};
for(const name of ['three.module.js','three.core.js','Sky.js','BufferGeometryUtils.js','THREE-LICENSE.txt']){
 const path=name==='Sky.js'?'examples/jsm/objects/Sky.js':name==='BufferGeometryUtils.js'?'examples/jsm/utils/BufferGeometryUtils.js':name==='THREE-LICENSE.txt'?'LICENSE':'build/'+name;
 const bytes=Buffer.from(await(await response('https://cdn.jsdelivr.net/npm/three@0.180.0/'+path)).arrayBuffer());await fs.writeFile('realism/vendor/'+name,bytes);
}
for(const [alias,id]of [['road','asphalt_01'],['wall','concrete_wall_006'],['paving','pavement_02']]){
 try{
  const files=await(await response('https://api.polyhaven.com/files/'+id)).json();console.log('Material response',id,JSON.stringify(files).slice(0,1800));
  for(const [channel,keys]of [['color',['diff','Diffuse','diffuse']],['normal',['nor_gl','normal']]]){
   let item,format;
   for(const key of keys){const set=files[key]?.['1k']||files[key]?.['1K'];if(set){format=set.jpg?'jpg':set.png?'png':null;item=set[format];if(item?.url)break;}}
   if(!item?.url)throw Error('No color/normal image found for '+channel);
   const bytes=Buffer.from(await(await response(item.url)).arrayBuffer());if(bytes.length<1000||bytes.length>6000000)throw Error('Invalid image size');
   const file=`${alias}-${channel}.${format}`;await fs.writeFile('realism/assets/'+file,bytes);report.textures.push({alias,channel,file,id,source:item.url,sourcePage:'https://polyhaven.com/a/'+id,license:'CC0-1.0',bytes:bytes.length});
  }
 }catch(e){const error={asset:id,error:String(e.message).slice(0,220)};report.failures.push(error);console.error(JSON.stringify(error));}
}
report.materialsComplete=report.textures.length===6;
await fs.writeFile('realism/acquisition.json',JSON.stringify(report,null,2));
await fs.writeFile('realism/LICENSES.txt','Geometry: © OpenStreetMap contributors, ODbL 1.0. Derived database: world-v2.json. https://www.openstreetmap.org/copyright\nPhoto materials when present: Poly Haven, CC0 1.0. acquisition.json records successful files and failures. https://polyhaven.com/license\nSurface scans are generic, NOT photographs of Jeju streets.\nThree.js r180: MIT; vendor/THREE-LICENSE.txt.\nNo Naver/Google/Esri satellite or street-view imagery is copied or bundled.\n');
console.log(JSON.stringify(report,null,2));
