# 🤝 Video Trim - 인수인계 문서 (Handover)

> 작성일: 2026-03-29
> 대상: 이 프로젝트를 이어받을 AI LLM 모델 또는 개발자

---

## 1. 프로젝트 요약

**Video Trim**은 Google NotebookLM의 200MB 동영상 업로드 제한을 해결하기 위해, 대용량 동영상을 지정된 크기 이하로 자동 분할하는 **로컬 웹 애플리케이션**입니다.

- **현재 버전**: v1.2 (안정)
- **상태**: ✅ 핵심 기능 구현 완료 + 복수 파일 순차 분할 지원
- **마지막 작업**: 2026-03-29

---

## 2. 현재 구현 상태

### ✅ 완료된 기능

| # | 기능 | 상태 | 파일 |
|---|------|------|------|
| 1 | FFmpeg 자동 탐색 (PATH → WinGet → 일반 경로) | ✅ 완료 | `server.py` L23-75 |
| 2 | 동영상 업로드 (드래그앤드롭 + 클릭선택) | ✅ 완료 | `script.js`, `server.py` |
| 3 | FFprobe 메타데이터 추출 (크기, 시간, 해상도, 코덱) | ✅ 완료 | `server.py` L99-139 |
| 4 | 균등 분배 분할 전략 (파트 수 먼저 → 시간 균등) | ✅ 완료 | `server.py` L143-161 |
| 5 | FFmpeg `-c copy` 무손실 분할 + stderr 드레인 | ✅ 완료 | `server.py` L177-275 |
| 6 | 실시간 스테이터스 바 (%, 파트, 잔여시간, 속도) | ✅ 완료 | `script.js`, `server.py` |
| 7 | 사용자 지정 저장 경로 (유효성 검증 포함) | ✅ 완료 | `server.py`, `script.js` |
| 8 | 원본 파일 보존 (읽기 전용 접근) | ✅ 완료 | `server.py` |
| 9 | 결과 화면 + 폴더 열기 | ✅ 완료 | `script.js`, `server.py` |
| 10 | 다크 테마 + 네온 그라데이션 UI | ✅ 완료 | `style.css` |
| 11 | 3단계 스텝 인디케이터 (업로드 → 설정 → 완료) | ✅ 완료 | `index.html`, `style.css` |
| 12 | 임시 파일 자동 정리 | ✅ 완료 | `server.py` |
| 13 | 네이티브 폴더 선택 다이얼로그 (tkinter) | ✅ 완료 | `server.py` `/api/browse-folder`, `script.js` |
| 14 | 기본 저장 경로 자동 설정 (output 폴더) | ✅ 완료 | `server.py` `/api/default-path`, `script.js` |
| 15 | 폴링 404 안전 가드 (서버 재시작 대응) | ✅ 완료 | `script.js` |
| 16 | **복수 파일 순차 분할** (큐 + 자동 순차 처리) | ✅ 완료 | `script.js`, `index.html`, `style.css` |

### ❌ 미구현 기능 (PRD에 정의됨)

| # | 기능 | 우선순위 | 비고 |
|---|------|----------|------|
| 1 | 재인코딩 모드 (정확한 용량 분할) | 낮음 | 처리 시간 크게 증가, 사용자 선택 옵션으로 제공 |
| 2 | 시간 기준 분할 (예: 30분마다) | 중간 | `calculate_split_points()` 수정 |
| ~~3~~ | ~~복수 파일 일괄 처리~~ | ~~완료~~ | ~~v1.2에서 큐 시스템으로 구현~~ |
| 4 | ZIP 일괄 다운로드 | 낮음 | 사용자 지정 경로 방식이라 불필요할 수 있음 |
| 5 | macOS/Linux 폴더 열기 | 낮음 | `server.py`에 분기 추가 |

---

## 3. 프로젝트 구조

