// Official VWorld WebGL 3.0 adapter. No built-in key, invented heights or meshes.
// Primary reference: https://github.com/V-world/V-world_API_sample
export const BOUNDS = Object.freeze([126.462,33.468,126.575,33.536]);
export const CAMERAS = Object.freeze({
  oldtown:{name:'원도심',lon:126.525,lat:33.508,height:1600},
  airport:{name:'공항 일대',lon:126.491,lat:33.500,height:1500},
  gwandeok:{name:'관덕정',lon:126.52155,lat:33.51325,height:350},
  dongmun:{name:'동문시장',lon:126.527,lat:33.512,height:450},
  yongdam:{name:'용담동',lon:126.512,lat:33.516,height:700},
  geonip:{name:'건입동',lon:126.537,lat:33.515,height:800},
  ido:{name:'이도동',lon:126.532,lat:33.500,height:1100}
});
export function validateKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9-]{20,128}$/.test(key)) throw new Error('본인 서비스용 브이월드 JavaScript 인증키를 입력하세요. 키의 유효성은 제공기관이 판단합니다.');
  return key;
}
export function sdkURL(value) {
  const u=new URL('https://map.vworld.kr/js/webglMapInit.js.do');
  u.searchParams.set('version','3.0');u.searchParams.set('apiKey',validateKey(value));return u.href;
}
export function cleanPlace(p) {
  if (!p || typeof p.id!=='string' || typeof p.name!=='string' || !Number.isFinite(p.lon) || !Number.isFinite(p.lat)) return null;
  if (p.lon<BOUNDS[0] || p.lon>BOUNDS[2] || p.lat<BOUNDS[1] || p.lat>BOUNDS[3]) return null;
  return {id:p.id.slice(0,80),name:p.name.slice(0,100),lon:p.lon,lat:p.lat,
    category:String(p.category||'other').slice(0,25),address:String(p.address||'주소 확인 전').slice(0,180),coordinateStatus:'approximate',naverVerified:false};
}
export function parsePlaces(html) {
  if(typeof html!=='string'||html.length>2000000)throw Error('장소 원본 크기 오류');
  const match=html.match(/globalThis\.JEJU_DATA=(.+);\r?\n/);
  if(!match)throw Error('장소 원본을 찾지 못했습니다');
  const data=JSON.parse(match[1]);if(!Array.isArray(data.places))throw Error('장소 원본 형식 오류');
  return data.places.map(cleanPlace).filter(Boolean).slice(0,200);
}
export function initialState() {
  return {provider:'VWorld WebGL 3.0',state:'not-configured',sdkReady:false,modelObserved:false,
    modelSelections:0,coverageVerified:false,heightsVerified:false,roofShapesVerified:false,
    terrainAlignmentVerified:false,walkingCollisionVerified:false,productionReady:false,
    renderingPolicy:'provider-mesh-only',originalMeshRendering:false,generatedBuildingFallback:false,sourceDate:null};
}
export function transition(state,event) {
  const next={...state};
  if(event==='loading')return {...initialState(),state:'loading'};
  if(event==='sdk-ready'){next.state='viewer-ready-unverified';next.sdkReady=true;}
  if(event==='model-picked'&&next.sdkReady){next.modelObserved=true;next.originalMeshRendering=true;next.modelSelections++;}
  if(event==='error'){next.state='error';next.sdkReady=false;next.originalMeshRendering=false;}
  if(event==='disconnect')return initialState();
  // Engine initialization or one successful pick is never site-wide accuracy validation.
  next.productionReady=false;return next;
}
function childRuntime(channel,origin,places) {
  let viewer=null,started=false,ended=false,timer=null;
  const send=(type,payload={})=>parent.postMessage({channel,type,...payload},origin);
  const fail=()=>{ended=true;clearInterval(timer);send('error',{message:'브이월드 초기화 실패. 인증키·등록 도메인·네트워크·WebGL 지원을 확인하세요.'});};
  const ready=()=>{
    if(started||ended)return;
    viewer=window.ws3d?.viewer;
    if(!viewer?.scene||!window.Cesium)return;
    started=true;clearInterval(timer);
    const C=window.Cesium;
    try {
      viewer.scene.globe.depthTestAgainstTerrain=true;
      const input=new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      input.setInputAction(m=>{
        try {
          const hit=viewer.scene.pick(m.position);
          if(hit?.id?.id?.startsWith?.('poi:')){send('place',{id:hit.id.id.slice(4)});return;}
          if(!C.Cesium3DTileFeature||!(hit instanceof C.Cesium3DTileFeature)) {
            send('selection-empty');return;
          }
          const names=typeof hit.getPropertyIds==='function'?hit.getPropertyIds():[];
          const properties=[];
          for(const name of names.slice(0,40)) {
            if(/token|secret|password|apikey|api_key/i.test(name))continue;
            const v=hit.getProperty(name);
            if(['string','number','boolean'].includes(typeof v))properties.push([String(name).slice(0,80),String(v).slice(0,300)]);
          }
          send('model-picked',{properties});
        } catch {send('selection-empty');}
      },C.ScreenSpaceEventType.LEFT_CLICK);
      for(const p of places) {
        viewer.entities.add({id:'poi:'+p.id,name:p.name,position:C.Cartesian3.fromDegrees(p.lon,p.lat),
          point:{pixelSize:9,color:C.Color.fromCssColorString(p.category==='hotel'?'#69b6ff':p.category==='parking'?'#f4ce73':'#69d8b5'),outlineColor:C.Color.BLACK,outlineWidth:1,heightReference:C.HeightReference.CLAMP_TO_GROUND},
          label:{text:p.name,font:'13px sans-serif',fillColor:C.Color.WHITE,showBackground:true,pixelOffset:new C.Cartesian2(0,-20),heightReference:C.HeightReference.CLAMP_TO_GROUND,distanceDisplayCondition:new C.DistanceDisplayCondition(0,2200)}});
      }
      if(viewer.scene.renderError?.addEventListener)viewer.scene.renderError.addEventListener(()=>send('error',{message:'3D 렌더링 오류. 연결을 종료한 뒤 브라우저·기기를 확인하세요.'}));
      send('sdk-ready');
      addEventListener('message',e=>{
        if(e.source!==parent||e.origin!==origin||e.data?.channel!==channel)return;
        const d=e.data;
        if(d.type==='fly') {
          const p=d.position;
          if(!p||![p.lon,p.lat,p.height].every(Number.isFinite)||p.lon<126.462||p.lon>126.575||p.lat<33.468||p.lat>33.536||p.height<100||p.height>10000)return;
          viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(p.lon,p.lat,p.height),orientation:{heading:0,pitch:C.Math.toRadians(-50),roll:0},duration:1.4});
        }
      });
    } catch {fail();}
  };
  try {
    if(!window.vw?.Map)throw Error('SDK missing');
    window.vw.ws3dInitCallBack=ready;
    const map=new window.vw.Map();
    map.setOption({mapId:'vmap',initPosition:new window.vw.CameraPosition(new window.vw.CoordZ(126.525,33.508,1600),new window.vw.Direction(0,-50,0)),logo:true,navigation:true});
    map.start();
    let count=0;timer=setInterval(()=>{ready();if(++count>120&&!started)fail();},250);ready();
  } catch {fail();}
}
export function frameHTML({key,channel,origin,places=[]}) {
  const u=new URL(origin);
  if(u.origin!==origin||(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname)))throw Error('HTTPS 서비스에서 연결해야 합니다.');
  if(!/^[a-zA-Z0-9-]{10,80}$/.test(channel))throw Error('Invalid session channel');
  const clean=places.map(cleanPlace).filter(Boolean);
  const js=JSON.stringify([channel,origin,clean]).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const src=sdkURL(key).replace(/&/g,'&amp;');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,#vmap{margin:0;width:100%;height:100%;overflow:hidden;background:#172327}</style><script src="${src}"></script></head><body><div id="vmap"></div><script>(${childRuntime.toString()})(...${js});</script></body></html>`;
}
