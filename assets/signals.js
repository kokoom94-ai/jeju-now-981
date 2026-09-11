(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const time=iso=>new Date(iso).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const names={'park':'파크 전체','indoor-lobby':'실내 로비','sports-lab':'SPORTS LAB','ringggo':'RINGGGO','space-cup':'SPACE CUP','ticket':'티켓존','race-start':'레이스 출발','race-1':'코스 1','race-2':'코스 2','race-3':'코스 3','return':'자동회차','outdoor':'야외광장','parking':'주차장','viewing':'관람 공간'};
 const levels={good:'쾌적',normal:'보통',busy:'혼잡','very-busy':'매우 혼잡'};
 function showReports(reports){
  const active=reports.filter(r=>Date.parse(r.expiresAt)>Date.now());
  $('fieldTitle').textContent=active.length?active.length+'개 구역 관찰값':'아직 현장 관찰 없음';
  $('fieldReports').replaceChildren();
  for(const r of active){const b=document.createElement('button');b.className='reportChip';b.textContent=(names[r.zoneId]||r.zoneId)+' · '+(levels[r.level]||'등급 없음')+(r.count!=null?' · '+r.count+'명':'')+(r.occupiedCars!=null?' · 차량 '+r.occupiedCars+'대':'');b.title='관찰 '+time(r.observedAt)+' / 만료 '+time(r.expiresAt);b.onclick=()=>document.querySelector('[data-pin="'+r.zoneId+'"]')?.click();$('fieldReports').append(b);}
 }
 if($('weatherTitle')){
  const demo=new URLSearchParams(location.search).get('demo')==='1';
  if(demo){$('modeSwitch').href='/';$('modeSwitch').textContent='현장 데이터 화면으로 돌아가기';}
  let checked=0;
  async function refresh(){if(document.hidden)return;
   try{const r=await fetch('/api/v1/parks/981/signals',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const s=await r.json();checked=Date.now();
    $('sourceTitle').textContent=s.skt.activeAnchor?'SKT 집계 수신':'SKT 실데이터 미연결';
    $('sourceMeta').textContent='상태: '+s.skt.state+' · 현장 인원 정확도는 미검증입니다. 공개 기상예보를 사람 수로 환산하지 않습니다.';
    showReports(s.observations||[]);
    const w=s.weather;
    $('weatherHours').replaceChildren();
    if(!w.available){$('weatherTitle').textContent='기상예보 수신 대기';$('weatherMeta').textContent='외부 예보 '+w.state+' · 수신 실패 시 가상 날씨를 표시하지 않습니다.';return;}
    const data=w.data,p=data.points[0];$('weatherTitle').textContent=p.temperatureC+'°C · 바람 '+p.windMs+'m/s';
    $('weatherMeta').textContent='모델 발표 '+time(data.generatedAt)+' · 예보 대상 '+time(p.validAt)+' · 현장 실측 아님';
    for(const x of data.points.slice(0,4)){const d=document.createElement('div');d.className='weatherHour';const a=document.createElement('b'),v=document.createElement('span');a.textContent=time(x.validAt).split(' ').slice(-1).join('');v.textContent=x.temperatureC+'° / '+x.windMs+'m/s / '+(x.rainMmNextHour==null?'강수 미제공':x.rainMmNextHour+'mm(1h)');d.append(a,v);$('weatherHours').append(d);}
   }catch{$('weatherTitle').textContent='데이터 연결 지연';$('weatherMeta').textContent='마지막 화면이 최신임을 확인할 수 없습니다. 다시 연결 중입니다.';}}
  window.addEventListener('park:data',e=>{if(!demo)showReports(e.detail.observations||[]);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-checked>30000)refresh();});
  refresh();setInterval(refresh,60000);
 }
 if($('observationForm')){
  const form=$('observationForm'),result=$('formResult');
  function localNow(){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());$('observedAt').value=parts.replace(' ','T');}
  localNow();$('setNow').onclick=localNow;
  $('zoneId').onchange=()=>{$('carsField').hidden=$('zoneId').value!=='parking';if($('carsField').hidden)$('occupiedCars').value='';};
  $('clearToken').onclick=()=>{$('token').value='';result.textContent='이 화면의 인증키를 지웠습니다.';};
  fetch('/api/v1/observations',{cache:'no-store'}).then(r=>r.json()).then(d=>{
   if(!d.authenticatedInputEnabled)result.textContent='서버에 INGEST_TOKEN(16자 이상)이 설정되어야 저장할 수 있습니다.';
  }).catch(()=>{result.textContent='서버 연결을 확인하지 못했습니다.';});
  form.addEventListener('submit',async e=>{
   e.preventDefault();const button=$('saveObservation');button.disabled=true;result.textContent='저장 중…';
   const optional=id=>$(id).value.trim()===''?null:Number($(id).value);
   const p={zoneId:$('zoneId').value,observedAt:$('observedAt').value+':00+09:00',attested:$('attested').checked,level:$('level').value||null,count:optional('count'),waitMinutes:optional('waitMinutes'),occupiedCars:optional('occupiedCars')};
   try{const r=await fetch('/api/v1/observations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+$('token').value},body:JSON.stringify(p),signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok)throw Error(d.error||('HTTP '+r.status));result.textContent='저장했습니다. 관찰 '+time(d.observation.observedAt)+' / 만료 '+time(d.observation.expiresAt)+'. 메인 지도에 반영됩니다.';$('attested').checked=false;}
   catch(e){result.textContent='저장하지 못했습니다: '+e.message;}finally{button.disabled=false;}
  });
 }
})();
