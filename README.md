# JEJU NOW — 9.81 PARK · SKT Fusion Edition

9.81파크의 실내/실외 3D 디지털트윈에 **SKT 실시간 유동인구를 anchor**로 결합하고, 5초 단위 화면 보간과 80/90 정확도 검증 Gate를 적용한 외부배포용 버전입니다.

## 중요

- `SKT 연결 = 90% 보장`이 아닙니다.
- 90%는 **9.81 실제 체류인원과 매칭한 holdout 검증에서 Accuracy = 100 - MAPE가 90 이상**일 때만 달성으로 표시됩니다.
- 운영 하한선은 80입니다.
- SKT만으로 실내 층/개별 어트랙션 Zone별 80% 정확도를 보장할 수 없습니다. Zone별 80% 목표는 9.81의 탑승/게이트/AI Counting 등 내부 신호가 추가되어야 합니다.

## 데이터 우선순위

1. `JTO_SKT_REALTIME` — 제주관광 빅데이터 플랫폼의 SKT 5분 유동인구/도민·관광객 집계 feed (권장)
2. `SKT_OPENAPI_PLACE` — SK open API 장소 혼잡도 (fallback / calibration metric)
3. 데이터 미연결 시 기존 시간대 기반 DEMO fallback

## 바로 실행

```bash
npm start
# http://localhost:8080
```

## JTO/SKT 5분 피드 연결 — 권장

서버가 직접 pull할 수 있으면 `.env` 또는 Render 환경변수에:

```text
DATA_MODE=jto-skt
JTO_SKT_API_URL=https://<internal-or-proxy-endpoint>
JTO_SKT_API_TOKEN=<token>
```

또는 공사 내부 시스템/중계 서버가 이 서비스로 5분마다 push:

```bash
curl -X POST https://<service>/api/v1/ingest/skt \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source":"JTO_SKT_REALTIME",
    "observedAt":"2026-09-11T12:30:00+09:00",
    "people":{"total":620,"locals":140,"tourists":480}
  }'
```

## SK open API 직접 연결 — fallback

1. SK open API에서 앱 생성 및 `appKey` 발급
2. POI 목록에서 9.81파크 제공 여부 확인
3. 환경변수 입력

```text
DATA_MODE=skt-openapi
SKT_APP_KEY=<secret>
SKT_POI_ID=<poi id>
SKT_LAT=33.3928867
SKT_LNG=126.3586318
SKT_POLL_MS=300000
```

POI 검색:

```bash
SKT_APP_KEY=... npm run find:skt-poi
```

SK open API 장소 혼잡도 값은 최근 1시간의 면적당 방문자 밀도 성격이므로 바로 '현재 인원'으로 간주하지 않고 calibration metric으로 씁니다.

## 정확도 80/90 맞추기

### 1) Ground Truth 수집
실제 9.81파크 체류인원과 같은 시각의 SKT 값을 매칭합니다. 최소 70개, 권장 100~300개. 평일/주말/우천을 섞습니다.

```csv
observedAt,sktMetric,actualTotal
2026-09-11T10:00:00+09:00,0.00631,412
```

### 2) Calibration

```bash
node scripts/calibrate-skt.mjs data/groundtruth.csv
```

결과는 `data/skt-calibration.json`에 저장됩니다.

### 3) 합격 기준
- `< 80%`: 외부 운영 기준 미달
- `80~89.9%`: 하한 통과
- `>= 90%`: 목표 달성

서비스 API:
- `GET /api/v1/parks/981/accuracy`
- `GET /api/v1/parks/981/skt/status`
- `POST /api/v1/parks/981/accuracy/ground-truth`
- `POST /api/v1/parks/981/accuracy/recalibrate`

## 주요 API

- `GET /health`
- `GET /api/v1/parks/981/live`
- `GET /api/v1/parks/981/stream` — SSE
- `GET /api/v1/parks/981/forecast`
- `GET /api/v1/parks/981/history`
- `POST /api/v1/ingest/skt`
- `GET /api/v1/parks/981/skt/status`
- `GET /api/v1/parks/981/accuracy`

## 외부 배포

Render를 권장합니다. `SKT_APP_KEY`, `JTO_SKT_API_TOKEN`, `ADMIN_TOKEN`, `INGEST_TOKEN`은 GitHub에 넣지 말고 Render의 Secret 환경변수로 입력하세요.

자세한 정확도 설계는 `docs/10_SKT_FUSION_80_90.md`를 확인하세요.
