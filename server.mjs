import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const INGEST_TOKEN = process.env.INGEST_TOKEN || '';
const DATA_MODE = process.env.DATA_MODE || 'estimated';

const zones = [
  ['indoor-lobby','실내 로비',72,140],
  ['sports-lab','SPORTS LAB',64,120],
  ['ringggo','RINGGGO',36,80],
  ['space-cup','SPACE CUP',44,90],
  ['ticket','티켓존',28,80],
  ['race-start','레이스 출발',66,120],
  ['race-1','RACE 981 코스 1',55,100],
  ['race-2','RACE 981 코스 2',52,100],
  ['race-3','RACE 981 코스 3',47,100],
  ['return','자동회차/리턴',31,90],
  ['outdoor','야외광장',45,140],
  ['parking','주차장',84,180],
  ['viewing','관람존',40,100]
].map(([id,name,base,capacity])=>({id,name,base,capacity}));

let sktAnchor = null;
let history = [];
let last = null;

function timeFactor(){
  const d = new Date();
  const kst = new Date(d.toLocaleString('en-US',{timeZone:'Asia/Seoul'}));
  const h = kst.getHours()+kst.getMinutes()/60;
  const weekday = kst.getDay();
  const weekend = weekday===0 || weekday===6 ? 1.16 : 1;
  const peak = 0.82 + 0.36*Math.exp(-Math.pow((h-13.5)/2.6,2)) + 0.16*Math.exp(-Math.pow((h-16)/1.9,2));
  return weekend*peak;
}

function crowdLabel(r){
  if(r < .45) return ['쾌적','good'];
  if(r < .7) return ['보통','normal'];
  if(r < .9) return ['혼잡','busy'];
  return ['매우 혼잡','very-busy'];
}

function generate(){
  const now = new Date();
  const tf = timeFactor();
  const wobble = 1 + Math.sin(now.getTime()/45000)*0.025 + Math.sin(now.getTime()/110000)*0.018;
  let rawTotal = zones.reduce((s,z)=>s+z.base*tf*wobble,0);
  let target = rawTotal;
  let source = 'ESTIMATED LIVE';
  let localsRatio = .23;
  if(sktAnchor && Date.now()-sktAnchor.receivedAt < 15*60*1000){
    target = sktAnchor.total;
    source = sktAnchor.source || 'JTO_SKT_REALTIME';
    if(sktAnchor.locals != null && sktAnchor.tourists != null && sktAnchor.total>0){
      localsRatio = sktAnchor.locals/sktAnchor.total;
    }
  }
  const scale = target/rawTotal;
  const resultZones = zones.map((z,i)=>{
    const localWobble = 1 + Math.sin(now.getTime()/52000+i*1.7)*0.04;
    const count = Math.max(0, Math.round(z.base*tf*wobble*scale*localWobble));
    const ratio = count/z.capacity;
    const [label,status] = crowdLabel(ratio);
    return {id:z.id,name:z.name,count,capacity:z.capacity,ratio:Number(ratio.toFixed(2)),label,status,waitMinutes:Math.max(0,Math.round((ratio-.35)*32))};
  });
  const total = resultZones.reduce((s,z)=>s+z.count,0);
  const locals = Math.round(total*localsRatio);
  const tourists = total-locals;
  const overall = crowdLabel(total/1200);
  last = {
    parkId:'981', observedAt:now.toISOString(), source, mode:DATA_MODE,
    people:{total,locals,tourists},
    crowd:{label:overall[0],status:overall[1]},
    zones:resultZones
  };
  history.push(last); if(history.length>180) history.shift();
  return last;
}

generate(); setInterval(generate,5000);

const clients = new Set();
setInterval(()=>{
  const payload = `data: ${JSON.stringify(last)}\n\n`;
  for(const res of clients){ try{res.write(payload);}catch{clients.delete(res);} }
},5000);

function sendJson(res,status,obj){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(obj));
}

async function bodyJson(req){
  let body=''; for await(const c of req) body+=c;
  return body ? JSON.parse(body) : {};
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname==='/health') return sendJson(res,200,{ok:true,mode:DATA_MODE,source:last?.source});
  if(url.pathname==='/api/v1/parks/981/live') return sendJson(res,200,last);
  if(url.pathname==='/api/v1/parks/981/history') return sendJson(res,200,history.slice(-60));
  if(url.pathname==='/api/v1/parks/981/forecast'){
    const base=last.people.total;
    const points=Array.from({length:7},(_,i)=>({minutes:i*30,total:Math.round(base*(1 + .12*Math.sin(i*.8) - .035*i)),label:crowdLabel((base*(1 + .12*Math.sin(i*.8) - .035*i))/1200)[0]}));
    return sendJson(res,200,{observedAt:new Date().toISOString(),points});
  }
  if(url.pathname==='/api/v1/parks/981/skt/status') return sendJson(res,200,{connected:!!sktAnchor,anchor:sktAnchor});
  if(url.pathname==='/api/v1/parks/981/stream'){
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});
    res.write(`data: ${JSON.stringify(last)}\n\n`); clients.add(res); req.on('close',()=>clients.delete(res)); return;
  }
  if(url.pathname==='/api/v1/ingest/skt' && req.method==='POST'){
    if(INGEST_TOKEN && req.headers.authorization!==`Bearer ${INGEST_TOKEN}`) return sendJson(res,401,{ok:false,error:'unauthorized'});
    try{
      const b=await bodyJson(req); const p=b.people||{};
      if(!Number.isFinite(Number(p.total))) return sendJson(res,400,{ok:false,error:'people.total required'});
      sktAnchor={source:b.source||'JTO_SKT_REALTIME',observedAt:b.observedAt||new Date().toISOString(),total:Number(p.total),locals:p.locals==null?null:Number(p.locals),tourists:p.tourists==null?null:Number(p.tourists),receivedAt:Date.now()};
      generate(); return sendJson(res,200,{ok:true,anchor:sktAnchor});
    }catch(e){ return sendJson(res,400,{ok:false,error:String(e.message||e)}); }
  }
  let path=url.pathname==='/'?'/index.html':url.pathname;
  try{
    const data=await readFile(join(__dirname,path)); res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'}); res.end(data);
  }catch{ res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT,'0.0.0.0',()=>console.log(`JEJU NOW 9.81 running on ${PORT}`));
