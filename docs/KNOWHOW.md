# 🧠 Video Trim - 개발 Know-How 문서

> 이 문서는 Video Trim 개발 과정에서 발견된 **문제점**과 그 **해결 과정**을 기록한 문서입니다.
> 다른 AI 모델이나 개발자가 이 프로젝트를 이어받을 때, 동일한 문제를 반복하지 않도록 참고 자료로 활용됩니다.
> 
> 작성일: 2026-03-29

---

## 목차

1. [분할 파트 수 과다 계산 문제 (90% 보수적 전략의 함정)](#1-분할-파트-수-과다-계산-문제)
2. [브라우저 폴더 선택 다이얼로그 제한 문제](#2-브라우저-폴더-선택-다이얼로그-제한-문제)
3. [서버 재시작 후 폴링 404 무한 반복 문제](#3-서버-재시작-후-폴링-404-무한-반복-문제)
4. [Windows FFmpeg PATH 인식 실패 문제](#4-windows-ffmpeg-path-인식-실패-문제)
5. [⚠️ FFmpeg subprocess 파이프 데드락 문제 (★ 치명적 버그)](#5-ffmpeg-subprocess-파이프-데드락-문제)
6. [복수 파일 순차 분할 설계 결정 (v1.2)](#6-복수-파일-순차-분할-설계-결정)

---

## 1. 분할 파트 수 과다 계산 문제

### 📌 문제 요약

364.4MB 파일을 200MB 목표로 분할할 때, UI에서 **예상 파트 수가 3으로 표시**되는 문제.
사용자 기대치는 2파트(364.4 ÷ 200 = 1.82 → 올림 → 2)인데, 내부 보수적 전략(90%)이 예상 파트 수에까지 적용되어 3파트로 계산됨.

### 🔍 원인 분석

#### 이전 알고리즘 (v1.0)

```python
# server.py — calculate_split_points()
safe_target = target_size_bytes * 0.90   # ❌ 200MB → 180MB로 축소
avg_bytes_per_sec = file_size / duration
part_duration = safe_target / avg_bytes_per_sec  # 180MB 기준 파트 길이

# 이 길이로 while 루프를 돌며 분할 시점 생성
```

```javascript
// script.js — updateEstimatedParts()
const safeTarget = targetBytes * 0.90;  // ❌ 프론트엔드에서도 90% 적용
const parts = Math.ceil(state.fileInfo.file_size / safeTarget);
```

#### 계산 과정 (이전)

```
364.4MB ÷ (200MB × 0.90) = 364.4 ÷ 180 = 2.024...
→ Math.ceil(2.024) = 3 파트 ← 사용자 기대와 불일치!
```

#### 추가 문제: 마지막 파트가 극도로 작아지는 현상

90% 전략으로 파트 수가 3이 되면, 시간 기반 분할 시:
```
전체: 20분 1초 (1201초)
파트 길이: 1201 × (180/364.4) ≈ 593초

Part 1: 0초 ~ 593초
Part 2: 593초 ~ 1186초
Part 3: 1186초 ~ 1201초  ← 단 15초! (약 7MB)
```

마지막 파트가 불필요하게 작아져 **실용성이 떨어지는** 결과물이 생성됨.

### ✅ 해결 방법

#### 새 알고리즘 (v1.1) — "파트 수 먼저, 시간 균등 분배"

핵심 아이디어: **목표 용량으로 파트 수를 먼저 확정**한 뒤, **전체 시간을 균등 분배**.

```python
# server.py — calculate_split_points() 개선
import math

def calculate_split_points(duration, file_size, target_size_bytes):
    if file_size <= target_size_bytes or duration <= 0:
        return [0, duration]

    # 1단계: 파트 수 계산 (목표 용량 그대로, 90% 없음)
    num_parts = math.ceil(file_size / target_size_bytes)

    # 2단계: 시간을 균등 분배
    part_duration = duration / num_parts

    # 3단계: 분할 시점 생성
    split_points = [round(i * part_duration, 2) for i in range(num_parts)]
    split_points.append(round(duration, 2))

    return split_points
```

```javascript
// script.js — updateEstimatedParts() 개선
function updateEstimatedParts() {
    const targetBytes = targetMB * 1024 * 1024;
    // 90% 없이 정확한 파트 수 계산
    const parts = Math.ceil(state.fileInfo.file_size / targetBytes);
    dom.estimatedParts.textContent = parts;
}
```

#### 계산 과정 (개선 후)

```
364.4MB ÷ 200MB = 1.822...
→ Math.ceil(1.822) = 2 파트 ✅

시간 분배: 1201초 ÷ 2 = 600.5초
Part 1: 0초 ~ 600.5초 (약 182MB)
Part 2: 600.5초 ~ 1201초 (약 182MB)
→ 양쪽 모두 200MB 이하! ✅
```

### 💡 설계 교훈

> **"보수적 전략"은 결과의 안전성을 위해 사용하되, 사용자에게 보여주는 예상값에는 적용하지 않는다.**
> 
> 90% 전략의 원래 의도는 VBR(가변 비트레이트) 영상에서 파트가 목표를 초과하는 것을 방지하는 것이었지만,
> 이를 파트 수 계산에까지 적용한 것이 문제였다.
> 
> 새 알고리즘은 "시간 균등 분배"로 VBR 편차를 자연스럽게 흡수한다.
> 전체 영상의 평균 비트레이트가 `file_size / duration`이므로,
> 균등 분배된 각 파트의 예상 크기는 `file_size / num_parts`이다.
> 이 값은 반드시 `target_size_bytes` 이하이다 (ceil 연산의 결과이므로).

---

## 2. 브라우저 폴더 선택 다이얼로그 제한 문제

### 📌 문제 요약

사용자가 분할 결과물의 저장 경로를 지정할 때, **텍스트 입력**으로만 경로를 지정하는 것은 UX가 좋지 않음. 
브라우저에서 네이티브 폴더 선택 다이얼로그를 사용하고 싶지만, 웹 표준에서는 지원이 제한적.

### 🔍 원인 분석

- **File System Access API** (`showDirectoryPicker()`): Chrome/Edge에서 지원하지만, `localhost`에서는 보안 정책으로 **제한적**이거나 불안정
- **`<input type="file" webkitdirectory>`**: 폴더 선택은 가능하지만, 폴더 내 **파일 목록**을 반환하므로 목적에 맞지 않음
- 브라우저는 보안상 **로컬 파일 시스템 경로를 직접 반환하지 않음**

### ✅ 해결 방법 — 서버 사이드 tkinter 다이얼로그

이 프로젝트는 **로컬 전용 도구**이므로, 서버(Python) 측에서 네이티브 다이얼로그를 띄우는 것이 가능.

```python
# server.py — /api/browse-folder 엔드포인트
@app.route("/api/browse-folder", methods=["POST"])
def browse_folder():
    import tkinter as tk
    from tkinter import filedialog

    data = request.get_json() or {}
    initial_dir = data.get("initial_dir", str(OUTPUT_FOLDER))

    result = {"path": ""}

    def _open_dialog():
        """별도 스레드에서 tkinter 다이얼로그 실행 (Flask 블로킹 방지)"""
        root = tk.Tk()
        root.withdraw()          # Tk 윈도우 숨김
        root.wm_attributes('-topmost', 1)  # 최상위로 표시
        folder = filedialog.askdirectory(
            parent=root,
            title="분할 파일 저장 폴더 선택",
            initialdir=initial_dir
        )
        root.destroy()
        result["path"] = folder or ""

    # 별도 스레드에서 실행 (Flask 요청 처리 블로킹 방지)
    dialog_thread = threading.Thread(target=_open_dialog)
    dialog_thread.start()
    dialog_thread.join(timeout=300)

    if result["path"]:
        return jsonify({"path": result["path"], "selected": True})
    else:
        return jsonify({"path": "", "selected": False})
```

#### 핵심 설계 포인트

| 포인트 | 설명 |
|--------|------|
| **별도 스레드** | tkinter를 Flask 요청 처리 스레드에서 직접 실행하면 메인 루프 충돌 가능. 별도 Thread에서 실행 |
| **`root.withdraw()`** | Tk의 빈 윈도우가 표시되는 것을 방지 |
| **`wm_attributes('-topmost', 1)`** | 다이얼로그가 브라우저 뒤로 숨겨지는 것을 방지 |
| **`join(timeout=300)`** | 사용자가 다이얼로그를 닫지 않을 경우 무한 대기 방지 (5분 제한) |
| **tkinter 임포트 지연** | 함수 내에서 `import`하여 서버 시작 시 불필요한 로드 방지 |

#### 프론트엔드 연동

```javascript
async function browseFolderDialog() {
    dom.browseBtn.disabled = true;
    dom.browseBtn.textContent = '선택 중...';

    const currentPath = dom.outputPath.value.trim() || state.defaultPath;
    const res = await fetch('/api/browse-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_dir: currentPath }),
    });
    const data = await res.json();

    if (data.selected && data.path) {
        dom.outputPath.value = data.path;
        await validatePath();  // 선택 후 자동 검증 → 분할 버튼 즉시 활성화
    }

    dom.browseBtn.disabled = false;
    dom.browseBtn.textContent = '📁 선택';
}
```

### 💡 설계 교훈

> **로컬 전용 도구에서는 "브라우저의 보안 제약"을 서버 사이드로 우회할 수 있다.**
> 
> 일반적인 웹앱에서는 불가능한 접근이지만, `localhost`에서 실행되는 데스크톱 도구에서는
> Python의 tkinter 같은 네이티브 라이브러리를 활용하여 더 나은 UX를 제공할 수 있다.
> 
> 주의: 이 방식은 **원격 서버에서는 사용할 수 없다**. 서버와 사용자가 같은 PC에 있을 때만 유효.

---

## 3. 서버 재시작 후 폴링 404 무한 반복 문제

### 📌 문제 요약

서버를 재시작한 후에도 **이전 브라우저 탭이 열려 있으면**, `pollStatus()`가 이전 세션의 `task_id`로 계속 `/api/status/{old_task_id}`를 호출하여 **404 응답이 무한 반복**됨.

### 🔍 원인 분석

```
서버 로그 (실제 발생 케이스):
127.0.0.1 - [29/Mar/2026 11:11:43] "GET /api/status/cad3b283 HTTP/1.1" 404 -
127.0.0.1 - [29/Mar/2026 11:11:44] "GET /api/status/cad3b283 HTTP/1.1" 404 -
127.0.0.1 - [29/Mar/2026 11:11:45] "GET /api/status/cad3b283 HTTP/1.1" 404 -
... (500ms 간격으로 무한 반복)
```

원인:
1. `tasks{}` 딕셔너리는 **메모리에만 저장** → 서버 재시작 시 모든 작업 정보 소실
2. `pollStatus()`에 **404 응답 처리가 없었음** → 에러 상태에서 폴링이 멈추지 않음
3. `setInterval(pollStatus, 500)` → 인터벌이 해제되지 않으면 브라우저가 열려있는 동안 계속 실행

### ✅ 해결 방법

```javascript
async function pollStatus() {
    if (!state.taskId) return;

    try {
        const res = await fetch(`/api/status/${state.taskId}`);

        // ✅ 핵심 수정: 404 응답 처리
        if (res.status === 404) {
            stopPolling();
            showToast('작업 정보를 찾을 수 없습니다. 서버가 재시작되었을 수 있습니다.');
            dom.splitBtn.disabled = false;
            dom.splitBtn.innerHTML = '<span class="btn-icon">✂️</span> 분할 시작';
            dom.statusBar.classList.add('hidden');
            return;  // 더 이상 폴링하지 않음
        }

        const data = await res.json();
        updateStatusBar(data);

        if (data.status === 'completed') {
            stopPolling();
            showResults(data);
        } else if (data.status === 'error') {
            stopPolling();
            // ... 에러 UI 처리
        }
    } catch (error) {
        console.error('폴링 오류:', error);
    }
}
```

### 💡 설계 교훈

> **폴링 기반 아키텍처에서는 반드시 "종료 조건"을 완전히 정의해야 한다.**
> 
> 정상 종료 시나리오(completed, error)뿐 아니라 **비정상 시나리오**(서버 다운, 404, 네트워크 끊김)도
> 고려하여 폴링을 중단하는 로직이 필요하다.
> 
> 특히 `setInterval`은 명시적으로 `clearInterval`하지 않으면 **영원히 실행**되므로 주의.

---

## 4. Windows FFmpeg PATH 인식 실패 문제

### 📌 문제 요약

WinGet으로 FFmpeg를 설치한 후에도, Flask 서버에서 `FFmpeg를 찾을 수 없습니다!` 오류 발생.
특히 **새 터미널을 열지 않고** 기존 셸에서 서버를 실행한 경우 발생.

### 🔍 원인 분석

```bash
# WinGet 설치 후 FFmpeg 위치
C:\Users\{사용자}\AppData\Local\Microsoft\WinGet\Packages\
  Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\
    ffmpeg-8.1-full_build\bin\
      ffmpeg.exe
      ffprobe.exe
```

WinGet은 설치 후 PATH에 추가하지만, **현재 실행 중인 셸 세션에는 반영되지 않음**.
`shutil.which("ffmpeg")`는 현재 셸의 PATH만 검색하므로 실패.

### ✅ 해결 방법 — 다단계 자동 탐색

```python
def find_ffmpeg():
    # 1순위: 시스템 PATH
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path

    # 2순위: WinGet 패키지 디렉토리 직접 탐색
    if sys.platform == "win32":
        winget_base = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
        if winget_base.exists():
            for pkg_dir in winget_base.iterdir():
                if "FFmpeg" in pkg_dir.name or "ffmpeg" in pkg_dir.name:
                    for bin_dir in pkg_dir.rglob("bin"):
                        ffmpeg_exe = bin_dir / "ffmpeg.exe"
                        if ffmpeg_exe.exists():
                            # ✅ 발견 즉시 PATH에 동적 추가
                            os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
                            return str(ffmpeg_exe)

        # 3순위: 일반적인 설치 경로
        common_paths = [
            Path("C:/ffmpeg/bin/ffmpeg.exe"),
            Path("C:/Program Files/ffmpeg/bin/ffmpeg.exe"),
            Path("C:/Program Files (x86)/ffmpeg/bin/ffmpeg.exe"),
        ]
        for p in common_paths:
            if p.exists():
                os.environ["PATH"] = str(p.parent) + os.pathsep + os.environ.get("PATH", "")
                return str(p)

    return None
```

#### 핵심 포인트

| 포인트 | 설명 |
|--------|------|
| **`rglob("bin")`** | WinGet 패키지 내부의 정확한 디렉토리 구조를 몰라도 `bin` 폴더를 재귀적으로 탐색 |
| **PATH 동적 추가** | FFmpeg 발견 시 `os.environ["PATH"]`에 즉시 추가 → 이후 subprocess에서도 사용 가능 |
| **ffprobe 자동 탐색** | FFmpeg과 같은 디렉토리에 있을 것으로 예상하여 `Path(FFMPEG_PATH).parent / "ffprobe.exe"` |

### 💡 설계 교훈

> **외부 도구(FFmpeg)에 의존하는 프로젝트는 "설치됨"과 "사용 가능함"이 다를 수 있음을 고려해야 한다.**
> 
> WinGet, Homebrew, apt 등 패키지 매니저마다 설치 후 PATH 반영 시점이 다르다.
> 로컬 도구에서는 **다단계 탐색 로직**으로 사용자가 수동 설정 없이도 동작하게 만드는 것이 중요.

---

## 5. ⚠️ FFmpeg subprocess 파이프 데드락 문제 (★ 치명적 버그)

### 📌 문제 요약

동영상 분할을 시작하면 **진행률이 37% 부근에서 멈추고** 영원히 완료되지 않는 문제.
`-c copy` 모드로 364MB 파일을 분할할 때, 본래 **몇 초**면 끝나야 하는데 **8분 이상 경과**해도 Part 1이 완료되지 않음.

### 🔍 원인 분석

#### 이것은 Python subprocess의 전형적인 "파이프 데드락(Pipe Deadlock)" 문제입니다.

```python
# ❌ 문제의 코드 (server.py)
process = subprocess.Popen(
    cmd,
    stdout=subprocess.PIPE,    # stdout 파이프
    stderr=subprocess.PIPE,    # stderr도 파이프 ← ❗ 이것이 문제!  
    universal_newlines=True,
    encoding="utf-8",
    errors="replace"
)

# stdout만 읽음
for line in process.stdout:      # ← stdout 읽기 대기
    if line.startswith("out_time_us="):
        # 진행률 파싱...

process.wait()

if process.returncode != 0:
    stderr_output = process.stderr.read()  # ← stderr는 나중에 읽음
```

#### 데드락 발생 메커니즘

```
시간 순서:

1. FFmpeg 실행 시작
   ↓
2. FFmpeg이 stdout에 progress 정보 출력 (우리 코드가 읽음 → 정상 동작)
   FFmpeg이 stderr에 코덱 정보/경고 출력 (아무도 안 읽음 → 버퍼에 축적)
   ↓
3. stderr 파이프 버퍼 가득 찰 (Windows: 약 4~8KB)
   ↓
4. FFmpeg이 stderr에 더 쓰려고 하지만 버퍼가 차서 블록됨
   ↓
5. FFmpeg 전체가 멈춤 → stdout에도 더 이상 출력 안 함
   ↓
6. 우리 코드의 `for line in process.stdout`도 영원히 대기
   ↓
💥 데드락! (FFmpeg은 stderr 쓰기 대기, 우리는 stdout 읽기 대기)
```

#### 왜 37%에서 멈추는가?

FFmpeg은 실행 초기에 다량의 메타데이터를 stderr에 출력합니다:
```
Input #0, mov,mp4... from '....파일명.mp4':
  Metadata:
    major_brand     : isom
    ...
  Duration: 00:20:01.00, start: 0.000000, bitrate: 2427 kb/s
  Stream #0:0: Video: h264 ...
  Stream #0:1: Audio: aac ...
Stream mapping:
  Stream #0:0 -> #0:0 (copy)
  Stream #0:1 -> #0:1 (copy)
...
```

이 정보가 4~8KB 버퍼를 채우는 시점이 대략 전체 진행의 30~40% 지점에 해당.

### ✅ 해결 방법 — stderr 별도 스레드 드레인

```python
# ✅ 수정된 코드 (server.py)
process = subprocess.Popen(
    cmd,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    universal_newlines=True,
    encoding="utf-8",
    errors="replace"
)

# ✅ 핵심: stderr를 별도 스레드에서 동시에 읽어서 버퍼를 비움
stderr_lines = []
def _drain_stderr():
    for err_line in process.stderr:
        stderr_lines.append(err_line)
stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
stderr_thread.start()

# stdout에서 진행률 파싱 (기존과 동일)
for line in process.stdout:
    if line.startswith("out_time_us="):
        # 진행률 계산...

process.wait()
stderr_thread.join(timeout=5)  # stderr 스레드 종료 대기

if process.returncode != 0:
    raise Exception(f"FFmpeg 에러: {''.join(stderr_lines)}")
```

#### 동작 원리

```
수정 후 동작 흐름:

메인 스레드         stderr 드레인 스레드
    │                        │
    ├─ stdout 읽기           ├─ stderr 읽기 (동시 실행)
    │  for line in stdout:   │  for line in stderr:
    │    진행률 파싱          │    stderr_lines에 축적
    │                        │
    └─ process.wait()        └─ 자동 종료 (daemon)

→ stderr 버퍼가 지속적으로 비워지므로 FFmpeg이 멈추지 않음!
→ stdout 파싱도 정상적으로 진행!
```

### 💡 설계 교훈

> **Python의 `subprocess.Popen`에서 stdout과 stderr를 모두 PIPE로 잡을 때,**
> **반드시 두 파이프를 동시에 읽거나 `communicate()`를 사용해야 한다.**
>
> Python 공식 문서에도 다음과 같이 경고하고 있다:
>
> > *"Warning: Use `communicate()` rather than `.stdin.write`, `.stdout.read` or `.stderr.read`*
> > *to avoid deadlocks due to any of the other OS pipe buffers filling up and blocking the child process."*
> > — [Python docs: subprocess](https://docs.python.org/3/library/subprocess.html#subprocess.Popen.communicate)
>
> 하지만 `communicate()`는 프로세스 종료까지 대기하므로 **실시간 진행률 파싱에는 사용할 수 없다**.
> 이 경우 **별도 스레드로 stderr를 드레인**하는 것이 유일한 해결책이다.

### ⚠️ 이 문제가 다른 프로젝트에서도 발생할 수 있는 조건

| 조건 | 설명 |
|--------|------|
| `stdout=PIPE` + `stderr=PIPE` | 두 파이프 모두 사용 |
| 한쪽만 읽음 | stdout만 읽고 stderr는 나중에 읽거나 무시 |
| 자식 프로세스가 stderr에 많이 출력 | FFmpeg, ImageMagick, 기타 CLI 도구들 |
| Windows 환경 | 파이프 버퍼가 작음 (4~8KB vs Linux 64KB) → 더 빨리 데드락 발생 |

---

## 부록: 변경 이력 요약

| 날짜 | 버전 | 항목 | 변경 파일 |
|------|------|------|-----------|
| 2026-03-29 | v1.0 | 초기 구현 (90% 보수적 분할 전략) | `server.py`, `script.js` |
| 2026-03-29 | v1.1 | 네이티브 폴더 선택 다이얼로그 추가 | `server.py`, `script.js`, `index.html`, `style.css` |
| 2026-03-29 | v1.1 | 기본 저장 경로(output/) 자동 설정 | `server.py`, `script.js` |
| 2026-03-29 | v1.1 | 분할 알고리즘 개선 (균등 분배 방식) | `server.py`, `script.js` |
| 2026-03-29 | v1.1 | 파일명 패턴 변경 (`_part{n}` → `_{n}`) | `server.py` |
| 2026-03-29 | v1.1 | 폴링 404 무한 반복 방지 | `script.js` |
| 2026-03-29 | v1.1 | ⚠️ FFmpeg subprocess 파이프 데드락 수정 | `server.py` |
| 2026-03-29 | v1.2 | 복수 파일 순차 분할 기능 추가 | `script.js`, `index.html`, `style.css` |

---

## 6. 복수 파일 순차 분할 설계 결정 (v1.2)

### 📌 문제 요약

v1.1에서는 한 번에 하나의 파일만 분할할 수 있었음. 사용자가 여러 동영상을 분할해야 할 때 매번 수동으로 Step 1으로 돌아가서 파일을 선택하고 설정을 다시 입력해야 했음.

### 🔍 설계 대안 분석

#### 대안 A: 병렬 처리 (동시 업로드 + 동시 분할)

```
모든 파일을 동시에 업로드 → 모든 파일을 동시에 분할
```

- ❌ **제외 사유**: 디스크 I/O 병목, 대용량 파일 여러 개의 임시 업로드 용량 문제, FFmpeg 동시 실행 시 CPU 리소스 경합
- ❌ UI에서 여러 파일의 진행률을 동시에 표시하면 복잡도 증가

#### 대안 B: 전부 업로드 먼저 → 순차 분할

```
단계 1: 모든 파일 업로드 (임시 저장)
단계 2: 순차적으로 분할
```

- ❌ **제외 사유**: 대용량 파일 여러 개를 업로드하면 `uploads/` 폴더에 수 GB의 임시 파일이 축적됨
- ❌ 디스크 공간 부족 위험이 높음

#### 대안 C: 순차 처리 (업로드+분할 한 파일씩) ← ✅ 채택

```
File 1: 업로드 → 분할 → 임시파일 정리
File 2: 업로드 → 분할 → 임시파일 정리
...
```

- ✅ 임시 파일이 한 번에 하나만 존재 → 디스크 공간 최소화
- ✅ UI에서 하나의 진행률만 표시하면 되므로 단순
- ✅ 기존 단일 파일 처리 로직을 그대로 재활용 가능

### ✅ 구현 방법

#### 핵심 흐름 변경

v1.1의 흐름:
```
Step 1 (파일 선택) → 업로드 → Step 2 (설정) → 분할 시작 → 완료
```

v1.2의 흐름:
```
Step 1 (파일 큐 선택) → Step 2 (설정 입력) → "분할 시작"
→ processNextFile() → 업로드 → 분할 → 폴링 → 완료
→ onFileCompleted() → 다음 파일이 있으면 processNextFile() 재귀
→ 모두 완료 → showAllResults() → Step 3
```

#### 주요 변경점

| 항목 | v1.1 | v1.2 |
|------|------|------|
| Step 2 진입 시점 | 업로드 완료 후 | 업로드 전 (설정만 입력) |
| "분할 시작" 클릭 | 단일 파일 분할 | 큐 전체 순차 처리 |
| 에러 처리 | 중단 | 실패 파일 건너뛰고 다음 처리 |
| 결과 화면 | 단일 파일 결과 | 모든 파일 통합 결과 |

#### 에러 내성 설계

```javascript
// 업로드 또는 분할 실패 시:
// → 해당 파일의 상태를 'error'로 표시
// → state.queueIndex++ 후 processNextFile() 호출
// → 나머지 파일들은 정상 처리
// → 전부 실패하면 버튼 다시 활성화, 일부 성공하면 결과 표시
```

### 💡 설계 교훈

> **"큐 시스템은 에러에 대한 내성이 중요하다."**
>
> 복수 파일 처리에서 하나의 파일이 실패했다고 전체 큐를 중단하면 안 된다.
> 실패한 파일만 건너뛰고 나머지를 계속 처리하는 것이 사용자 경험 측면에서 훨씬 좋다.
>
> 또한, "설정 한 번 → 모든 파일 적용"이 공장식 패턴이다.
> 사용자가 파일마다 설정을 다시 입력하게 하면 복수 파일 처리의 의미가 없다.

---

> 이 문서는 개발 과정에서 축적된 경험을 기록합니다.
> 새로운 문제를 해결한 경우 이 문서에 항목을 추가해 주세요.
