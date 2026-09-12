# JEJU:BEFORE 3.2.0-proxy-bootstrap

Current connection instructions: [CONNECT_3_2.md](CONNECT_3_2.md).

The service key has been issued by the user but is NOT configured in this build. SDK reception, Jeju building coverage and geometry accuracy are unverified.

The following 3.1 document is historical context; use CONNECT_3_2.md for the current connection procedure.

---

# JEJU:BEFORE 3.1 — 실제 건물 원본 연결센터

## 현재 실행 주소와 정확한 상태

[키 없는 공개 연결·검증 화면](https://rawcdn.githack.com/kokoom94-ai/jeju-now-981/538e267bd55920329c38ae49a6df248d3cc9e1eb/index.html)

공개 주소에서 HTML 일치와 브라우저 기능을 확인했습니다. **이것은 연결센터 게시이며, 제주 정밀 건물 데이터 연결 완료가 아닙니다.** 본인 서비스용 브이월드 인증키는 미설정이고, SDK 실응답·제주 정밀 모델 수신·높이·지붕·지형 정확도 검증은 아직 하지 않았습니다.

공유 rawcdn 주소에서는 인증키 입력과 SDK 요청을 차단합니다. 다른 사이트나 공식 교육 예제의 키를 재사용하지 않습니다. 제공기관 계정 생성, 로그인, 약관 동의, 키 발급 또는 결제 변경을 대신 수행하지 않았습니다.

## 코드 작성 없이 남은 계정 설정

### 1. GitHub Pages 활성화

[Pages 설정](https://github.com/kokoom94-ai/jeju-now-981/settings/pages)에서 아래를 선택하고 Save 합니다.

- Source: **Deploy from a branch**
- Branch: **jeju-precision-site**
- Folder: **/(root)**

배포 전용 브랜치는 이미 생성했고, 정적 파일 8개를 올렸습니다. 기존 9.81 운영 `main` 브랜치와 도보 베타 `real.html`은 변경하지 않았습니다.

활성화 후 사용할 **예정 주소**: `https://kokoom94-ai.github.io/jeju-now-981/`

이 문서 작성 시점에는 `pagesEnabled=false`입니다. 위 주소가 이미 서비스 중이라고 해석하지 마세요. GitHub가 게시 완료로 표시하고 실제 접속이 성공한 뒤 API 서비스 주소로 사용합니다. 워크플로의 GITHUB_TOKEN으로 올린 후속 커밋은 브랜치 기반 Pages 게시를 자동 재실행하지 않을 수 있으므로, 후속 공개 갱신 때는 실제 Pages 배포 결과를 별도로 확인해야 합니다.

### 2. 본인 명의 브이월드 WebGL 3D 인증키

[브이월드 공식 홈페이지](https://www.vworld.kr/)에서 로그인 후 오픈API → 인증키 → 인증키 발급을 진행합니다.

- 서비스명 예시: JEJU BEFORE 제주시 원도심 3D 사전여행지도
- 서비스 URL: 실제 게시된 위 전용 주소
- 사용 API: WebGL 3D 지도 API (연결 코드 버전 3.0)
- 목적: 제주시 원도심 5개 동과 제주공항 일대의 원본 3D 건물·지형 확인 및 관광 장소정보 연계

발급된 JavaScript 공개 키를 전용 사이트에 직접 입력합니다. 채팅·GitHub 소스·공유 CDN에 붙여넣지 마세요. 이 앱은 키를 저장소, 진단 파일 또는 페이지 URL에 기록하지 않습니다. 브라우저 SDK 요청에서 키가 보이는 특성이 있으므로 등록 도메인 제한은 필요합니다. 제공기관 SDK 자체 내부 동작은 별도 감사하지 않았습니다.

## 구현된 연결·진단 기능

- 전용 GitHub Pages/지정 Netlify/localhost에서만 연결 입력을 허용하는 호스트 제한. 공유 CDN·유사 도메인·임의 호스트 차단.
- 원본을 받기 전에는 SDK를 요청하거나 임의 높이·가짜 건물·지붕을 생성하지 않음.
- 일도동·이도동·건입동·삼도동·용담동·공항의 6개 확인 지점. 좌표는 대표점이며 행정동 경계나 검증된 출입구가 아님.
- 연결 후 지원되는 Cesium 원본 3D 객체를 선택해 공개 속성과 선택 위치를 확인하도록 작성. 실제 공급자 연결 전이므로 런타임 호환성은 추가 검증 필요.
- 표본 위치가 프로젝트 범위와 확인 지점 주변에 있는지 검사한 뒤 기록. 1,700m 근접 조건은 잘못된 먼 표본 기록을 막는 조건일 뿐 행정동 소속 판정이 아님.
- 6개 지점의 표본을 모두 기록하더라도 전체 범위·실제 높이·지붕·보행 검증을 참으로 바꾸지 않음.
- 기존 32개 장소 초안, 검색, 팝업, 공식 네이버 지도 검색 연결 유지. 네이버 검증·건물 ID 매칭·실제 출입구 좌표는 미완료.
- 진단 JSON 내보내기. 세션의 표본 기록은 새로고침 시 사라지며 별도 계정·공유 DB는 없음.

정밀지도에 보행 캐릭터를 아직 이식하지 않았습니다. 기존 캐릭터 도보 체험은 별도 `real.html`에 그대로 있습니다.

## 실제 완료로 보려면

인증된 서비스에서 원본 3D와 지형을 수신한 뒤, 행정경계 및 공항 전체 포함 여부, 표본 건물의 높이·지붕·단차·위치, 고도 기준과 원본 촬영·갱신 시점을 대조해야 합니다. 이후 실제 건물·출입구와 장소를 연결하고 캐릭터의 지면 접촉·건물 관통·경사·계단·공항 제한구역을 검사해야 합니다. 3D 뷰어가 열리는 것만으로 이 조건들이 충족되지 않습니다.

원본이 부족하면 제주도 공간정보 담당부서·LX·제작기관 등에 **해당 자료의 보유 및 공개 제공 가능 여부**를 확인합니다. 자료나 제공 승인을 이미 확보한 것은 아닙니다.

> 제주시 일도동·이도동·건입동·삼도동·용담동 및 제주국제공항 일대의 외부 공개 관광서비스 구현을 위한 3차원 건물 원본과 지형 데이터 제공 가능 여부를 문의합니다. 건물 높이·지붕·외벽 형상, 제공 범위 폴리곤, 좌표계와 수직 기준, 구축·갱신 시점, 정확도, 외부 공개·재배포 조건, 보안 제외 구역과 API/파일 형식을 함께 확인 요청드립니다.

## 검증 및 소스

[성공한 워크플로](https://github.com/kokoom94-ai/jeju-now-981/actions/runs/34616311195)

[게시 기록](publication.json) · [브라우저 검사 28개](browser-result.json)

단위·입력 계약 검사를 통과했고, 실제 공개 HTTPS 화면과 localhost에서 데스크톱·모바일 크기의 Chromium 검사 28개를 통과했습니다. 공유호스트 키 차단, 32개 장소와 팝업, 위조 메시지 거부, 진단 파일 저장, 모바일 가로 넘침, 키의 저장소 미보관 등을 검사했습니다. 제공기관 성공 응답을 모의해 연결됐다고 처리한 검사는 없습니다. 실제 SDK 연결·정밀 건물 형상·실기기 성능은 미검증입니다.

빌드: `node precision/prepare.mjs`

단위 검사: `node --test precision/contract.test.mjs precision/session.test.mjs`

배포 디렉터리: `_precision_site/`. 원본 소스는 `jeju-before-web`의 `precision/`, 배포 브랜치는 `jeju-precision-site`입니다.

## 공식 참고

- https://www.data.go.kr/data/3073144/openapi.do
- https://github.com/V-world/V-world_API_sample
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.ogc.org/is/20-010/20-010.html
