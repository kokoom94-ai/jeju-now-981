import {resolveProxy,PROXY_ORIGIN} from './connection.mjs';
import {validateKey,parsePlaces,cleanPlace,initialState,transition,frameHTML} from './bridge.mjs';
import {VERSION,TARGETS,PLANNED_URL,SETTINGS_URL,SITE_BRANCH,hostPolicy,createObservations,addObservation,cleanObject,cleanProperties,diagnostics} from './session.mjs';
const $=s=>document.querySelector(s),frame=$('#frame'),policy=hostPolicy(location.href);
let pending=null;
let state=initialState(),channel=null,timeout=null,places=[],observations=createObservations(),target=TARGETS[0].id,picked=null;
const labels={'not-configured':'원본 지도 미연결',loading:'공식 SDK 요청 중 · 모델 확인 전','viewer-ready-unverified':'뷰어 초기화됨 · 원본 객체 확인 필요',error:'연결 오류 · 원본 미검증'};
function notice(t){$('#notice').textContent=t;}
function refresh(){
 $('#connection-state').textContent=labels[state.state];$('#model-state').textContent='원본 객체 선택 '+state.modelSelections+'회 · 정확도 미검증';
 $('#connect').disabled=!policy.canConnect||state.state==='loading'||state.sdkReady;
 $('#api-key').disabled=!policy.canConnect||state.state==='loading'||state.sdkReady||$('#connection-mode').value==='proxy';
 $('#connection-mode').disabled=!policy.canConnect||state.state==='loading'||state.sdkReady;
 $('#proxy-url').disabled=!policy.canConnect||state.state==='loading'||state.sdkReady;
 $('#proxy-fields').hidden=$('#connection-mode').value!=='proxy';
 $('#confirmed').disabled=!policy.canConnect;$('#disconnect').disabled=state.state==='not-configured';
 for(const b of $('#cameras').querySelectorAll('button')){b.disabled=!state.sdkReady;b.setAttribute('aria-pressed',String(b.dataset.id===target));}
 $('#save-observation').disabled=!state.sdkReady||!picked;
 $('#areas').replaceChildren();
 for(const t of TARGETS){const row=document.createElement('div');row.className='area';const n=document.createElement('b');n.textContent=t.name;const s=document.createElement('span');s.textContent=observations[t.id].object?'표본 객체 기록 · 형상 검증 전':'원본 확인 전';row.append(n,s);$('#areas').append(row);}
 $('#observed-count').textContent=Object.values(observations).filter(x=>x.object).length+' / '+TARGETS.length;
}
function emit(type,extra={}){if(channel&&state.sdkReady)frame.contentWindow.postMessage({channel,type,...extra},location.origin);}
function hideFeature(){$('#feature').hidden=true;$('#properties').replaceChildren();$('#naver-link').hidden=true;$('#save-observation').hidden=true;}
function terminate(event='disconnect'){
 clearTimeout(timeout);pending?.abort();pending=null;channel=null;picked=null;frame.removeAttribute('srcdoc');frame.src='about:blank';frame.hidden=true;$('#empty').hidden=false;
 $('#api-key').value='';state=transition(state,event);hideFeature();refresh();
}
function showPlace(p){
 hideFeature();$('#feature').hidden=false;$('#feature-title').textContent=p.name;
 $('#feature-note').textContent=p.address+' · 좌표 초안 / 실제 건물·출입구·네이버 검증 전';
 $('#naver-link').href='https://map.naver.com/p/search/'+encodeURIComponent('제주 '+p.name);$('#naver-link').hidden=false;
 emit('fly',{position:{lon:p.lon,lat:p.lat,height:350}});
}
function renderPlaces(){
 const q=$('#search').value.trim();$('#places').replaceChildren();
 for(const p of places.filter(p=>p.name.includes(q))){const b=document.createElement('button');b.type='button';b.className='place';b.textContent=p.name;const s=document.createElement('small');s.textContent=p.address;b.append(s);b.addEventListener('click',()=>showPlace(p));$('#places').append(b);}
 $('#place-count').textContent=String(places.length);
}
$('#origin').textContent=location.origin;$('#planned-url').textContent=PLANNED_URL;$('#site-branch').textContent=SITE_BRANCH;$('#settings-link').href=SETTINGS_URL;
$('#preview-notice').hidden=policy.canConnect;
$('#host-label').textContent=policy.canConnect?'전용 / 로컬 접속 · 제공기관 인증 필요':'공유 호스트 · 인증키 입력 차단';
if(!policy.canConnect)notice('이 주소는 키 없이 보는 검증 화면입니다. 아래 GitHub Pages 설정 후 본인 전용 주소에서 연결하세요.');
for(const p of TARGETS){const b=document.createElement('button');b.textContent=p.name;b.type='button';b.dataset.id=p.id;b.disabled=true;b.addEventListener('click',()=>{target=p.id;picked=null;hideFeature();emit('fly',{position:p});notice(p.name+' 확인 지점으로 이동합니다. 카메라 대표점이며 행정경계·출입구 검증이 아닙니다.');refresh();});$('#cameras').append(b);}
$('#proxy-url').value=PROXY_ORIGIN;
$('#connection-mode').addEventListener('change',()=>{$('#api-key').value='';refresh();});
$('#connect-form').addEventListener('submit',async e=>{
 e.preventDefault();
 try{
  if(!policy.canConnect)throw Error('공유 호스트에서는 인증키 입력과 제공기관 요청을 차단합니다. 전용 주소를 사용하세요.');
  if(state.state==='loading'||state.sdkReady)return;
  const useProxy=$('#connection-mode').value==='proxy';
  let key=useProxy?undefined:validateKey($('#api-key').value);
  if(!$('#confirmed').checked)throw Error('본인 서비스용 키와 등록 도메인을 먼저 확인하세요.');
  clearTimeout(timeout);channel=crypto.randomUUID();const attempt=channel;
  pending=new AbortController();const controller=pending;
  observations=createObservations();picked=null;state=transition(state,'loading');state.transport=useProxy?'sdk-bootstrap-proxy':'direct-sdk';refresh();
  let sdkSource;
  if(useProxy){
    $('#api-key').value='';notice('프록시 설정 확인 중입니다. 서버 기동·키 설정·등록 주소를 검사합니다.');
    const limit=setTimeout(()=>controller.abort(),65000);
    try {({sdkSource}=await resolveProxy($('#proxy-url').value,location.href,fetch,controller.signal));}
    catch(err){if(channel!==attempt)return;terminate('error');state.failureCode='PREFLIGHT_FAILED';notice(err.message);return;}
    finally{clearTimeout(limit);}
    if(channel!==attempt||controller.signal.aborted)return;
  }
  const content=frameHTML({key,sdkSource,channel,origin:location.origin,places});key='';$('#api-key').value='';
  hideFeature();$('#empty').hidden=true;frame.hidden=false;frame.srcdoc=content;
  notice('제공기관에 인증을 요청했습니다. 화면이 열리는 것과 실제 제주 건물의 수신·형상 검증은 별개입니다.');
  timeout=setTimeout(()=>{if(state.state==='loading'){terminate('error');state.failureCode='SDK_INIT_TIMEOUT';notice('연결 시간 초과. 키·등록 주소·3D API 권한·네트워크를 확인하세요.');}},35000);refresh();
 }catch(err){$('#api-key').value='';if(state.state==='loading')terminate('error');notice(err.message);}
});
$('#disconnect').addEventListener('click',()=>{terminate();notice('연결을 종료했습니다. 기록은 이번 화면에만 남으며 새로고침하면 지워집니다.');});
addEventListener('message',e=>{
 if(!channel||e.source!==frame.contentWindow||e.origin!==location.origin||e.data?.channel!==channel)return;
 const d=e.data;
 if(d.type==='sdk-ready'&&state.state==='loading'){clearTimeout(timeout);state=transition(state,'sdk-ready');emit('fly',{position:TARGETS.find(t=>t.id===target)});notice('뷰어 초기화 확인. 각 확인 지점에서 3D 객체를 선택하고 표본 기록을 남기세요. 전체 범위·높이·지붕은 아직 미검증입니다.');}
 if(d.type==='error'){
  const messages={SDK_NETWORK_FAILED:'공식 SDK 요청 실패. 네트워크·프록시 응답을 확인하세요.',SDK_UNAVAILABLE:'SDK에서 지도 객체를 받지 못했습니다. 키·등록 도메인·WebGL 3D 권한을 확인하세요.',SDK_INIT_TIMEOUT:'SDK 초기화 시간 초과. 제공기관 응답·기기 지원을 확인하세요.',SDK_INIT_FAILED:'공식 지도 초기화 실패. 키·도메인·브라우저 지원을 확인하세요.',RENDER_FAILED:'3D 렌더링 오류. 브라우저·기기 지원을 확인하세요.'};
  const code=Object.hasOwn(messages,d.code)?d.code:'SDK_INIT_FAILED';const transport=state.transport;
  terminate('error');state.failureCode=code;state.transport=transport;notice(messages[code]);return;
 }
 if(d.type==='model-picked'&&state.sdkReady){
  const object=cleanObject(d);if(!object)return;
  state=transition(state,'model-picked');picked=object;hideFeature();$('#feature').hidden=false;$('#save-observation').hidden=false;
  $('#feature-title').textContent='선택한 제공기관 3D 객체';$('#feature-note').textContent='원본 객체 선택 결과입니다. 건물 분류·높이 단위·지붕 일치·갱신일은 별도 대조가 필요합니다.';
  const props=cleanProperties(object.properties);
  if(object.lon!==null&&object.lat!==null)props.unshift(['선택 경도',object.lon.toFixed(7)],['선택 위도',object.lat.toFixed(7)]);
  for(const pair of props){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=pair[0];dd.textContent=pair[1];$('#properties').append(dt,dd);}
  if(!props.length)$('#feature-note').textContent+=' 공개 속성·선택 좌표가 없어 표본 기록을 완료할 수 없습니다.';
 }
 if(d.type==='selection-empty'){picked=null;notice('이 위치에서 지원되는 3D 원본 객체를 확인하지 못했습니다. 미로딩·미지원·다른 객체 선택 여부를 확인하세요.');}
 if(d.type==='place'){const p=places.find(p=>p.id===d.id);if(p)showPlace(p);}
 refresh();
});
$('#save-observation').addEventListener('click',()=>{try{observations=addObservation(observations,target,picked);notice('표본 객체를 기록했습니다. 행정구역 전체 포함이나 실제 높이·지붕의 정확도 검증은 아닙니다.');refresh();}catch(e){notice(e.message);}});
$('#search').addEventListener('input',renderPlaces);$('#close-feature').addEventListener('click',hideFeature);
$('#report').addEventListener('click',()=>{
 const result=diagnostics(state,observations,location.href,places.length),blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='jeju-precision-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
$('#copy-registration').addEventListener('click',async()=>{
 const value='서비스명: JEJU BEFORE 제주시 원도심 3D 사전여행지도\n서비스 URL: '+PLANNED_URL+'\n사용 API: WebGL 3D 지도 API 3.0\n목적: 원도심 5개 동 및 제주공항 일대 원본 3D 건물·지형 확인과 관광지·주차장·호텔 정보 연계\n주의: 서비스 URL은 GitHub Pages 게시 성공 후 등록. 높이·형상·전체 범위는 원본 수신 후 검증.';
 $('#registration-copy').textContent=value;$('#registration-copy').hidden=false;
 try{await navigator.clipboard.writeText(value);notice('신청용 문구를 복사했습니다. 브이월드 계정 로그인과 인증키 발급은 본인 명의로 진행하세요.');}catch{notice('아래 신청 문구를 선택해 복사하세요.');}
});
(async()=>{try{const r=await fetch('places.json',{cache:'no-cache'});if(r.ok){const data=await r.json();if(!Array.isArray(data)||data.length>200)throw Error();places=data.map(cleanPlace).filter(Boolean);}else{const fallback=await fetch('../index.html',{cache:'no-cache'});if(!fallback.ok)throw Error();places=parsePlaces(await fallback.text());}renderPlaces();}catch{$('#places').textContent='장소 목록 수신 실패. 원본 지도 연결과 별개입니다.';}})();
window.__JEJU_PRECISION__={get version(){return VERSION;},get status(){return {...state};},get placeCount(){return places.length;},get hostMode(){return policy.mode;},get report(){return diagnostics(state,observations,location.href,places.length);}};
addEventListener('pagehide',()=>{clearTimeout(timeout);pending?.abort();pending=null;channel=null;$('#api-key').value='';});
refresh();
