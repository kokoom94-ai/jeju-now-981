# JEJU:BEFORE 3.2 — 발급받은 브이월드 키 연결

## 확인된 주소와 현재 한계

등록에 안내한 서비스 URL은 **https://kokoom94-ai.github.io/jeju-now-981/** 입니다.
2026-09-12 점검 시작 시 GitHub API는 `has_pages=false`였습니다. 키 발급 완료와 사이트 게시 완료는 별개입니다.
최신 자동 점검 결과는 소스 브랜치의 `precision/readiness.json`과 Actions 결과를 확인하세요.
`main`은 운영 9.81 서비스이므로 수정하거나 정밀지도 브랜치를 병합하지 않습니다.

## 1. 먼저 등록한 전용 사이트 게시

GitHub 저장소 Settings → Pages에서 다음을 선택합니다.

- Source: **Deploy from a branch**
- Branch: **jeju-precision-site**
- Folder: **/(root)** → Save

이 설정은 `main`을 수정하지 않습니다. 예정 URL이 실제 HTTP 200을 반환하고 연결센터 3.2가 표시되는지 확인하세요.
공유 rawcdn 미리보기에서는 직접 입력과 프록시 연결을 모두 차단합니다. 거기에 키를 넣지 마세요.
GitHub Actions의 `GITHUB_TOKEN`으로 배포 브랜치에 푸시한 커밋은 Pages 자동 게시를 재실행하지 않을 수 있습니다.
따라서 커밋 성공만으로 공개 사이트 갱신을 완료로 보지 않고 HTTP 및 파일 해시를 따로 검사합니다.

## 2. 직접 입력: 발급한 키·도메인·공식 SDK를 먼저 확인

전용 사이트에서 `직접 연결 · 발급 키 확인용`을 선택하고 본인 JavaScript 공개 키만 입력합니다.
등록 URL과 WebGL 3D 권한 확인란을 체크한 뒤 `실제 3D 연결`을 누릅니다.
키는 앱의 저장소, 진단 JSON, 페이지 주소나 GitHub에 기록하지 않습니다.
브라우저 SDK 요청·DOM·제공기관 SDK 코드에서는 키가 보일 수 있으므로 완전히 숨겨진 서버 비밀키라고 볼 수 없습니다.

## 3. 프록시 API: 서버 환경변수로 키 관리

`precision/proxy-server.mjs`는 별도 패키지 설치 없는 Node.js 22 서버입니다.
`precision/render.proxy.yaml`은 **새 정밀지도 전용 Free Web Service**용 준비 파일입니다.
기존 9.81 Render 서비스의 브랜치·환경변수·배포 설정은 바꾸지 않습니다. 유료 서비스, DB, 디스크를 만들지 않습니다.

| 항목 | 값 |
| --- | --- |
| 브랜치 | `jeju-before-web` |
| Build | `node --test precision/proxy.test.mjs` |
| Start | `node precision/proxy-server.mjs` |
| Health | `/healthz` |
| `VWORLD_SERVICE_URL` | `https://kokoom94-ai.github.io/jeju-now-981/` |
| `VWORLD_API_KEY` | 발급받은 값을 Render Environment에 직접 입력 |

표시한 프록시 주소 `https://jeju-precision-proxy.onrender.com`은 **배포 예정 주소이며 확보·배포를 의미하지 않습니다**.
실제 할당 주소가 달라지면 `connection.mjs`의 허용 주소를 먼저 수정·검토해야 합니다.
Render 계정의 무료 시간·트래픽 한도, 기존 무료 서비스와의 공유 한도 및 초과 과금을 점검하세요.
무료 서비스는 유휴 시 정지할 수 있어 첫 요청이 느릴 수 있습니다. 무료 한도 초과 시 자동 유료 전환을 선택하지 마세요.

서버 배포 후 전용 Pages 사이트에서 `프록시 API · 서버 환경변수 사용`을 선택하고 본인 프록시 주소를 확인합니다.
이 모드에서는 브라우저 키 입력란이 비활성화되며 `/api/vworld/config`로 키 설정 여부·등록 사이트를 먼저 검사합니다.
`/api/vworld/sdk.js`는 정해진 공식 WebGL 3.0 SDK 초기 요청만 중계합니다.
건물·지형 원본은 공식 SDK가 요청합니다. 전체 3D 타일 프록시, 임의 파일 다운로드·재배포, Cesium 3D Tiles 변환 기능은 아닙니다.
공식 SDK가 반환한 코드나 후속 브라우저 요청에는 키가 포함될 수 있습니다. 프록시가 키를 완전히 숨기거나 제공기관 도메인 인증을 우회하지 않습니다.
실제 키로 제공기관이 이 요청 경로를 허용하는지와 후속 자원 호환성은 아직 검증하지 않았습니다. 직접 연결만 성공하면 프록시 인증 경로는 별도로 확인합니다.

보호 장치: 고정 upstream, 실제 Origin/Referer 검사, 정확한 CORS 허용, 임의 URL·쿼리·쓰기 요청 차단, 리다이렉트 거절,
2MiB 응답 제한, 12초 upstream 제한, 동시 요청 4개·분당 SDK 초기 요청 30개 제한, `no-store`, 원문 오류 비노출.
Origin/Referer 검사는 사용자 인증을 대체하지 않습니다. 제공기관의 도메인 제한·사용량 제한도 유지해야 합니다.

## 로컬 검사

`node --test precision/proxy.test.mjs`는 외부 브이월드에 접속하지 않는 전송·입력 계약 검사입니다.
가짜 응답은 HTTP 경로의 안전성만 시험하며 실제 SDK 초기화나 원본 건물 수신 성공으로 기록하지 않습니다.
키 없는 브라우저 검사는 장소 32곳·모바일 화면·차단·오류 상태를 검사하며 실제 형상 검증을 대신하지 않습니다.

로컬 실연동은 프런트를 `http://localhost:8000/`에서 제공하고 해당 URL에 허용된 본인 키를 사용해야 합니다.
서버에 `VWORLD_SERVICE_URL=http://localhost:8000/`을 설정하고 `node --env-file=precision/.env precision/proxy-server.mjs`로 실행할 수 있습니다.
Pages용 키가 localhost에서도 허용된다고 가정하지 마세요. `.env`는 Git에서 제외됩니다.

## 실제 완료 판정

1. 등록된 URL의 게시 및 현재 파일 확인.
2. 본인 키로 공식 SDK 초기화. 프록시 모드는 별도로 후속 자원 수신까지 확인.
3. 원도심 확인 지점에서 원본 3D 객체를 직접 선택·표본 기록.
4. 원본의 건물 높이·지붕·지형 단차·촬영/갱신 시점 및 실제 위치와 대조.
5. 전체 범위와 실제 출입구·장소 연결 검증. 캐릭터 보행·충돌은 그 이후 단계.

뷰어 초기화나 몇 개 표본 선택만으로 4~5번을 참으로 바꾸지 않습니다.
키, 도메인, 외부 SDK의 실제 응답을 확보하지 않은 테스트 결과를 정밀지도 완성으로 표시하지 않습니다.

공식 참고:
- https://github.com/V-world/V-world_API_sample
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
