import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
let js=await readFile(new URL('assets/village.js',root),'utf8');
const blob=createHash('sha1').update(`blob ${Buffer.byteLength(js)}\0`).update(js).digest('hex');
if(blob!=='1c46f6af50db904879d1f7a460b69c7ca96d0d48')throw Error('Village base changed. Review the 2.2 integration before building.');
js=js.replace("'use strict';","'use strict';\nconst API_QUERY=new URLSearchParams(location.search).get('demo')==='1'?'?demo=1':'';");
js=js.replace("const colors={good:","const colors={unknown:'#b8beb4',good:");
js=js.replace("if(!z)continue;","if(!z||z.status==='unknown')continue;");
js=js.replaceAll('village-2.1.0','live-signals-2.2.0');
const details=`function updateDetails(){
 const z=feed?.zones.find(z=>z.id===selected),value=z?z.count:feed?.people.total;
 $('selectedCount').textContent=Number.isFinite(value)?count(value)+'명':'미관측';
 $('selectedStatus').textContent=z?.label||feed?.crowd?.label||'미관측';
 $('detailCountLabel').textContent=z?.basis==='operator-reported'?'현장 관찰 입력':feed?.mode==='estimated'?'시연 인원':'확인된 인원';
 const when=z?.observedAt?new Date(z.observedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'';
 $('detailNote').textContent=z?.basis==='operator-reported'?'관찰 '+when+' · 입력자 관찰값이며 독립 검증 전입니다. 15분 뒤 자동 만료됩니다.'+(z.occupiedCars!=null?' 주차 차량 '+z.occupiedCars+'대 (사람 수와 별도).':'')+(z.waitMinutes!=null?' 관찰 대기 '+z.waitMinutes+'분.':''):feed?.mode==='estimated'?'숫자와 혼잡색은 시연용 가정값입니다. 실제 현장이 아닙니다.':'이 구역의 현재 관측값이 없습니다. 숫자·혼잡도·도민 비율을 임의로 만들지 않습니다.';
}
`;
js=js.slice(0,js.indexOf('function updateDetails()'))+details+js.slice(js.indexOf('function renderList()'));
js=js.replace("num.textContent=z?count(z.count)+'명':'—'","num.textContent=z&&Number.isFinite(z.count)?count(z.count)+'명':'—'");
const apply=`function apply(data){
 if(!data||!data.people||!Array.isArray(data.zones)||(data.people.total!==null&&!Number.isFinite(data.people.total)))return;
 const stamp=Date.parse(data.observedAt);if(!Number.isFinite(stamp))return;if(feed&&stamp<Date.parse(feed.observedAt))return;
 feed=data;receivedAt=Date.now();
 $('total').textContent=Number.isFinite(data.people.total)?count(data.people.total)+'명':'미관측';
 $('locals').textContent=count(data.people.locals);$('tourists').textContent=count(data.people.tourists);
 const sim=data.mode==='estimated',field=data.mode==='field-observation',skt=data.mode==='skt-realtime';
 $('dataBadge').textContent=sim?'시연 모드':skt?'통신 집계 수신':field?'현장 관찰 입력':'실데이터 대기';
 $('noticeText').textContent=sim?'모든 인원은 가상값입니다. 실제 현장 정보가 아닙니다.':skt?'총인원은 승인된 통신 집계 추정입니다. 미관측 구역으로 자동 배분하지 않습니다.':field?'관찰한 구역만 표시합니다. 전체 인원·미관측 구역·도민 비율은 임의 추정하지 않습니다.':'현재 파크 인원은 미연결입니다. 기상예보와 현장 입력을 각각 별도 출처로 표시합니다.';
 const em=document.querySelectorAll('.overview em');em[0].textContent=sim?'가상 인원':data.totalBasis==='operator-reported'?'관찰값':skt?'통신 추정':'미수집';em[1].textContent=Number.isFinite(data.people.locals)?sim?'가정값':'통신 집계':'미수집';em[2].textContent=Number.isFinite(data.people.tourists)?sim?'가정값':'통신 집계':'미수집';
 $('updated').textContent='서버 수신 '+new Date(data.observedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
 $('connectionLabel').textContent=sim?'시연 데이터 수신':field?'현장 입력 수신':skt?'SKT 집계 수신':'서버 연결 · 인원 미관측';
 $('connectionDetail').textContent='5초 화면 동기화는 새 현장 관측을 뜻하지 않습니다. 개별 관찰시각과 만료시각을 확인하세요.';
 $('connectionLabel').closest('.sourceCard').classList.remove('offline');$('dataNotice').classList.remove('disconnected');
 document.querySelector('.mapLegend small').textContent=sim?'가상 혼잡색':'현장 입력 구역만 표시';
 for(const {m,el}of pinNodes){const z=data.zones.find(z=>z.id===m.id);el.querySelector('.pinValue').textContent=z&&Number.isFinite(z.count)?count(z.count)+'명':z?.basis==='operator-reported'?z.label:'미관측';el.style.setProperty('--heat',heatOn?(colors[z?.status]||colors.unknown):'#9aaa7f');}
 updateDetails();renderList();dirty=true;window.dispatchEvent(new CustomEvent('park:data',{detail:data}));
}
`;
js=js.slice(0,js.indexOf('function apply(data){'))+apply+js.slice(js.indexOf('for(const m of meta){const el=document.createElement'));
for(const endpoint of ['live','forecast','stream'])js=js.replaceAll(`'/api/v1/parks/981/${endpoint}'`,`'/api/v1/parks/981/${endpoint}'+API_QUERY`);
js=js.replace('if(!pts.length)return;',"if(!pts.length){$('outlook').textContent='검증 전 · 추천 보류';return;}");
await writeFile(new URL('assets/village-v22.js',root),js);
let html=await readFile(new URL('index.html',root),'utf8');
html=html.replaceAll('village-2.1.0','live-signals-2.2.0').replace('village 2.1','live 2.2').replace('/assets/village.js?v=2.1.0','/assets/village-v22.js?v=2.2.0');
html=html.replace('</head>','<link rel="stylesheet" href="/assets/signals.css?v=2.2.0"></head>');
html=html.replace('>시뮬레이션</b>','>실데이터 대기</b>').replace('SKT 미연결 · 표시 인원과 캐릭터는 실제 현장 관측이 아닙니다.','관찰한 구역만 표시합니다. 캐릭터와 차량은 연출입니다.');
html=html.replaceAll('<em>가정값</em>','<em>미수집</em>').replace('<em>가상 인원</em>','<em>미수집</em>');
html=html.replace('가상 혼잡 상태','관찰 혼잡 상태').replace('시뮬레이션 인원','확인된 인원');
html=html.replace('전체 인원은 서버 시뮬레이션입니다. 실제 입장객·대기시간·주차 잔여면수는 아직 연동되지 않았습니다.','미관측은 빈 상태로 표시합니다. 현장 관찰값은 15분 뒤 만료됩니다.');
html=html.replace('3시간 시간대 패턴 · 예측 정확도 미검증<br>실제 방문시간을 결정하는 근거로 사용하지 마세요.','혼잡 예측은 검증 전까지 제공하지 않습니다.<br>상단 기상예보는 인원 예측과 별개입니다.');
html=html.replace('SKT 미연결 상태에서는 전부 시뮬레이션입니다. 도민·관광객은 가정 비율입니다.','현장 관측이 없으면 미관측으로 표시합니다. 별도 시연 모드의 도민·관광객은 가정값입니다.');
const cards=`<section class="signalGrid" aria-label="실제 데이터 출처">
<article class="signalCard"><span class="signalKicker">WEATHER · 공개 기상예보</span><h2 id="weatherTitle">예보 수신 중</h2><p id="weatherMeta">MET Norway · 파크 주변 격자 예보. 현장 관측이나 운영상태가 아닙니다.</p><div id="weatherHours" class="weatherHours"></div><p class="signalFine">Based on data from <a href="https://api.met.no/" target="_blank" rel="noopener">MET Norway</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · 항목 추출·한글 표시</p></article>
<article class="signalCard"><span class="signalKicker">FIELD · 현장 직접 입력</span><h2 id="fieldTitle">관찰값 확인 중</h2><p>관찰자가 확인한 혼잡·인원·대기시간만 반영합니다. 파크 운영 API 없이도 입력할 수 있습니다.</p><div id="fieldReports"></div><a class="signalButton" href="/observe">현장 관찰 입력 열기 ↗</a></article>
<article class="signalCard"><span class="signalKicker">SOURCE · 연결 상태</span><h2 id="sourceTitle">SKT 연결 확인 중</h2><p id="sourceMeta">통신 원천 데이터와 실제 체류인원은 구분합니다. 정확도 80~90%는 아직 검증되지 않았습니다.</p><a class="signalButton secondary" id="modeSwitch" href="/?demo=1">가상 인원 시연 모드 보기</a><p class="signalFine">기본 화면은 미관측 값을 채우지 않습니다. 시연 모드는 별도 표시합니다.</p></article>
</section>`;
html=html.replace('<main class="layout">',cards+'<main class="layout">');
html=html.replace('</body>','<script src="/assets/signals.js?v=2.2.0" defer></script></body>');
await writeFile(new URL('index-v22.html',root),html);
console.log('Built live-signals-2.2.0 without changing the 2.1 source map.');
