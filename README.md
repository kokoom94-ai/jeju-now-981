# JEJU NOW — 9.81 PARK

9.81파크의 실내·실외 혼잡을 보여주는 단일 Node 서비스입니다. 메인 화면은 실내 Cutaway와 야외 RACE 981 트랙의 zone heatmap을 표시하며, 데이터 원천이 없거나 신선하지 않으면 안전하게 추정 모드로 동작합니다.

## 데이터 동작 방식

1. `JTO_SKT_API_URL`이 설정된 경우 서버가 5분 간격(기본값)으로 JTO/SKT 피드를 HTTPS로 가져옵니다.
2. 수신값은 총인원·도민·관광객·관측시각을 검증하고, 신선한 값만 전체 인원의 anchor로 사용합니다.
3. 피드 오류, 지연, 잘못된 응답 또는 자격증명 미설정 시 서비스는 중단하지 않고 `ESTIMATED LIVE`로 자동 fallback 합니다.
4. 외부 중계 시스템이 push 방식만 지원하면 인증된 `POST /api/v1/ingest/skt`를 사용할 수 있습니다.

### JTO 공개 화면 차트 어댑터

`mondak`에서 사용한 패턴처럼 JTO 빅데이터 플랫폼의 웹 화면이 요청하는 chart endpoint를 **운영자가 지정한 차트 하나에 한해** 읽을 수 있습니다. 이 어댑터는 공개 화면에서 정상 응답하는 데이터에만 사용하며, 데이터셋 번호를 탐색하지 않고 로그인·세션·인증을 우회하지 않습니다.

이 경로는 문서화된 API 계약이 아니며, 제공기관의 이용약관·robots 정책·운영 허가가 우선입니다. 또한 일반 공개 차트 값은 집계 지표일 수 있으므로 화면에는 `JTO PUBLIC CHART · DERIVED`로 표시되며, `SKT/JTO REALTIME` 또는 실제 파크 인원으로 표시되지 않습니다.

서버는 재시도 시 지수 backoff, 12초 요청 timeout, 최대 관측 연령 검사(기본 15분), 제한된 request body, 인증 없는 ingest 차단을 적용합니다. `/health`와 `/api/v1/parks/981/skt/status`에서 비밀값 없이 연결 상태를 확인할 수 있습니다.

## Render 환경변수

기본 배포에는 아래 두 값만 필요합니다. `render.yaml`은 `INGEST_TOKEN`을 자동 생성합니다.

| 변수 | 값 | 용도 |
|---|---|---|
| `DATA_MODE` | `auto` | JTO/SKT가 준비되면 사용, 아니면 추정 모드 |
| `INGEST_TOKEN` | 긴 무작위 비밀값 | push ingest 인증 |

실제 JTO/SKT feed가 발급되면 Render의 Secret 환경변수에만 다음을 추가합니다.

| 변수 | 예시 | 용도 |
|---|---|---|
| `JTO_SKT_API_URL` | `https://<approved-jto-endpoint>` | HTTPS pull endpoint |
| `JTO_SKT_API_TOKEN` | `<secret>` | API token |
| `JTO_SKT_POLL_MS` | `300000` | 수집 주기(최소 60000) |
| `JTO_SKT_AUTH_HEADER` | `Authorization` | 인증 header 이름 |
| `JTO_SKT_AUTH_SCHEME` | `Bearer` | token 앞 접두어 |
| `JTO_SKT_TOTAL_PATH` | `data.people.total` | 실제 응답의 총인원 필드 경로 |
| `JTO_SKT_LOCALS_PATH` | `data.people.locals` | 도민 필드 경로 |
| `JTO_SKT_TOURISTS_PATH` | `data.people.tourists` | 관광객 필드 경로 |
| `JTO_SKT_OBSERVED_AT_PATH` | `data.observedAt` | 관측시각 필드 경로 |

공개 차트 어댑터는 실제로 승인받은 차트의 응답 구조를 확인한 뒤에만 아래 값을 설정합니다.

| 변수 | 용도 |
|---|---|
| `JTO_PUBLIC_CHART_REG_SN` | 승인된 숫자형 데이터셋 ID 하나 |
| `JTO_PUBLIC_CHART_INDEX` | 차트 index, 기본값 `0` |
| `JTO_PUBLIC_CHART_VALUE_PATH` | 응답 JSON의 수치 필드 경로 |
| `JTO_PUBLIC_CHART_LOCALS_PATH` / `JTO_PUBLIC_CHART_TOURISTS_PATH` | 필요 시 도민·관광객 필드 경로 |
| `JTO_PUBLIC_CHART_OBSERVED_AT_PATH` | 필요 시 관측시각 필드 경로 |

기본적으로 인식하는 필드는 `people.total`, `data.people.total`, `total`, `data.total`, `visitorCount`, `population` 등입니다. 실제 JTO 응답 구조가 다르면 위의 `*_PATH`만 설정하면 됩니다. `DATA_MODE=estimated`로 설정하면 외부 poll을 명시적으로 끕니다.

## Push ingest 계약

~~~bash
curl -X POST https://jeju-now-981.onrender.com/api/v1/ingest/skt \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "JTO_SKT_REALTIME",
    "observedAt": "2026-09-11T13:50:00+09:00",
    "people": { "total": 692, "locals": 151, "tourists": 541 }
  }'
~~~

`observedAt`은 현재 시각 기준 15분 이내여야 합니다. Push anchor는 인메모리 값이므로 Render 인스턴스가 재시작되면 중계 시스템이 다음 5분 주기에 다시 보내야 합니다. 지속적인 운영에서는 JTO pull 연동을 권장합니다.

## API

- `GET /health` — 서비스 및 provider 상태
- `GET /api/v1/parks/981/live` — 현재 데이터, zone, 추천 방문시간
- `GET /api/v1/parks/981/stream` — 5초 SSE
- `GET /api/v1/parks/981/forecast` — 향후 3시간 예측
- `GET /api/v1/parks/981/history` — 최근 화면 계산 이력
- `GET /api/v1/parks/981/skt/status` — JTO/SKT 연결 진단
- `POST /api/v1/ingest/skt` — 인증된 push ingest

## 실행

~~~bash
npm start
# http://localhost:8080
~~~

## 정확도 고지

SKT/JTO 유동인구는 파크 전체 인원의 anchor이며, 개별 실내 공간·어트랙션별 실제 체류인원을 보장하지 않습니다. zone heatmap과 예상 대기시간은 9.81 운영 신호(게이트, 탑승, AI counting 등)로 현장 검증하기 전까지 모델 추정치입니다.