```
c:\Workspace\video-trim\
├── server.py              # [핵심] Flask 백엔드 (590줄, 단일 파일)
├── requirements.txt       # Python 의존성 (flask>=3.0.0)
├── README.md              # GitHub용 설명 문서
├── static/
│   ├── index.html         # 메인 페이지 (240줄, 복수 파일 큐 UI 포함)
│   ├── style.css          # 스타일시트 (1300+줄, CSS 변수 기반 디자인 시스템)
│   └── script.js          # 프론트엔드 로직 (640줄, 순차 분할 큐 포함)
├── docs/
│   ├── PRD.md             # 제품 요구사항 문서 (v1.2)
│   ├── TDD.md             # 기술 설계 문서 (v1.1)
│   ├── RISK_CHECK.md      # 리스크 분석 문서 (v1.1)
│   ├── KNOWHOW.md         # ⭐ 개발 Know-How 문서 (문제 해결 기록)
│   └── HANDOVER.md        # [본 문서] 인수인계 문서
├── output/                # 기본 분할 결과 저장 폴더 (자동 생성)
└── uploads/               # 업로드 임시 폴더 (자동 생성, 자동 정리)
```

---

## 4. 개발 환경

### 4.1 확인된 환경

| 항목 | 버전 |
|------|------|
| OS | Windows 11 (10.0.26200) |
| Python | 3.12.8 |
| Flask | 3.x (최신) |
| FFmpeg | 8.1-full_build (WinGet 설치) |
| 브라우저 | Chrome / Edge |

### 4.2 FFmpeg 설치 경로 (현재 환경)

```
C:\Users\netcross\AppData\Local\Microsoft\WinGet\Packages\
  Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\
    ffmpeg-8.1-full_build\bin\
      ffmpeg.exe
      ffprobe.exe
```

> `server.py`의 `find_ffmpeg()` 함수가 이 경로를 자동으로 탐색합니다.

### 4.3 서버 실행 방법

```bash
cd c:\Workspace\video-trim
pip install -r requirements.txt   # 최초 1회
python server.py                  # 서버 시작 → http://localhost:5000
```

---

## 5. 코드 이해를 위한 핵심 포인트

### 5.1 작업 흐름 (Critical Path)

#### 단일 파일:
```
업로드 → tasks{} 등록 → 분할 요청 → 백그라운드 Thread 시작
→ FFmpeg -progress pipe:1 실행 (stderr는 별도 스레드에서 드레인)
→ stdout에서 out_time_us 파싱 → tasks{} 실시간 갱신
→ 프론트엔드 500ms 폴링으로 상태 표시
→ 완료 시 status="completed" → 결과 화면 표시
```

#### 복수 파일 순차 분할 (v1.2):
```
파일 큐 선택 → Step 2 설정 → "분할 시작" 클릭
→ processNextFile() 호출
  → 업로드(uploadFile) → 분할 시작(startSplit) → 폴링
  → 완료 시 onFileCompleted()
    → 다음 파일이 있으면 → processNextFile() 재귀 호출
    → 모든 파일 완료 → showAllResults() → Step 3
```

### 5.2 작업 상태 관리

- `tasks` 딕셔너리 (메모리 내) — `server.py` L90
- 키: `task_id` (uuid4의 첫 8자)
- 값의 주요 필드:

```python
{
    "task_id": "abc12345",
    "status": "uploaded" | "processing" | "completed" | "error",
    "progress": 0-100,              # 전체 진행률 (%)
    "current_part": 2,              # 현재 처리 중인 파트
    "total_parts": 5,               # 총 파트 수
    "estimated_remaining_seconds": 73,  # 예상 잔여 시간
    "speed_mbps": 45.2,             # 처리 속도 (MB/s)
    "parts": [...],                 # 완료된 파트 정보 배열
    "output_dir": "D:\\Videos",     # 사용자 지정 저장 경로
}
```

### 5.3 FFmpeg 명령어 패턴

```bash
ffmpeg -y -i {입력파일} -ss {시작초} -to {종료초} -c copy -avoid_negative_ts make_zero -progress pipe:1 {출력파일}
```

- `-c copy`: 재인코딩 없이 스트림 복사 (빠름, 무손실)
- `-avoid_negative_ts make_zero`: 분할 시 타임스탬프 보정
- `-progress pipe:1`: stdout으로 진행률 정보 출력

### 5.4 분할 알고리즘 (v1.1 개선)

```python
# 파트 수를 먼저 확정 → 시간을 균등 분배
num_parts = math.ceil(file_size / target_size_bytes)  # 90% 없이 정확 계산
part_duration = duration / num_parts                   # 균등 분배
```

> ⚠️ 이전 v1.0의 90% 보수적 전략은 파트 수 과다 계산 문제가 있어 제거됨.
> 자세한 내용은 `docs/KNOWHOW.md` 항목 1 참조.

### 5.5 출력 파일명 규칙

