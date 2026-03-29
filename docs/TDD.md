# 📐 Video Trim - 기술 설계 문서 (TDD)

> 버전: v1.1 | 최종 업데이트: 2026-03-29

---

## 1. 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                        브라우저 (Chrome/Edge)                 │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ index.html│  │   style.css  │  │      script.js         │ │
│  │ (구조)    │  │ (다크테마)    │  │ (업로드·폴링·UI갱신)    │ │
│  └──────────┘  └──────────────┘  └────────────────────────┘ │
│        │ XHR Upload      │ Fetch (JSON)     │ Polling 500ms │
└────────┼─────────────────┼─────────────────┼────────────────┘
         ▼                 ▼                 ▼
┌──────────────────────────────────────────────────────────────┐
│                    Flask 서버 (server.py)                     │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ /api/     │  │ tasks{}      │  │ split_video_worker()   │ │
│  │ upload    │  │ (메모리 저장) │  │ (백그라운드 Thread)     │ │
│  │ split     │  │              │  │                        │ │
│  │ status    │  │              │  │  FFmpeg subprocess     │ │
│  │ validate  │  │              │  │  stdout: progress 파싱  │ │
│  │ browse    │  │              │  │  stderr: 별도 스레드     │ │
│  │ default   │  │              │  │  (데드락 방지)          │ │
│  └──────────┘  └──────────────┘  └────────────────────────┘ │
│        │                                    │               │
└────────┼────────────────────────────────────┼───────────────┘
         ▼                                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  uploads/    │  │   output/    │  │ 사용자 지정 폴더  │
│  (임시 저장) │  │ (기본 저장)   │  │ (분할 결과 저장)   │
│  자동 정리   │  │ 프로젝트 내  │  │ 원본 보존         │
└──────────────┘  └──────────────┘  └──────────────────┘
```

---

## 2. 핵심 모듈 설명

### 2.1 server.py (589줄)

단일 파일 백엔드. 아래 주요 블록으로 구성됩니다.

| 블록 | 줄 범위 | 설명 |
|------|---------|------|
| FFmpeg 자동 탐색 | L23-75 | `find_ffmpeg()` — PATH → WinGet → 일반 경로 순서로 탐색 |
| Flask 앱 설정 | L77-94 | 업로드 폴더, 기본 출력 폴더(output/), 최대 크기(10GB), 작업 상태 딕셔너리 |
| 유틸리티 함수 | L99-170 | `get_video_info()`, `calculate_split_points()`, `format_time()` |
| 분할 워커 | L173-295 | `split_video_worker()` — 백그라운드 Thread, FFmpeg `-progress` 파싱, stderr 드레인 |
| API 라우트 | L298-576 | 9개 엔드포인트 |
| 서버 시작 | L579-589 | `app.run()` with debug=True |

### 2.2 static/script.js (589줄, 주요 함수)

| 함수 | 역할 |
|------|------|
| `handleFile(file)` | XHR로 파일 업로드 + 진행률 표시 + 기본 경로 자동 검증 |
| `validatePath()` | 서버에 저장 경로 유효성 검증 요청 |
| `browseFolderDialog()` | 네이티브 폴더 선택 다이얼로그 호출 + 자동 검증 |
| `initDefaultPath()` | 앱 시작 시 기본 저장 경로(output/) 로드 |
| `updateEstimatedParts()` | 목표 용량 ÷ 파일 크기로 정확한 파트 수 계산 |
| `startSplit()` | 분할 API 호출 + 폴링 시작 |
| `pollStatus()` | 500ms 간격 상태 조회 + 404 안전 가드 |
| `updateStatusBar(data)` | 스테이터스 바 UI 실시간 갱신 |
| `showResults(data)` | 분할 결과 카드 동적 생성 |
| `goToStep(n)` | 3단계 UI 전환 애니메이션 |

### 2.3 static/style.css (977줄, 주요 디자인 시스템)

| 토큰 | 값 | 용도 |
|------|----|------|
| `--bg-primary` | `#0a0a14` | 최상위 배경 |
| `--accent-purple` | `#8b5cf6` | 기본 포인트 컬러 |
| `--accent-cyan` | `#06b6d4` | 보조 포인트 컬러 (폴더 선택 버튼) |
| `--gradient-primary` | purple → cyan | 버튼·강조 그라데이션 |
| `--radius-lg` | `16px` | 카드·컨테이너 둥글기 |

---

## 3. 데이터 흐름

### 3.1 업로드 → 분할 → 완료 흐름

```
[사용자]
   │  1. 파일 드래그 앤 드롭
   ▼
[script.js] handleFile()
   │  2. XHR POST /api/upload (multipart/form-data)
   ▼
[server.py] upload_video()
   │  3. uploads/ 폴더에 임시 저장
   │  4. FFprobe로 메타데이터 추출
   │  5. tasks{} 딕셔너리에 task 등록
   │  6. JSON 응답 (task_id, 파일정보)
   ▼
[script.js] populateFileInfo() + validatePath()
   │  7. Step 2 UI 표시 (파일 정보 + 설정)
   │  7b. 기본 저장 경로 자동 검증
   │  8. 사용자가 용량·경로 설정 후 "분할 시작"
   │     (📁 선택 버튼으로 네이티브 폴더 다이얼로그 사용 가능)
   ▼
[script.js] startSplit()
   │  9. POST /api/split (task_id, target_size_mb, output_dir)
   ▼
[server.py] split_video()
   │  10. calculate_split_points() — 파트 수 확정 + 시간 균등 분배
   │  11. threading.Thread로 split_video_worker() 시작
   │  12. 즉시 JSON 응답 (status: processing)
   ▼
[split_video_worker] (백그라운드)
   │  13. stderr 드레인 스레드 시작 (파이프 데드락 방지)
   │  14. 각 파트별 FFmpeg -c copy -progress pipe:1 실행
   │  15. stdout에서 out_time_us 파싱 → tasks{} 갱신
   │  16. 모든 파트 완료 → status: completed
   ▼
[script.js] pollStatus() (500ms 간격)
   │  17. GET /api/status/<task_id>
   │  17b. 404 응답 시 폴링 중단 (서버 재시작 대응)
   │  18. updateStatusBar() — 진행률·잔여시간·속도 갱신
   │  19. status === "completed" → showResults()
   ▼
[사용자]
   │  20. Step 3: 결과 확인 + 폴더 열기
```

