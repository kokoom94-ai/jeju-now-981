# JEJU NOW — 9.81 LITTLE PARK 2.2

게임풍 2.5D 지도 + 실제 외부 기상예보 + 인증된 현장 관찰 입력. **SKT 실데이터는 아직 미연결이며, 인원 정확도 80~90%도 미검증입니다.**

## 현재 화면

- `/`: 관측된 구역만 표시합니다. 미관측 인원과 도민·관광객은 임의로 채우지 않습니다.
- `/observe`: 실제 현장 관찰을 입력합니다. 기존 Render `INGEST_TOKEN`(16자 이상)으로 인증하며 브라우저 저장소에 키를 저장하지 않습니다.
- `/?demo=1`: 숫자·비율이 가상임을 명시한 별도 시연 모드입니다.

기존 LITTLE PARK의 회전·확대·실내 열기·구역 선택 기능은 유지합니다. 지도는 정밀 측량 모델이 아닌 게임풍 개념도입니다. 캐릭터와 차량은 연출입니다.

## 실행

Node.js 22:

```bash
npm start
# http://localhost:8080
npm test
```

시작 시 기존 지도 소스를 확인해 `index-v22.html`, `assets/village-v22.js`를 만들고 `server-v22.mjs`를 실행합니다. Render의 기존 `npm start`와 `/health` 설정을 유지하면 됩니다. `server.mjs`는 과거 버전 참고용이며 현재 시작 명령에는 사용하지 않습니다.

## 데이터

기상예보는 MET Norway의 공개 좌표 예보입니다. 파크 현장 관측이나 인원 측정값이 아닙니다. 서버가 캐시하며 출처·발표시각·대상시각을 표시합니다. 기본 활성화이며 `WEATHER_ENABLED=false`로 끌 수 있습니다.

현장 관찰값은 입력자의 확인값입니다. 관찰시각부터 15분 뒤 자동 만료되며 서버 재시작 시 사라집니다. 부분 구역의 사람 수를 전체 파크 인원으로 확대하지 않고, 차량과 사람 수를 분리합니다. 독립적인 현장 검증은 별도로 필요합니다.

SKT는 승인된 집계구역·지표·관측시각을 가진 피드가 있어야 연결할 수 있습니다. `JTO_APPROVED_SCOPE_ID`, `INGEST_TOKEN`을 설정한 인증 push 또는 `DATA_MODE=auto`와 `JTO_SKT_API_URL`을 설정한 pull을 지원합니다. 일반 밀도·주변 지역 유동인구를 현재 파크 인원으로 변환하지 않습니다. 기존 `DATA_MODE=estimated`는 JTO 자동 pull을 비활성화합니다.

## 주요 API

- `GET /health`: 배포 버전, 연결상태
- `GET /api/v1/parks/981/live`: 실제 관측 데이터; `?demo=1`은 별도 시연
- `GET /api/v1/parks/981/stream`: 5초 화면 동기화
- `GET /api/v1/parks/981/signals`: 기상예보·현장 관찰·SKT 상태
- `GET /api/v1/parks/981/accuracy`: 검증 전 `accuracy:null`
- `GET /api/v1/observations`: 관찰값과 입력 가능 여부
- `POST /api/v1/observations`: 인증된 현장 입력
- `POST /api/v1/ingest/skt`: 승인된 SKT 집계 입력

미검증 혼잡 예측은 제공하지 않습니다. 빈 데이터가 장애나 0명을 뜻하는 것은 아닙니다.

## 문서와 테스트

- [2.2 상세 안내·출처·연동 조건](docs/LIVE_SIGNALS_2_2.md)
- [기존 2.1 지도 안내](docs/VILLAGE_2_1_RELEASE.md)
- [과거 JTO 접근 진단](docs/JTO_CONNECTION_STATUS.md)

서버/데이터 테스트 28개, 별도 오프라인 브라우저 UI 테스트 10개를 실행했습니다. 기능 검증이지 SKT 연결이나 현장 정확도 검증이 아닙니다. 배포 확인은 `Verify live signals 2.2` Actions 실행 결과와 산출물을 확인하세요.

기상 데이터 출처: MET Norway, CC BY 4.0. 화면은 원천 항목을 추출하고 한글로 표시합니다. API 키나 원천 데이터를 저장소에 올리지 마세요.