```
{원본파일명}_{순번}.{확장자}
예: 社会　第4回_1.mp4, 社会　第4回_2.mp4
```

### 5.6 프론트엔드 상태 전환

```
Step 1 (파일 큐 선택) → "분할 설정으로 이동" → Step 2 (설정 입력)
Step 2 → "분할 시작" → 큐 전체 자동 순차 처리 시작
  → 각 파일: 업로드 → 분할 → 폴링 → 완료 → 다음
모든 파일 완료 → showAllResults() → Step 3 (통합 결과)
"새 파일 처리" 클릭 → 전체 초기화 → Step 1
```

---

## 6. 알려진 이슈 및 주의사항

### 6.1 알려진 제한

| # | 이슈 | 영향 | 해결 방안 |
|---|------|------|-----------|
| 1 | VBR 동영상의 용량 편차 | 일부 파트가 목표 ±10% | 균등 분배 전략 적용 중 |
| 2 | WinGet 설치 후 PATH 미반영 | bash 셸에서 ffmpeg 직접 실행 불가 | `find_ffmpeg()`이 자동 탐색 |
| 3 | 메모리 내 작업 관리 | 서버 재시작 시 진행 중 작업 소실 | 로컬 도구 특성상 허용 범위 |
| 4 | 동시 분할 작업 | Thread 동시 실행은 가능하나 UI 미지원 | 단일 작업 기준으로 설계됨 |

### 6.2 코드 수정 시 주의

- **subprocess 파이프 데드락**: stdout/stderr를 모두 PIPE로 잡을 때 반드시 두 파이프를 동시 읽어야 함. 자세한 내용은 `docs/KNOWHOW.md` 항목 5 참조.
- `style.css`의 CSS 변수(`--accent-purple` 등)를 변경하면 전체 테마가 바뀝니다.
- `script.js`의 `pollStatus()` 간격(현재 500ms)을 늘리면 스테이터스 바 업데이트가 느려집니다.

---

## 7. 다음 개발자를 위한 권장 작업

### 우선순위 높음
1. **대용량 파일 테스트** — 1GB 이상 파일 분할 테스트 진행
2. **에러 핸들링 강화** — 네트워크 끊김, 디스크 공간 부족 등 예외 상황 대응
3. **파트 용량 초과 검증** — 분할 후 각 파트가 실제로 목표 이하인지 자동 검증 로직 추가

### 우선순위 중간
4. **시간 기준 분할 옵션** — `calculate_split_points()`에 시간 모드 추가
5. **크로스 플랫폼** — macOS (`open` 명령), Linux (`xdg-open` 명령) 지원

### 우선순위 낮음
6. **재인코딩 모드** — 정확한 용량 분할이 필요한 경우
7. **작업 이력 저장** — SQLite로 과거 분할 이력 조회
8. **다국어 지원** — 영어/일본어 UI 추가

---

## 8. 참고 문서

| 문서 | 경로 | 내용 |
|------|------|------|
| PRD | `docs/PRD.md` | 제품 요구사항 정의 (기능, UI/UX, API 설계) |
| TDD | `docs/TDD.md` | 기술 설계 (아키텍처, 알고리즘, 데이터 흐름) |
| 리스크 체크 | `docs/RISK_CHECK.md` | 환경 분석, 리스크 식별 및 대응 방안 |
| **Know-How** | **`docs/KNOWHOW.md`** | **⭐ 개발 중 발견된 문제와 해결 과정 (필독!)** |
| README | `README.md` | GitHub 공개용 프로젝트 설명 |

---

## 9. 빠른 시작 치트 시트

```bash
# 1. 의존성 설치
pip install -r requirements.txt

# 2. 서버 시작
python server.py

# 3. 브라우저 접속
# http://localhost:5000

# 4. 코드 수정 후의 핫 리로드
# Flask debug=True 이므로 server.py 수정 시 자동 재시작됩니다.
# static/ 파일(HTML, CSS, JS)은 브라우저 새로고침만 하면 됩니다.
```

---

> 이 문서는 프로젝트의 현재 상태를 완전히 파악하고 즉시 작업을 이어갈 수 있도록 작성되었습니다.
> 개발 중 발견된 기술적 문제와 해결 과정은 `docs/KNOWHOW.md`에 상세히 기록되어 있습니다.
> 질문이 있으면 `docs/` 폴더의 관련 문서를 참고하세요.