### 3.2 진행률 계산 공식

```
전체 진행률 = (이전 파트 총 duration + 현재 파트 out_time_sec) / 전체 duration × 100

예상 잔여 시간 = (경과 시간 / 전체 진행률) - 경과 시간

처리 속도(MB/s) = (처리된 시간 / 경과 시간) × (파일 크기 / 전체 duration) / 1MB
```

---

## 4. 분할 알고리즘

### 4.1 균등 분배 전략 (v1.1)

```python
import math

num_parts = math.ceil(file_size / target_size_bytes)  # 파트 수 확정
part_duration = duration / num_parts                   # 시간 균등 분배
split_points = [round(i * part_duration, 2) for i in range(num_parts)]
split_points.append(round(duration, 2))
```

> ⚠️ 이전 v1.0의 90% 보수적 전략은 파트 수 과다 계산 문제가 있어 제거됨.
> 자세한 분석은 `docs/KNOWHOW.md` 항목 1 참조.

### 4.2 키프레임 분할

- FFmpeg `-c copy` 모드는 키프레임(I-frame) 단위로만 정확한 분할 가능
- `-ss` (시작) + `-to` (종료) 옵션으로 시간 지정
- `-avoid_negative_ts make_zero` — 타임스탬프 보정

### 4.3 출력 파일명 규칙

```
{원본파일명}_{순번}.{확장자}
예: 社会　第4回_1.mp4, 社会　第4回_2.mp4
```

---

## 5. FFmpeg 자동 탐색 로직

```
1순위: shutil.which("ffmpeg")     ← 시스템 PATH
2순위: WinGet 패키지 디렉토리 탐색  ← %LOCALAPPDATA%\Microsoft\WinGet\Packages\*FFmpeg*
3순위: 일반 설치 경로              ← C:\ffmpeg\bin, C:\Program Files\ffmpeg\bin
실패 시: 에러 메시지 출력 + sys.exit(1)
```

탐색 성공 시 FFmpeg의 `bin/` 디렉토리를 `os.environ["PATH"]`에 동적 추가합니다.

---

## 6. subprocess 파이프 데드락 방지

> ⚠️ 이 프로젝트에서 발견된 **가장 치명적인 버그**. 자세한 내용은 `docs/KNOWHOW.md` 항목 5 참조.

```python
# FFmpeg 프로세스 실행 시 반드시 stderr를 별도 스레드에서 드레인
stderr_lines = []
def _drain_stderr():
    for err_line in process.stderr:
        stderr_lines.append(err_line)
stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
stderr_thread.start()

# stdout에서 진행률 파싱 (메인 스레드)
for line in process.stdout:
    # ... 진행률 파싱

process.wait()
stderr_thread.join(timeout=5)
```

---

## 7. 작업 상태 머신

```
uploaded → processing → completed
                     ↘ error
```

| 상태 | 설명 |
|------|------|
| `uploaded` | 파일 업로드 완료, 메타데이터 추출됨. 분할 대기 |
| `processing` | 백그라운드 스레드에서 FFmpeg 실행 중 |
| `completed` | 모든 파트 분할 완료 |
| `error` | FFmpeg 오류 또는 기타 예외 발생 |

---

## 8. 보안 및 안전성

| 항목 | 대책 |
|------|------|
| 원본 보존 | 원본 파일 읽기 전용 접근, 수정/삭제 불가 |
| 임시 파일 | 분할 완료 후 uploads/ 내 임시 파일 자동 삭제 |
| 경로 검증 | 저장 경로의 존재 여부 + 쓰기 권한 사전 검증 |
| 폴더 선택 | tkinter 네이티브 다이얼로그로 유효한 경로만 선택 가능 |
| 파일 형식 | 확장자 화이트리스트 (mp4, mkv, avi, mov, webm) |
| 업로드 크기 | Flask MAX_CONTENT_LENGTH = 10GB |

---

## 9. 향후 확장 포인트

| 영역 | 내용 | 난이도 |
|------|------|--------|
| 재인코딩 모드 | `-c copy` 대신 재인코딩으로 정확한 용량 분할 | 중 |
| 시간 기준 분할 | 용량 외에 시간 단위(예: 30분)로 분할 | 하 |
| 복수 파일 처리 | 여러 파일 일괄 업로드 + 순차 처리 | 중 |
| 작업 이력 | SQLite로 과거 작업 이력 저장 | 중 |
| 크로스 플랫폼 | macOS/Linux 폴더 열기 지원 | 하 |
| 파트 용량 검증 | 분할 후 각 파트가 목표 이하인지 자동 검증 | 하 |

---

## 문서 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| v1.0 | 2026-03-29 | 초안 작성 |
| v1.1 | 2026-03-29 | 분할 알고리즘 개선, 파이프 데드락 수정, 폴더 선택, 파일명 규칙, 폴링 가드 반영 |
