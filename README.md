# Server Validator · 서버 사양 검증 목업

고객 요구사항과 서버 견적을 붙여넣고 **공통 사양 검토 → 예비 판정 → 실제 이미지 구성** 흐름을 확인하는 한국어 웹 목업입니다.

```bash
cd /workspace/server_validator
python -m app.server --port 8000
```

Windows에서는 저장소 폴더에서 `py -3 -m app.server --port 8000`으로 실행합니다. 브라우저에서 호스트 `127.0.0.1`, 포트 `8000`으로 접속합니다. Python 3.10 이상이며 애플리케이션 실행에 pip/npm 설치는 필요 없습니다.

- [버튼별 사용자 흐름 정의](docs/user-flow.md)
- [목업 화면](docs/mockup/README.md)
- [Windows에서 직접 실행·큰 스텐실 가져오기·exe 빌드](docs/windows-run.md)

Windows에서는 `start.cmd`를 더블클릭하면 로컬 서버와 브라우저가 함께 열립니다(Python 필요). 도메인이나 호스팅은 필요 없습니다. exe 포장용 `scripts/build_windows.cmd`도 제공하지만 Windows 빌드·실행은 아직 검증하지 않았습니다.

‘예제 불러오기 → 두 문서 예비 분석’으로 고객이 제공한 R760 예제를 검토할 수 있습니다. CPU 코어 기준을 서버 전체로 선택하면 8코어 ×2 =16코어이고, CPU당으로 선택하면 요구 16코어와 다릅니다. RAID1은 견적에 없어서 보류합니다. OS의 No CAL과 별도 5팩 User CAL은 각각 추출합니다.

현재 동작: 규칙 기반 예비 추출, 원문 근거·수정 사유 검토, 수치 비교, 조사 요청 저장, 실제 스텐실 내장 이미지 추출, 이미지 보관함, 수동 영역/라벨/연결선 보정, 다중 선택, 부품 연결/배치, PNG 내보내기, 브라우저 임시 저장.

아직 연결하지 않은 기능: **OpenAI 정형 추출·실제 웹 조사·실제 베이 자동 감지·최종 승인**. 이 목업은 이 기능들이 성공한 것처럼 결과를 표시하지 않습니다. `app/analysis.py`의 AI 스키마와 근거 검증기는 다음 구현의 출발점이며 실제 OpenAI 호출은 없습니다.

## 실제 스텐실

사용자가 제공한 `Dell-PowerEdge-XR.vssx`에서 실제 내장 EMF를 PNG로 변환한 69개 이미지를 포함합니다. 원본 이름·alias·내장 경로·원본 파일 SHA-256은 `static/assets/dell/manifest.json`에 보존합니다. 내장 이미지 조각은 전체 Visio 마스터의 XML 도형/텍스트/회전을 모두 재현한 결과와 다를 수 있습니다. XR 이미지는 R760/R660 구성에 대신 사용하지 않으며 별도 편집 연습으로 표시합니다.

`Dell-PowerEdge-RackServers.vssx`는 채팅 파일 전송 도구의 32MB 한도로 이 머신에 가져오지 못했습니다. 웹 도구의 **스텐실 가져오기**에서 원본 파일을 직접 선택할 수 있습니다(128MB 이하). 지원 내장 이미지가 없거나 EMF 변환을 사용할 수 없으면 Visio에서 원본을 PNG로 내보내 가져오세요. 서버 그림을 임의로 그리지 않습니다.

EMF/WMF를 가져올 때만 Inkscape 실행 파일이 필요합니다. 이 클라우드 머신에서는 설치된 `/usr/bin/inkscape`로 실제 추출·변환을 확인했습니다. Windows에서는 Inkscape를 설치하고 PATH에 등록하거나 PNG를 가져옵니다. PNG/JPG 내장 이미지에는 변환기가 필요 없습니다.

## 공식 사양 및 보정 파일

`data/servers.json`, `data/components.json`은 **검증 대기 후보 데이터**입니다. 이 환경의 프록시가 Dell 도메인을 403으로 차단해서 Technical Guide 원문 확인을 완료하지 못했습니다. `verified:false` 데이터는 장착 가능의 확정 근거로 쓰지 않습니다. CPU 종속 슬롯/라이저와 지원 부품번호가 없는 경우 장착 호환성은 검증 대기입니다.

사용자 PC의 보정·이미지 연결은 localStorage와 IndexedDB에 저장하고 JSON으로 내보냅니다. `*.calibration.json`, `*.image-mappings.json`, `.local/`은 Git에서 제외합니다. 스텐실 추가 변환 결과의 서버 저장 경로는 `.local/assets/`이며 `SERVER_VALIDATOR_DATA_DIR`로 변경할 수 있습니다. 단일 사용자용 로컬 목업으로, 사용자 인증·팀 공유·운영 배포는 후속 작업입니다.

텍스트 파일은 CRLF이며 `.gitattributes`에 `eol=crlf`를 지정했습니다. 브라우저에 저장한 문서는 다른 PC로 동기화되지 않습니다. API 키를 문서나 보정 파일에 넣지 마세요. 현재 목업은 OpenAI 키를 요청하거나 외부 API로 문서를 전송하지 않습니다.

## 검증

```bash
python -m unittest discover -s tests -v
python scripts/verify_mockup.py
```

두 번째 명령은 Playwright와 Chromium이 설치된 검증 환경용입니다. `CHROMIUM_EXECUTABLE`로 브라우저 경로를 지정할 수 있습니다. 검증 스크립트는 별도 서버를 시작하고 문서 입력, 원문 검토/수정, 기준 변경, 예비 판정, 조사 요청, 실제 이미지 보정·배치·PNG, 임시 저장 복원 및 모바일 화면을 확인합니다.
