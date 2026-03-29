# ✂️ Video Trim — 동영상 분할 도구

<p align="center">
  <strong>Google NotebookLM 업로드용 대용량 동영상 분할기</strong><br>
  200MB 제한을 넘는 동영상을 원하는 크기로 자동 분할합니다.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Flask-3.0+-000000?logo=flask&logoColor=white" alt="Flask">
  <img src="https://img.shields.io/badge/FFmpeg-8.x-007808?logo=ffmpeg&logoColor=white" alt="FFmpeg">
  <img src="https://img.shields.io/badge/version-v1.1-8b5cf6" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

---

## 📋 소개

**Video Trim**은 Google NotebookLM의 200MB 동영상 업로드 제한을 해결하기 위한 로컬 웹 도구입니다.

- 🎯 동영상을 **원하는 용량 이하**로 자동 분할
- ⚡ FFmpeg `-c copy` 무손실 복사로 **빠른 처리 속도**
- 📁 **네이티브 폴더 선택 다이얼로그**로 저장 경로를 직관적으로 지정
- 🛡️ **원본 파일은 절대 수정/삭제하지 않음**
- 📊 **실시간 스테이터스 바** — 진행률, 잔여 시간, 처리 속도 확인
- 🎨 **다크 네온 테마** — 퍼플/시안 그라데이션의 모던 UI

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 드래그 앤 드롭 업로드 | 파일을 끌어다 놓거나 클릭하여 선택 |
| 실시간 메타데이터 표시 | 파일 크기, 재생 시간, 해상도, 코덱 자동 분석 |
| 슬라이더 + 직접 입력 | 목표 용량을 세밀하게 조절 (10MB ~ 5000MB) |
| 📁 네이티브 폴더 선택 | 버튼 클릭으로 Windows 폴더 선택 다이얼로그 호출 |
| 기본 저장 경로 | 프로젝트 내 `output/` 폴더에 자동 저장 (변경 가능) |
| 무손실 분할 | FFmpeg `-c copy`로 재인코딩 없이 빠르게 분할 |
| 실시간 스테이터스 바 | 진행률 %, 현재 파트, 남은 시간, 처리 속도 표시 |
| 결과 카드 UI | 각 파트의 파일명, 크기, 시간 범위를 카드로 표시 |
| 폴더 열기 | 분할 완료 후 저장 폴더를 탐색기에서 바로 열기 |

---

## 🖥️ 스크린샷

### Step 1: 파일 업로드 (드래그 앤 드롭)
> 동영상 파일을 드래그 앤 드롭하거나 클릭하여 선택

### Step 2: 분할 설정 + 실시간 스테이터스 바
> 목표 용량 지정 → 📁 폴더 선택 (또는 직접 입력) → 분할 시작
> 진행률 %, 현재 파트, 남은 시간, 처리 속도를 실시간 확인

### Step 3: 완료 및 결과 확인
> 분할된 파트 목록 + 저장 폴더 바로 열기

---

## 🚀 빠른 시작

### 사전 요구 사항

| 항목 | 최소 버전 |
|------|-----------|
| Python | 3.10 이상 |
| FFmpeg | 7.0 이상 (8.x 권장) |

### 1. FFmpeg 설치 (미설치 시)

```bash
# Windows (WinGet)
winget install Gyan.FFmpeg

# macOS (Homebrew)
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg
```

### 2. 프로젝트 클론 및 의존성 설치

```bash
git clone https://github.com/your-username/video-trim.git
cd video-trim
pip install -r requirements.txt
```

### 3. 서버 실행

```bash
python server.py
```

```
==================================================
🎬 Video Trim - 동영상 분할 도구
==================================================
✅ FFmpeg 발견: C:\...\ffmpeg.exe
✅ FFprobe 발견: C:\...\ffprobe.exe
📁 업로드 임시 폴더: ...\uploads
🌐 서버 시작: http://localhost:5000
==================================================
```

### 4. 브라우저에서 접속

```
http://localhost:5000
```

---

## 📖 사용 방법

### Step 1: 파일 업로드
1. 브라우저에서 `http://localhost:5000` 접속
2. 동영상 파일을 **드래그 앤 드롭** 또는 **클릭하여 선택**
3. 지원 형식: `MP4`, `MKV`, `AVI`, `MOV`, `WebM`

