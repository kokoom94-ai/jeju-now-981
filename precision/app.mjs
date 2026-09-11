import {CAMERAS,validateKey,parsePlaces,initialState,transition,frameHTML} from './bridge.mjs';
const $=s=>document.querySelector(s),frame=$('#frame');
let state=initialState(),channel=null,timeout=null,places=[];
const labels={'not-configured':'인증키 미설정 · 원본 지도 미연결',loading:'공식 SDK 요청 중 · 모델 확인 전','viewer-ready-unverified':'뷰어 초기화됨 · 지역·건물 정확도 미검증',error:'연결 또는 렌더링 오류 · 원본 상태 확인 필요'};
function refresh(){
  $('#connection-state').textContent=labels[state.state];
  $('#model-state').textContent='3D 원본 객체 선택: '+state.modelSelections+'개 (전수 검사 아님)';
  $('#connect').disabled=state.state==='loading'||state.sdkReady;
  $('#disconnect').disabled=state.state==='not-configured';
  for(const b of $('#cameras').querySelectorAll('button'))b.disabled=!state.sdkReady;
}
function emit(type,extra={}){if(channel&&state.sdkReady)frame.contentWindow.postMessage({channel,type,...extra},location.origin);}
function hideFeature(){$('#feature').hidden=true;$('#properties').replaceChildren();$('#naver-link').hidden=true;}
function showPlace(p){
  hideFeature();$('#feature').hidden=false;$('#feature-title').textContent=p.name;
  $('#feature-note').textContent=p.address+' · 좌표 초안 / 원본 건물 매칭·네이버 정보 검증 전';
  $('#naver-link').href='https://map.naver.com/p/search/'+encodeURIComponent('제주 '+p.name);$('#naver-link').hidden=false;
  emit('fly',{position:{lon:p.lon,lat:p.lat,height:350}});
}
function renderPlaces(){
  const q=$('#search').value.trim();$('#places').replaceChildren();
  for(const p of places.filter(p=>p.name.includes(q))){const b=document.createElement('button');b.type='button';b.className='place';b.textContent=p.name;const s=document.createElement('small');s.textContent=p.address;b.append(s);b.addEventListener('click',()=>showPlace(p));$('#places').append(b);}
}
$('#origin').textContent=location.origin;
for(const p of Object.values(CAMERAS)){const b=document.createElement('button');b.textContent=p.name;b.type='button';b.disabled=true;b.addEventListener('click',()=>emit('fly',{position:p}));$('#cameras').append(b);}
$('#connect-form').addEventListener('submit',e=>{
  e.preventDefault();
  try{
    let key=validateKey($('#api-key').value);
    if(!$('#confirmed').checked)throw Error('본인 서비스용 키와 도메인 설정을 확인해야 합니다.');
    if(location.origin==='null')throw Error('파일로 열지 말고 HTTPS 또는 로컬 웹서버에서 실행하세요.');
    clearTimeout(timeout);channel=crypto.randomUUID();
    const content=frameHTML({key,channel,origin:location.origin,places});key='';$('#api-key').value='';
    state=transition(state,'loading');hideFeature();$('#empty').hidden=true;frame.hidden=false;frame.srcdoc=content;
    $('#notice').textContent='키 유효성은 제공기관이 확인합니다. 뷰어가 열려도 원도심 전체 3D 지원이나 실제 형상 일치를 뜻하지 않습니다.';
    timeout=setTimeout(()=>{if(state.state==='loading'){state=transition(state,'error');$('#notice').textContent='응답 제한시간 초과. 등록 도메인·키 권한·브이월드 접속 상태를 확인하세요.';refresh();}},35000);
    refresh();
  }catch(err){$('#notice').textContent=err.message;}
});
$('#disconnect').addEventListener('click',()=>{
  clearTimeout(timeout);channel=null;frame.removeAttribute('srcdoc');frame.src='about:blank';frame.hidden=true;$('#empty').hidden=false;
  $('#api-key').value='';state=transition(state,'disconnect');$('#notice').textContent='연결을 종료했습니다.';hideFeature();refresh();
});
addEventListener('message',e=>{
  if(!channel||e.source!==frame.contentWindow||e.origin!==location.origin||e.data?.channel!==channel)return;
  const d=e.data;
  if(d.type==='sdk-ready'&&state.state==='loading'){clearTimeout(timeout);state=transition(state,'sdk-ready');$('#notice').textContent='공식 뷰어 초기화 확인. 건물을 클릭해 원본 객체를 확인하세요. 높이·지붕·전체 범위는 별도 검증이 필요합니다.';}
  if(d.type==='error'){clearTimeout(timeout);state=transition(state,'error');$('#notice').textContent='공식 뷰어 로드 또는 렌더링 실패. 키·도메인·네트워크·WebGL 지원을 확인하세요.';}
  if(d.type==='model-picked'&&state.sdkReady){
    state=transition(state,'model-picked');hideFeature();$('#feature').hidden=false;$('#feature-title').textContent='선택한 원본 3D 객체';
    $('#feature-note').textContent='제공기관이 내려준 속성입니다. 항목의 단위·기준·갱신일이 확인되기 전에는 실측 높이로 해석하지 않습니다. 높이 속성이 없어도 모델 형상 자체는 제공될 수 있습니다.';
    for(const pair of (Array.isArray(d.properties)?d.properties:[]).slice(0,40)){
      if(!Array.isArray(pair)||pair.length!==2)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=String(pair[0]).slice(0,80);dd.textContent=String(pair[1]).slice(0,300);$('#properties').append(dt,dd);
    }
    if(!$('#properties').children.length)$('#feature-note').textContent+=' 이 객체는 공개된 속성값이 없습니다.';
  }
  if(d.type==='selection-empty'){$('#notice').textContent='선택 위치에서 3D 모델 객체를 확인하지 못했습니다. 미지원·미로딩·다른 객체 선택을 구분해 확인해야 합니다.';}
  if(d.type==='place'){const p=places.find(p=>p.id===d.id);if(p)showPlace(p);}
  refresh();
});
$('#search').addEventListener('input',renderPlaces);$('#close-feature').addEventListener('click',hideFeature);
$('#report').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({...state,checkedAt:new Date().toISOString(),places:places.length,scope:'runtime diagnostic; not a geometry accuracy certificate'},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='jeju-precision-status.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
fetch('../index.html',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('원본 읽기 실패');return r.text();}).then(t=>{places=parsePlaces(t);renderPlaces();}).catch(()=>{$('#places').textContent='기존 장소 원본을 읽지 못했습니다. 지도 원본 연결과 별개입니다.';});
window.__JEJU_PRECISION__={get status(){return {...state};},get placeCount(){return places.length;}};
refresh();
