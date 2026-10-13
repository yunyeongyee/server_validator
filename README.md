# Server Validator · 서버 사양 검증 목업

고객 요구사항과 견적을 **문서 입력 → 공통 사양/원문 검토 → 예비 판정 → 실제 이미지 구성**으로 검토하는 한국어 로컬 웹 도구입니다.

기술 스택: **FastAPI · React/TypeScript · Pillow · 선택적 OpenAI · run.bat**.

## 내 PC에서 실행

1. GitHub의 **Code → Download ZIP** 또는 [실행용 ZIP](https://github.com/yunyeongyee/server_validator/raw/refs/heads/main/dist/ServerValidator-Mockup.zip)을 받아 압축 해제합니다.
2. Python 3.10 이상을 설치합니다.
3. **run.bat를 더블클릭**합니다. 처음 실행할 때 Python 의존성을 설치하고 브라우저를 엽니다.
4. 실행 창을 유지하고 **예제 불러오기 → 두 문서 예비 분석**으로 시작합니다. 종료는 실행 창에서 Ctrl+C입니다.

GitHub 소스 ZIP과 실행용 ZIP 모두 `web/`의 빌드된 React 화면을 포함하여 **Node.js·도메인·호스팅 없이** 실행합니다. 첫 의존성 설치에는 인터넷이 필요합니다. `start.cmd`는 `run.bat`로 연결하는 호환 진입점입니다. Windows 실행 자체는 이 Linux 환경에서 검증하지 않았습니다.

**자동 업데이트:** `run.bat` 실행 시 Git 저장소는 변경 사항이 없는 `main`에서 `git pull --ff-only`를 실행합니다. ZIP으로 받은 폴더는 Git 설치 없이 최신 실행용 ZIP을 확인하고 SHA-256 검증 후 프로그램을 갱신합니다. 업데이트 후 브라우저를 열며, 사용자 이미지·보정·키는 유지합니다. 네트워크 실패 시 기존 버전으로 실행을 시도합니다. 직접 수정한 프로그램 파일이 있으면 자동 교체를 건너뜁니다.

이 기능이 없는 이전 버전은 **한 번만 기존 실행 창을 Ctrl+C로 종료하고 새 ZIP 전체를 압축 해제**하세요. 이후부터는 `run.bat`만 실행하면 됩니다.

큰 스텐실은 **이미지 보관함 → 스텐실 가져오기**에서 원본 VSSX/VSDX를 선택합니다(128MB 이하). EMF/WMF 변환에는 Inkscape가 PATH에 있어야 합니다. 또는 Visio에서 실제 PNG로 내보내 **이미지 추가**로 가져옵니다(20MB 이하). 채팅 파일 전송의 32MB 한도와 별개입니다.

- [버튼별 사용자 흐름](docs/user-flow.md)
- [목업 화면](docs/mockup/README.md)
- [Windows 실행·스텐실 가져오기·exe 포장](docs/windows-run.md)

## 개발 실행

```bash
python -m pip install -r requirements-dev.txt
cd frontend
npm ci
npm run build
cd ..
python launcher.py --no-browser
```

화면 수정 중에는 별도 터미널의 `frontend`에서 `npm run dev`를 사용합니다. Vite는 `/api`, 실제 이미지 경로를 FastAPI로 연결합니다. 배포 화면은 `npm run build` 후 `web/`에 생성됩니다. 사용자 실행을 위해 이 빌드 결과를 Git에 함께 저장합니다. 화면을 수정하면 빌드 결과도 같은 커밋에 포함하세요. 개발에는 Vite가 지원하는 Node.js 버전(현재 검증: Node 24)이 필요합니다.

## OpenAI는 선택 사항

키가 없어도 문서 예비 추출·수동 검토·수치 비교·이미지 편집이 동작합니다. API 키 또는 SDK가 없으면 규칙 기반 결과임을 표시합니다. 호출 실패/스키마 오류/원문 근거 검증 실패에도 AI 결과를 사용하지 않고 예비 추출로 전환하며 경고를 남깁니다. 코어와 스레드, 명시 수량, RAID, 장착 형식을 원문과 검증합니다.

OpenAI 사용 시 `python -m pip install -r requirements-ai.txt`(Windows: `run.bat --ai`)를 실행하고 프로세스의 `SV_OPENAI_API_KEY` 또는 `OPENAI_API_KEY`를 설정합니다. 값은 채팅·저장소·보정 파일에 넣지 않습니다. `OPENAI_MODEL` 기본값은 `gpt-4.1`입니다. API 사용에는 별도 비용이 있습니다.

정형 추출은 Chat Completions JSON Schema, 공식 자료 조사는 Responses 웹 검색을 사용합니다. 출처가 없는 조사 결과는 미확인 초안이며, 견적이나 판정을 자동 덮어쓰지 않습니다. 이 환경에는 키가 없어 **실제 OpenAI 호출은 미검증**이고, 키 없음/오류/검증 실패 경로와 모의 응답 처리를 테스트했습니다.

## 정확도와 실제 이미지

예제의 CPU는 8코어 ×2 =총 16코어이며 CPU당 기준이면 요구 16코어와 다릅니다. 32GB ×4 =128GB입니다. RAID1은 견적에 없어서 확인 필요입니다. OS No CAL과 별도 5팩 User CAL은 독립 추출하고 CAL 수량을 비교합니다. 서버 모델·수량은 원문에 없으면 추정하지 않습니다.

사용자 제공 `Dell-PowerEdge-XR.vssx`의 실제 내장 EMF를 변환한 69개 PNG를 포함합니다. 이름·alias·원본 SHA-256·내장 경로는 `static/assets/dell/manifest.json`에 있습니다. 내장 이미지 조각은 전체 Visio 마스터의 XML 도형·텍스트·회전을 모두 재현한 결과와 다를 수 있습니다. XR은 R760/R660 대신 쓰지 않으며 편집 연습으로 구분합니다. RackServers 원본은 채팅 전송 한도로 가져오지 못했으므로 도구에서 직접 가져옵니다.

`data/servers.json`, `data/components.json`은 **공식 원문 검증 대기 후보 데이터**입니다. 이 클라우드의 Dell 요청은 프록시에서 차단되어 가이드 원문 확인을 완료하지 못했습니다. `verified:false`를 장착 가능의 확정 근거로 쓰지 않습니다. 실제 베이 자동 감지와 최종 승인 기능은 아직 구현 전이며 목업의 예정 흐름으로 명시합니다.

사용자 보정/연결/검토값은 브라우저에 저장하고 JSON으로 내보냅니다. 추가 이미지·스텐실은 `.local/assets` 또는 `SERVER_VALIDATOR_DATA_DIR/assets`에 저장합니다. Windows `run.bat` 실행 시 `%LOCALAPPDATA%\ServerValidator\assets`를 사용합니다. 이 PC 파일들은 커밋하지 않습니다. 텍스트는 CRLF를 유지합니다.

## 검증과 배포

```bash
python -m unittest discover -s tests -v
cd frontend
npm run build
cd ..
python scripts/verify_mockup.py
python scripts/package_mockup.py
```

단위/API 테스트는 30개입니다. 브라우저 검증은 별도 8002 포트, Playwright 및 Chromium을 사용해 문서·수정·재판정·실제 이미지·Pillow PNG·업로드·복원을 확인합니다. ZIP은 `dist/ServerValidator-Mockup.zip`에 생성되며 Node 의존성, 사용자 업로드, 키와 PC 보정을 포함하지 않습니다.

자동 업데이트 배포는 `scripts/package_mockup.py`로 ZIP과 `release-info.json`을 생성한 뒤 커밋합니다. 이어 `python scripts/update_manifest.py <ZIP 커밋 SHA>`로 `dist/update.json`을 만들고 별도 커밋합니다. 두 커밋을 함께 main에 반영하여 업데이트 주소가 실제 커밋된 ZIP을 가리키게 합니다. ZIP과 업데이트 색인은 dist가 무시되므로 명시적으로 `git add -f`합니다.

이번 배포는 사용자 승인에 따라 `main`에 올립니다. **이후 작업은 새 브랜치에서 시작 → 검증 → 릴리스 시 main 반영**으로 진행합니다. main을 직접 수정하거나 강제 푸시하지 않습니다.