### Step 2: 분할 설정
1. 업로드 완료 후 파일 정보(크기, 재생 시간, 해상도 등) 확인
2. **목표 용량** 설정 (슬라이더 또는 직접 입력, 기본값: 200MB)
3. **저장 경로** 확인 또는 변경:
   - 기본값: 프로젝트 내 `output/` 폴더 (자동 설정)
   - `📁 선택` 버튼으로 폴더 선택 다이얼로그 사용
   - 또는 경로를 직접 입력 후 `확인` 버튼으로 검증
4. `분할 시작` 클릭

### Step 3: 결과 확인
1. **스테이터스 바**에서 실시간 진행률 확인
   - 현재 처리 중인 파트 번호
   - 경과 시간 / 예상 잔여 시간
   - 처리 속도 (MB/s)
2. 분할 완료 후 결과 카드에서 각 파트 정보 확인
3. `폴더 열기` 버튼으로 저장 위치 바로 확인

### 출력 파일명
```
{원본파일명}_{순번}.{확장자}
예: 社会　第4回_1.mp4, 社会　第4回_2.mp4
```

---

## 🏗️ 프로젝트 구조

```
video-trim/
├── server.py              # Flask 백엔드 서버 (API + FFmpeg + tkinter 연동)
├── requirements.txt       # Python 의존성 (Flask)
├── .gitignore             # Git 제외 설정 (동영상, 업로드/출력 폴더 등)
├── static/
│   ├── index.html         # 메인 페이지 (3단계 워크플로우 UI)
│   ├── style.css          # 다크 네온 테마 스타일시트
│   └── script.js          # 프론트엔드 로직 (폴더 선택, 폴링 등)
├── docs/
│   ├── PRD.md             # 제품 요구사항 문서
│   ├── TDD.md             # 기술 설계 문서
│   ├── RISK_CHECK.md      # 리스크 분석 문서
│   ├── KNOWHOW.md         # 개발 Know-How (문제 해결 기록)
│   └── HANDOVER.md        # 인수인계 문서
├── output/                # 기본 분할 결과 저장 폴더 (자동 생성)
├── uploads/               # 업로드 임시 폴더 (자동 생성, 자동 정리)
└── README.md              # 본 문서
```

---

## 🔧 API 레퍼런스

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/` | 메인 페이지 |
| `POST` | `/api/upload` | 동영상 업로드 + 메타데이터 반환 |
| `POST` | `/api/split` | 분할 실행 (비동기) |
| `GET` | `/api/status/<task_id>` | 진행 상태 조회 |
| `POST` | `/api/validate-path` | 저장 경로 유효성 검증 |
| `POST` | `/api/browse-folder` | 네이티브 폴더 선택 다이얼로그 |
| `GET` | `/api/default-path` | 기본 저장 경로 조회 |
| `POST` | `/api/open-folder` | 탐색기에서 폴더 열기 |
| `DELETE` | `/api/cleanup/<task_id>` | 임시 파일 정리 |

---

## ⚙️ 기술 스택

| 영역 | 기술 | 역할 |
|------|------|------|
| 백엔드 | Python 3 + Flask | 웹 서버 & API |
| 동영상 처리 | FFmpeg + FFprobe | 분할 & 메타데이터 추출 |
| 폴더 선택 | tkinter (Python 내장) | 네이티브 폴더 선택 다이얼로그 |
| 프론트엔드 | HTML5 + Vanilla CSS + JS | 반응형 SPA UI |
| 디자인 | 다크 테마 + 네온 그라데이션 | 모던 글래스모피즘 |

---

## ⚠️ 주의 사항

- **무손실 복사 모드** (`-c copy`)는 키프레임 단위 분할이므로, 분할된 파트의 용량이 목표값과 약간 차이날 수 있습니다.
- **원본 파일**은 절대 수정하거나 삭제하지 않습니다. (읽기 전용 접근)
- **로컬 전용 도구**입니다. 외부 인터넷 연결 없이 동작합니다.
- **폴더 선택 다이얼로그**는 tkinter 기반으로, 서버가 실행 중인 PC에서만 동작합니다.

---

## 📄 라이선스

MIT License

---

## 🙋 기여

이슈 등록이나 Pull Request를 환영합니다!
