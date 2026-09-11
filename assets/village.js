/* Original 2.5D diorama. No external graphics, tracking or game assets.
   x/y: local design coordinates; z: model height. Not surveyed coordinates. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('parkCanvas'), ctx = canvas.getContext('2d');
if (!ctx) { $('stageError').hidden = false; return; }
const TAU = Math.PI * 2, clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const tint = (hex, f) => { const n=parseInt(hex.slice(1),16); return `rgb(${clamp((n>>16)*f,0,255)|0},${clamp((n>>8&255)*f,0,255)|0},${clamp((n&255)*f,0,255)|0})`; };
let seed=981;
const rand=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
const meta=[
 ['indoor-lobby','실내 로비','indoor',-65,-3,'⌂','주출입구와 이어지는 실내동. 내부 배치는 시연용입니다.'],
 ['sports-lab','SPORTS LAB','indoor',-72,-30,'♧','실내동 안의 활동 공간을 게임풍으로 표현했습니다.'],
 ['ringggo','RINGGGO','indoor',-57,-30,'◎','실내 범퍼카 공간. 위치·면적은 단순화했습니다.'],
 ['space-cup','SPACE CUP','indoor',-57,-17,'☕','같은 실내동 내 카페 공간의 개념 표현입니다.'],
 ['ticket','티켓존','indoor',-72,-17,'▣','입구와 로비를 연결하는 발권 공간입니다.'],
 ['race-start','레이스 출발','outdoor',-36,-34,'⚑','실내동에 인접한 코스 출발부입니다.'],
 ['race-1','코스 1','outdoor',17,-45,'①','경사면 레이스의 개념 구역. 실제 코스 1의 좌표·선형은 미확정입니다.'],
 ['race-2','코스 2','outdoor',49,-12,'②','구불구불한 코스와 녹지의 상대 배치를 표현했습니다. 실제 선형은 미확정입니다.'],
 ['race-3','코스 3','outdoor',77,28,'③','코스 구획과 움직이는 카트는 시연용 연출입니다.'],
 ['return','자동회차','outdoor',26,53,'↗','하단 코스에서 건물로 복귀하는 관계를 표현했습니다.'],
 ['outdoor','야외광장','outdoor',-29,13,'✿','주출입부와 트랙 사이의 열린 공간입니다.'],
 ['parking','주차장','outdoor',-67,45,'P','건물 앞 주차 공간. 차량 수와 빈자리는 연출입니다.'],
 ['viewing','관람 공간','outdoor',-13,-12,'◉','코스 가까이의 휴식 공간. 위치는 개념 배치입니다.']
].map(([id,name,area,x,y,icon,description])=>({id,name,area,x,y,icon,description}));
const byId=Object.fromEntries(meta.map(z=>[z.id,z]));
const colors={good:'#80ad70',normal:'#dec16a',busy:'#dd976d','very-busy':'#cc7777'};
const h=(x,y)=>6.7-(x+100)*.023 + Math.sin(y/80)*.25;
let W=900,H=610,unit=3,dpr=1,angle=-.22,zoom=1,cx=0,cy=3,panX=0,panY=0;
let target={cx:0,cy:3,zoom:1}, roofOpen=false,heatOn=true,moving=true,selected=null,filter='all',view='all';
let worldTime=0,lastFrame=0,lastDraw=0,dirty=true,feed=null,receivedAt=0;
let terrain=[],ground=[],objects=[],hits=[],pinNodes=[];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
moving=!reduced.matches; $('motionToggle').checked=moving;
function project(x,y,z=0){
 const X=x-cx,Y=y-cy,c=Math.cos(angle),s=Math.sin(angle),scale=unit*zoom;
 const rx=X*c-Y*s, ry=X*s+Y*c;
 return {x:W*.50+panX+rx*scale,y:H*.51+panY+(ry*.68-z*.77)*scale,d:ry*.77+z*.68};
}
function face(list,pts,color,zone=null,stroke=null){list.push({pts,color,zone,stroke});}
function box(list,x,y,z,w,d,ht,col,zone=null){
 const p=[[x-w/2,y-d/2,z],[x+w/2,y-d/2,z],[x+w/2,y+d/2,z],[x-w/2,y+d/2,z]];
 const top=p.map(([a,b,c])=>[a,b,c+ht]);
 face(list,top,tint(col,1.05),zone);
 for(let i=0;i<4;i++) face(list,[p[i],p[(i+1)%4],top[(i+1)%4],top[i]],tint(col,[.80,.92,.69,.86][i]),zone);
}
function disk(list,x,y,z,r,col,zone=null,n=16){face(list,Array.from({length:n},(_,i)=>[x+Math.cos(i/n*TAU)*r,y+Math.sin(i/n*TAU)*r,z]),col,zone);}
function polyGround(list,points,col,zone=null){face(list,points.map(([x,y])=>[x,y,h(x,y)+.09]),col,zone);}
function roof(list,x,y,z,w,d,rise,col,zone){
 const a=[x-w/2,y-d/2,z],b=[x+w/2,y-d/2,z],c=[x+w/2,y+d/2,z],d0=[x-w/2,y+d/2,z];
 const e=[x-w*.30,y,z+rise],f=[x+w*.30,y,z+rise];
 face(list,[a,b,f,e],tint(col,1.12),zone);face(list,[b,c,f],tint(col,.85),zone);
 face(list,[c,d0,e,f],tint(col,.78),zone);face(list,[d0,a,e],col,zone);
 for(let i=1;i<8;i++){
  const t=i/8, x1=x-w/2+w*t, x2=x-w*.30+w*.6*t;
  face(list,[[x1,y-d/2,z+.04],[x2,y,z+rise+.04],[x2+.23,y,z+rise+.04],[x1+.23,y-d/2,z+.04]],tint(col,.86));
  face(list,[[x1,y+d/2,z+.04],[x2,y,z+rise+.04],[x2+.23,y,z+rise+.04],[x1+.23,y+d/2,z+.04]],tint(col,.67));
 }
}
function tree(list,x,y,size=1){
 const z=h(x,y);disk(ground,x+1,y+1,z+.08,2.9*size,'#7a9e6260');
 box(list,x,y,z,1*size,1*size,5*size,'#98704a');
 const rings=[{z:2.7,r:2.3},{z:4.9,r:3.5},{z:7.6,r:2.8},{z:9.3,r:0}];
 const base=['#7ba56b','#92b975','#8db272','#9fc483'][Math.floor(rand()*4)];
 for(let j=0;j<3;j++)for(let i=0;i<8;i++){
  const a=i/8*TAU,b=(i+1)/8*TAU,R=rings[j],S=rings[j+1];
  face(list,[[x+Math.cos(a)*R.r*size,y+Math.sin(a)*R.r*size,z+R.z*size],[x+Math.cos(b)*R.r*size,y+Math.sin(b)*R.r*size,z+R.z*size],[x+Math.cos(b)*S.r*size,y+Math.sin(b)*S.r*size,z+S.z*size],[x+Math.cos(a)*S.r*size,y+Math.sin(a)*S.r*size,z+S.z*size]],tint(base,.84+Math.cos(a)*.14+j*.04));
 }
}
function spline(points,steps=14){const out=[];for(let i=0;i<points.length-1;i++){
 const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
 for(let j=0;j<steps;j++){let t=j/steps;out.push([0,1].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)));}}
 out.push(points.at(-1));return out;}
function ribbon(list,points,width,color,lift=0,zone=null){
 const sides=points.map(([x,y],i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  const len=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
  const nx=-(b[1]-a[1])/len*width/2,ny=(b[0]-a[0])/len*width/2;
  return [[x+nx,y+ny,h(x+nx,y+ny)+lift],[x-nx,y-ny,h(x-nx,y-ny)+lift]];
 });
 for(let i=0;i<sides.length-1;i++)face(list,[sides[i][0],sides[i+1][0],sides[i+1][1],sides[i][1]],color,zone);
}
const path=spline([[-44,-40],[-21,-47],[10,-49],[31,-43],[48,-47],[80,-48],[92,-34],[79,-25],[53,-28],[22,-30],[5,-23],[18,-14],[49,-13],[77,-6],[86,5],[75,15],[46,12],[23,4],[6,7],[14,23],[44,31],[72,29],[88,35],[88,45],[72,48]]);
const returnPath=spline([[72,48],[52,55],[19,57],[-9,48],[-32,36],[-45,22],[-45,-3],[-44,-25],[-44,-40]]);
const walks=spline([[-74,48],[-81,26],[-82,4],[-66,3],[-43,4],[-28,14],[-18,7],[-13,-8]]);
function buildWorld(){
 terrain=[];ground=[];objects=[];
 const outline=[[-113,-68],[93,-68],[110,-50],[110,52],[86,69],[-96,69],[-114,46]];
 for(let i=0;i<outline.length;i++){
  const a=outline[i],b=outline[(i+1)%outline.length];
  face(terrain,[[...a,-5],[...b,-5],[...b,h(...b)],[...a,h(...a)]],['#a2a982','#939c7a','#b9b58c','#c9c39a'][i%4]);
 }
 polyGround(terrain,outline,'#bbcd95');
 // Small shaded meadow tiles: original textures produced mathematically.
 for(let x=-105;x<98;x+=8)for(let y=-61;y<59;y+=8){
  const col=['#bdce98','#becf99','#baca94','#c1d09a','#b9cd94'][Math.floor(rand()*5)];
  polyGround(ground,[[x,y],[x+8,y],[x+8,y+8],[x,y+8]],col);
 }
 // Access road and parking occupy the entry side, adjacent to the main building.
 ribbon(ground,spline([[-114,57],[-93,57],[-94,23],[-94,-10],[-98,-59]]),7,'#b6b6a0',.12);
 ribbon(ground,spline([[-114,57],[-93,57],[-94,23],[-94,-10],[-98,-59]]),.25,'#e5dfbc',.17);
 polyGround(ground,[[-88,22],[-43,22],[-42,63],[-87,63]],'#d3cbb0','parking');
 polyGround(ground,[[-85,25],[-47,25],[-47,59],[-85,59]],'#b1b3a6','parking');
 for(let row=0;row<3;row++)for(let i=0;i<8;i++){
  let x=-83+i*4.4,y=29+row*12;
  ribbon(ground,[[x,y-3.5],[x,y+3.5]],.28,'#f2e8c9',.22);
  if(rand()>.27)car(objects,x+2,y,h(x+2,y)+.28,0,1,['#e3cfab','#b8cdd0','#91afa8','#dbaaa0','#e9d890'][Math.floor(rand()*5)]);
 }
 ribbon(ground,walks,4.2,'#e8dab9',.32);
 polyGround(ground,[[-43,0],[-17,0],[-14,21],[-42,22]],'#e5d8b5','outdoor');
 for(let i=0;i<12;i++)box(objects,-42+i*2.2,21,h(-42,21),1.65,1.2,1,'#bbb493');
 // Wide downhill race ribbon: three painted lanes and a separate return route.
 ribbon(ground,path,12.0,'#eee5ce',.32);
 ribbon(ground,path,10.4,'#ae8e80',.38);
 ribbon(ground,path,8.4,'#b29a86',.40,'race-2');
 for(let offset of [-1.6,1.6]){
  let lane=path.map(([x,y],i)=>{let [a,b]=path[Math.min(i+1,path.length-1)], [c,d]=path[Math.max(0,i-1)],l=Math.hypot(a-c,b-d)||1;return [x-(b-d)/l*offset,y+(a-c)/l*offset]});
  ribbon(ground,lane,.21,'#ead5bb',.48);
 }
 ribbon(ground,returnPath,4.4,'#eee5cc',.34);ribbon(ground,returnPath,3.4,'#a5aaa0',.42,'return');
 for(let i=0;i<path.length;i+=14){let [x,y]=path[i],a=path[Math.min(i+1,path.length-1)],dx=a[0]-x,dy=a[1]-y,l=Math.hypot(dx,dy)||1;
  for(let side of [-1,1]){let px=x-dy/l*5.4*side,py=y+dx/l*5.4*side;box(objects,px,py,h(px,py)+.4,.55,.55,1.3,'#eee3bc');}}
 for(let n=0;n<7;n++)for(let k=0;k<2;k++) polyGround(ground,[[-47+n*1.5,-40+k*1.6],[-45.5+n*1.5,-40+k*1.6],[-45.5+n*1.5,-38.4+k*1.6],[-47+n*1.5,-38.4+k*1.6]],(n+k)%2?'#ece4cc':'#6f7d70','race-start');
 mainBuilding(objects);
 // Deck, sunshades, benches and welcoming entrance gate.
 box(objects,-13,-8,h(-13,-8),13,9,1.2,'#bb9871','viewing');
 for(let i=0;i<3;i++){let x=-17+i*4;box(objects,x,-8,h(x,-8)+1.2,.5,.5,5.5,'#b1966d');roof(objects,x,-8,h(x,-8)+6.7,5,5,2.2,['#d8b784','#96b7a5','#dcb199'][i]);}
 for(const [x,y]of[[-34,15],[-21,17]]){box(objects,x,y,h(x,y),5,1.8,1.5,'#a58a60');box(objects,x,y+1,h(x,y)+1.2,5,.4,1.5,'#b89a6a');}
 for(let x=-88;x<=-46;x+=6){if(x<-76||x>-62)box(objects,x,19,h(x,19),5,1.4,1.4,'#a6a794');}
 for(const x of [-88,-79])box(objects,x,14,h(x,14),1.8,1.8,7,'#a2a18a');
 box(objects,-83.5,14,h(-83.5,14)+6.5,12,2.2,2.2,'#d6b988');
 // Perimeter grove; deliberately no trees in courses, car parks or buildings.
 for(let i=0;i<42;i++){
  const side=i%4;let x,y;
  if(side===0){x=-103+i*4.6;y=-62+rand()*3;}
  if(side===1){x=102+rand()*3;y=-50+rand()*103;}
  if(side===2){x=-97+rand()*188;y=63+rand()*3;}
  if(side===3){x=-107+rand()*3;y=-56+rand()*110;}
  tree(objects,x,y,.6+rand()*.55);
 }
 for(const [x,y]of[[-91,2],[-91,-33],[-34,22],[-25,27],[-28,3],[-39,4],[-33,-12],[-10,24],[0,42],[9,44],[31,45],[100,0],[-59,63]])tree(objects,x,y,.7+rand()*.3);
 for(let i=0;i<38;i++){
  const x=-100+rand()*196,y=i%2?-59:61;
  box(objects,x,y,h(x,y),1+rand()*1.4,1.2,.6+rand()*.8,'#a7ad92');
 }
 dirty=true;
}
function mainBuilding(list){
 const z=h(-67,-18);
 box(list,-67,-18,z,36,47,1.3,'#d7c6a3','indoor-lobby');
 // The indoor attractions remain within this single building footprint.
 const rooms=[['sports-lab',-74,-31,16,15,'#b7cbb9'],['ringggo',-57,-31,15,15,'#ceb7cd'],['ticket',-74,-16,16,12,'#e2cba4'],['space-cup',-57,-16,15,12,'#c6d4b3'],['indoor-lobby',-67,-3,32,11,'#e6d6bc']];
 for(const [id,x,y,w,d,c]of rooms){
  box(list,x,y,z+1.3,w,d,.3,c,id);
  box(list,x-w/2,y,z+1.7,.7,d,roofOpen?2.8:8,'#eee1be',id);
  box(list,x,y-d/2,z+1.7,w,.7,roofOpen?2.8:8,'#eee1be',id);
 }
 box(list,-49,-18,z+1.4,.8,46,roofOpen?2.8:8,'#d3bc97','space-cup');
 box(list,-67,5,z+1.4,35,1,roofOpen?2.8:7,'#dec8a3','indoor-lobby');
 for(let x=-80;x<-49;x+=5){
  box(list,x,5.65,z+3.5,3.3,.2,3.3,'#9bbfc0','indoor-lobby');
 }
 // Wooden canopy and stairs towards the entry/parking side.
 for(let i=0;i<4;i++)box(list,-67,7.5+i*1.0,h(-67,7),12,1.1,1.7-i*.4,'#d2c4a6','indoor-lobby');
 box(list,-67,7.2,z+7.7,22,6,.6,'#b79569','indoor-lobby');
 for(let x of [-77,-57])box(list,x,9,z, .6,.6,7.8,'#9f8059');
 // Indoor furniture helps the cutaway read as rooms rather than coloured boxes.
 for(let i=0;i<3;i++){
  box(list,-79+i*5,-32,z+1.8,3,1.5,3.3,'#829a9c','sports-lab');
  box(list,-79+i*5,-30.9,z+2.8,2.3,.1,1.4,'#d5e6d3','sports-lab');
  box(list,-61+i*4,-17,z+1.8,2.4,2.4,1.8,'#c8a175','space-cup');
  disk(list,-61+i*4,-17,z+3.6,1.9,'#e9d8b4','space-cup');
 }
 for(let i=0;i<4;i++){let x=-62+(i%2)*8,y=-35+Math.floor(i/2)*7;car(list,x,y,z+1.8,0,.75,i%2?'#daa39d':'#96b9ba');}
 box(list,-74,-16,z+1.8,10,2.5,2.2,'#cba477','ticket');
 if(!roofOpen){
  roof(list,-67,-27,z+9.5,38,30,4.8,'#88a29a','indoor-lobby');
  roof(list,-67,-4,z+8.6,38,18,3.0,'#c99672','indoor-lobby');
  box(list,-72,-28,z+10,2.4,2.4,6.2,'#e2d6b7');
  box(list,-72,-28,z+16,3.2,3.2,.8,'#ba9972');
 }
}
function car(list,x,y,z,heading=0,size=1,col='#dba37b'){
 const local=[];box(local,0,0,0,2.1*size,4*size,1.0*size,col);
 box(local,0,-.3,.9*size,1.8*size,2.1*size,.9*size,'#b8d1ce');
 box(local,0,-.3,1.8*size,1.9*size,2.2*size,.4*size,col);
 for(const a of [-1.08,1.08])for(const b of [-1.2,1.2])box(local,a*size,b*size,.15*size,.35*size,.8*size,.75*size,'#647365');
 const c=Math.cos(heading),s=Math.sin(heading);
 for(const f of local)face(list,f.pts.map(([a,b,d])=>[x+a*c-b*s,y+a*s+b*c,z+d]),f.color);
}
function drawFaces(list,record=false,sort=true){
 const faces=list.map(f=>{const p=f.pts.map(v=>project(...v));return {...f,p,depth:p.reduce((s,v)=>s+v.d,0)/p.length};});if(sort)faces.sort((a,b)=>a.depth-b.depth);
 for(const f of faces){ctx.beginPath();f.p.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=f.color;ctx.fill();
  if(f.stroke){ctx.strokeStyle=f.stroke;ctx.lineWidth=.5;ctx.stroke();}
  if(record&&f.zone)hits.push({p:f.p,id:f.zone});
 }
}
function drawPerson(x,y,z,phase,color){
 const p=project(x,y,z),s=unit*zoom*.63,bob=Math.sin(phase)*.15;
 ctx.save();ctx.translate(p.x,p.y);ctx.scale(s,s);
 ctx.fillStyle='#50634728';ctx.beginPath();ctx.ellipse(0,0,1.7,.75,0,0,TAU);ctx.fill();
 ctx.strokeStyle='#786c56';ctx.lineWidth=.75;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-.5,-1.5);ctx.lineTo(-.7+Math.sin(phase)*.28,-.25);ctx.moveTo(.5,-1.5);ctx.lineTo(.7-Math.sin(phase)*.28,-.25);ctx.stroke();
 ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-1.2,-4.1+bob,2.4,2.9,1);ctx.fill();
 ctx.fillStyle='#f3d4ad';ctx.beginPath();ctx.ellipse(0,-5.4+bob,1.6,1.65,0,0,TAU);ctx.fill();
 ctx.fillStyle='#785d48';ctx.beginPath();ctx.ellipse(0,-6.2+bob,1.7,1.1,-.12,Math.PI,TAU);ctx.lineTo(1.6,-5.8+bob);ctx.lineTo(-1.7,-5.9+bob);ctx.fill();
 ctx.fillStyle='#635341';ctx.fillRect(-.65,-5.4+bob,.25,.35);ctx.fillRect(.45,-5.4+bob,.25,.35);ctx.restore();
}
function routePoint(route,t){let pos=((t%1)+1)%1*(route.length-1),i=Math.floor(pos),a=route[i],b=route[Math.min(i+1,route.length-1)],u=pos-i;return {x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u,heading:Math.atan2(b[1]-a[1],b[0]-a[0])-Math.PI/2};}
function draw(){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
 const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#e9efdc');bg.addColorStop(1,'#e1e9d1');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 // Soft paper shadow under the floating diorama.
 let c=project(0,0,-7);ctx.save();ctx.translate(c.x,c.y+15);ctx.scale(1,.38);let grad=ctx.createRadialGradient(0,0,unit*zoom*30,0,0,unit*zoom*135);grad.addColorStop(0,'#6c846335');grad.addColorStop(1,'#6c846300');ctx.fillStyle=grad;ctx.fillRect(-W,-H,W*2,H*2);ctx.restore();
 hits=[];drawFaces(terrain);drawFaces(ground,true,false);
 const dynamic=[];
 if(heatOn&&feed)for(const m of meta){
  if(m.area==='indoor'&&!roofOpen)continue;
  const z=feed.zones.find(z=>z.id===m.id);if(!z)continue;
  disk(dynamic,m.x,m.y,h(m.x,m.y)+(m.area==='indoor'?2.05:.72),m.area==='indoor'?4:5.1,(colors[z.status]||colors.normal)+'88',m.id);
 }
 drawFaces(dynamic,true);
 const carts=[];
 for(let i=0;i<7;i++){let p=routePoint(path,worldTime*.009+i/7);car(carts,p.x,p.y,h(p.x,p.y)+.56,p.heading,.72,['#e5c26e','#9cb7cc','#d79381'][i%3]);}
 for(let i=0;i<2;i++){let p=routePoint(returnPath,worldTime*.011+i/2);car(carts,p.x,p.y,h(p.x,p.y)+.5,p.heading,.65,'#abc19a');}
 drawFaces([...objects,...carts],true);
 for(let i=0;i<15;i++){
  let p=routePoint(walks,worldTime*.009+i/15);drawPerson(p.x+(i%3-1)*1.6,p.y,h(p.x,p.y)+.4,worldTime*5+i,['#c9927d','#7d9eac','#d6ba73','#9da772'][i%4]);
 }
 if(roofOpen)for(let i=0;i<5;i++){const m=meta[i];drawPerson(m.x+2,m.y+2,h(m.x,m.y)+2,worldTime*4+i,'#9a91b3');}
 // Orange selection ring, drawn without implying geographic precision.
 if(selected){const m=byId[selected],p=project(m.x,m.y,h(m.x,m.y)+.8);ctx.strokeStyle='#bd933e';ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.ellipse(p.x,p.y,7*unit*zoom,4*unit*zoom,angle,0,TAU);ctx.stroke();ctx.setLineDash([]);}
 for(const {m,el} of pinNodes){
  const visible=m.area!=='indoor'||roofOpen||m.id==='indoor-lobby';
  const z=m.area==='indoor'?h(m.x,m.y)+(roofOpen?6:20):h(m.x,m.y)+3.5;
  const p=project(m.x,m.y,z);el.style.left=p.x+'px';el.style.top=p.y+'px';el.classList.toggle('hidden',!visible||p.x<8||p.x>W-8||p.y<20||p.y>H-40);
  el.style.zIndex=String(100+Math.round(p.d));
 }
 window.__PARK_VIEW__={version:'village-2.1.0',angle,zoom,roofOpen,selected,view,faces:objects.length,rendered:true};
 dirty=false;
}
function loop(ts){
 const dt=lastFrame?Math.min((ts-lastFrame)/1000,.05):0;lastFrame=ts;
 if(moving&&!document.hidden)worldTime+=dt;
 let tween=Math.abs(target.zoom-zoom)+Math.abs(target.cx-cx)+Math.abs(target.cy-cy)>.02;
 if(tween){let k=reduced.matches?1:Math.min(1,dt*7);zoom+=(target.zoom-zoom)*k;cx+=(target.cx-cx)*k;cy+=(target.cy-cy)*k;dirty=true;}
 if(!document.hidden&&(dirty||moving)&&ts-lastDraw>(W<650?65:40)){draw();lastDraw=ts;}
 requestAnimationFrame(loop);
}
function resize(){const r=$('stage').getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);unit=Math.min(W/248,H/165);dirty=true;}
function setView(v){view=v;panX=panY=0;const opts={all:{cx:0,cy:3,zoom:1},indoor:{cx:-64,cy:-17,zoom:2.3},race:{cx:39,cy:-1,zoom:1.4},parking:{cx:-65,cy:41,zoom:2.0}};target={...opts[v]};
 if(v==='indoor'&&!roofOpen)toggleRoof(true);
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.setAttribute('aria-pressed',String(b.dataset.view===v));});dirty=true;
}
function toggleRoof(value){roofOpen=value??!roofOpen;$('roofButton').textContent=roofOpen?'⌂ 지붕 닫기':'⌂ 지붕 열기';$('roofButton').setAttribute('aria-pressed',String(roofOpen));seed=981;buildWorld();}
function select(id){selected=id;const m=byId[id];$('selectedName').textContent=m.name;$('selectedArea').textContent=m.area==='indoor'?'실내동':'실외';$('areaIcon').textContent=m.icon;$('selectedDescription').textContent=m.description;
 if(m.area==='indoor'&&!roofOpen)toggleRoof(true);
 pinNodes.forEach(p=>p.el.classList.toggle('selected',p.m.id===id));updateDetails();renderList();dirty=true;}
function count(v){return Number.isFinite(v)?v.toLocaleString('ko-KR'):'—';}
function updateDetails(){const z=feed?.zones.find(z=>z.id===selected);$('selectedCount').textContent=z?count(z.count)+'명':feed?count(feed.people.total)+'명':'—';$('selectedStatus').textContent=z?.label||feed?.crowd?.label||'—';
 $('detailNote').textContent=selected==='parking'?'여기 표시된 숫자는 주차 구역의 가상 인원입니다. 실제 차량 대수·빈 주차면수와 다릅니다.':feed?.mode==='estimated'?'시연을 위한 가상 인원과 혼잡색입니다. 실제 현장 인원·대기시간으로 사용하지 마세요.':'구역별 인원은 모델 배분값입니다. 현장 센서로 검증되지 않았습니다.';
}
function renderList(){const list=$('zoneList');const scroll=list.scrollTop;list.replaceChildren();for(const m of meta){if(filter!=='all'&&m.area!==filter)continue;const z=feed?.zones.find(z=>z.id===m.id),btn=document.createElement('button');btn.className='zoneRow'+(selected===m.id?' active':'');btn.dataset.zone=m.id;btn.setAttribute('aria-pressed',String(selected===m.id));
 const icon=document.createElement('span');icon.className='zoneSymbol';icon.textContent=m.icon;
 const copy=document.createElement('span');copy.className='zoneCopy';const name=document.createElement('b');name.textContent=m.name;const sub=document.createElement('span');sub.textContent=m.area==='indoor'?'실내동 · 개념 배치':'실외 · 상대 배치';copy.append(name,sub);
 const num=document.createElement('span');num.className='zoneNumber';num.textContent=z?count(z.count)+'명':'—';const small=document.createElement('small');small.textContent=z?.label||'수신 대기';num.append(small);btn.append(icon,copy,num);btn.onclick=()=>select(m.id);list.append(btn);
 }list.scrollTop=scroll;}
function apply(data){
 if(!data||!data.people||!Array.isArray(data.zones)||!Number.isFinite(data.people.total))return;
 const stamp=Date.parse(data.observedAt);if(!Number.isFinite(stamp))return;if(feed&&stamp<Date.parse(feed.observedAt))return;feed=data;receivedAt=Date.now();$('total').textContent=count(data.people.total)+'명';$('locals').textContent=count(data.people.locals);$('tourists').textContent=count(data.people.tourists);
 const sim=data.mode==='estimated'||data.source==='ESTIMATED LIVE';
 $('dataBadge').textContent=sim?'시뮬레이션':'외부 집계 기반 · 미검증';$('noticeText').textContent=sim?'SKT 미연결 · 표시 인원과 캐릭터는 실제 현장 관측이 아닙니다.':'총인원은 외부 집계 기준, 구역별 인원·캐릭터는 모델 연출입니다.';
 const em=document.querySelectorAll('.overview em');em[0].textContent=sim?'가상 인원':'외부 집계';em[1].textContent=em[2].textContent=sim?'가정값':'출처 확인 필요';
 $('detailCountLabel').textContent=sim?'시뮬레이션 인원':'미검증 배분 인원';
 const t=new Date(data.observedAt);$('updated').textContent=Number.isNaN(t.getTime())?'계산시각 확인 불가':'서버 계산 '+t.toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
 $('connectionLabel').textContent=sim?'서버 연결 · SKT 미연결':'서버 연결 · 외부 집계 수신';$('connectionDetail').textContent=sim?'5초 간격 서버 시뮬레이션을 수신합니다. 정확도는 검증되지 않았습니다.':'표시 모드: '+data.mode+'. 구역별 정확도는 별도 검증이 필요합니다.';$('connectionLabel').closest('.sourceCard').classList.remove('offline');$('dataNotice').classList.remove('disconnected');
 for(const {m,el}of pinNodes){const z=data.zones.find(z=>z.id===m.id);el.querySelector('.pinValue').textContent=z?count(z.count)+'명':'';el.style.setProperty('--heat',heatOn?(colors[z?.status]||colors.good):'#9aaa7f');}
 updateDetails();renderList();dirty=true;
}
for(const m of meta){const el=document.createElement('button');el.className='pin';el.dataset.pin=m.id;el.setAttribute('aria-label',m.name+' 선택');const dot=document.createElement('i');dot.className='dot';const label=document.createElement('span');label.textContent=m.id==='indoor-lobby'?'실내동 · 로비':m.name;const value=document.createElement('span');value.className='pinValue';el.append(dot,label,value);el.onclick=()=>select(m.id);$('pins').append(el);pinNodes.push({m,el});}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(c=>c.classList.toggle('active',c===b));renderList();});
$('roofButton').onclick=()=>toggleRoof();$('rotateLeft').onclick=()=>{angle-=Math.PI/8;dirty=true;};$('rotateRight').onclick=()=>{angle+=Math.PI/8;dirty=true;};
const changeZoom=k=>{target.zoom=clamp(target.zoom*k,.65,3.8);dirty=true;};$('zoomIn').onclick=()=>changeZoom(1.2);$('zoomOut').onclick=()=>changeZoom(1/1.2);
$('reset').onclick=()=>{angle=-.22;selected=null;toggleRoof(false);setView('all');$('selectedName').textContent='어디부터 가볼까요?';$('selectedDescription').textContent='지도 위 표지판이나 아래 구역을 선택하세요.';$('selectedArea').textContent='전체 파크';$('areaIcon').textContent='✿';pinNodes.forEach(p=>p.el.classList.remove('selected'));updateDetails();renderList();};
$('heatToggle').onchange=e=>{heatOn=e.target.checked;for(const {m,el}of pinNodes){const z=feed?.zones.find(z=>z.id===m.id);el.style.setProperty('--heat',heatOn?(colors[z?.status]||colors.good):'#9aaa7f');}dirty=true;};$('motionToggle').onchange=e=>{moving=e.target.checked;dirty=true;};
$('aboutOpen').onclick=()=>$('about').showModal();$('aboutClose').onclick=()=>$('about').close();$('about').onclick=e=>{if(e.target===$('about')){let r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}};
let pointers=new Map(),drag=null,pinch=0;
canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,moved:false};if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);drag.moved=true;}};
canvas.onpointermove=e=>{if(!pointers.has(e.pointerId)||!drag)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===2){let p=[...pointers.values()],dist=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);if(pinch>0)changeZoom(dist/pinch);pinch=dist;drag.moved=true;}
 else{let dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;if(drag.button===2||e.shiftKey){panX+=dx;panY+=dy;}else angle+=dx*.006;drag.x=e.clientX;drag.y=e.clientY;dirty=true;}};
function inside(p,pts){let b=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){let a=pts[i],c=pts[j];if(((a.y>p.y)!==(c.y>p.y))&&(p.x<(c.x-a.x)*(p.y-a.y)/(c.y-a.y)+a.x))b=!b;}return b;}
canvas.onpointerup=e=>{pointers.delete(e.pointerId);if(drag&&!drag.moved){const r=canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top};for(let i=hits.length-1;i>=0;i--)if(inside(p,hits[i].p)){select(hits[i].id);break;}}
 if(pointers.size){const p=[...pointers.values()][0];drag={...drag,x:p.x,y:p.y,moved:true};}else drag=null;pinch=0;};canvas.onpointercancel=e=>{pointers.delete(e.pointerId);drag=null;};
canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(Math.exp(-e.deltaY*.001));},{passive:false});
canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight','+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')$('rotateLeft').click();if(e.key==='ArrowRight')$('rotateRight').click();if(e.key==='+'||e.key==='=')changeZoom(1.2);if(e.key==='-')changeZoom(1/1.2);if(e.key==='0')$('reset').click();}};
new ResizeObserver(resize).observe($('stage'));
async function fetchLive(){try{const r=await fetch('/api/v1/parks/981/live',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('HTTP '+r.status);apply(await r.json());}catch{if(!receivedAt){$('connectionLabel').textContent='서버 데이터 수신 대기';$('connectionDetail').textContent='지도는 탐색할 수 있습니다. 실제 데이터가 없으므로 숫자를 만들지 않습니다.';}}}
async function fetchOutlook(){
 try{
  const r=await fetch('/api/v1/parks/981/forecast',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('forecast unavailable');const d=await r.json();
  if(!Array.isArray(d.points))return;const pts=d.points.filter(p=>Number.isFinite(p.total)&&p.total>=0&&Number.isFinite(p.minutes)).slice(0,7);
  if(!pts.length)return;const max=Math.max(1,...pts.map(p=>p.total));const row=$('outlook');row.replaceChildren();
  for(const p of pts){const cell=document.createElement('div'),bar=document.createElement('i'),label=document.createElement('span');
   bar.style.height=Math.max(8,p.total/max*44)+'px';label.textContent=p.minutes?'+'+p.minutes+'분':'지금';
   cell.title=count(p.total)+'명 · 미검증 모형';cell.append(bar,label);row.append(cell);}
 }catch{$('outlook').textContent='시간대 모형 수신 대기';}
}
fetchOutlook();setInterval(fetchOutlook,60000);
let stream=null;if('EventSource'in window){stream=new EventSource('/api/v1/parks/981/stream');stream.onmessage=e=>{try{apply(JSON.parse(e.data));}catch{}};}
setInterval(()=>{if(!receivedAt||Date.now()-receivedAt>20000){$('connectionLabel').textContent='데이터 연결 지연';$('connectionDetail').textContent='표시된 숫자는 마지막 수신값입니다. 새 데이터 연결을 기다리고 있습니다.';$('connectionLabel').closest('.sourceCard').classList.add('offline');$('dataNotice').classList.add('disconnected');$('dataBadge').textContent='수신 지연';$('noticeText').textContent='마지막 수신값입니다. 현재 현장 정보로 사용하지 마세요.';fetchLive();}},10000);
window.addEventListener('pagehide',()=>stream?.close());window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
buildWorld();resize();renderList();requestAnimationFrame(loop);fetchLive();
})();
