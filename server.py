# -*- coding: utf-8 -*-
"""
Video Trim - 동영상 분할 도구 서버
Google NotebookLM 업로드용 동영상 분할기

사용법: python server.py
"""

import os
import sys
import json
import uuid
import time
import math
import shutil
import subprocess
import threading
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, send_file

# ============================================================
# FFmpeg 경로 자동 탐색
# ============================================================
def find_ffmpeg():
    """FFmpeg 실행 파일 경로를 자동으로 탐색합니다."""
    # 1순위: 시스템 PATH에서 찾기
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path

    # 2순위: WinGet 설치 경로 탐색 (Windows)
    if sys.platform == "win32":
        winget_base = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
        if winget_base.exists():
            for pkg_dir in winget_base.iterdir():
                if "FFmpeg" in pkg_dir.name or "ffmpeg" in pkg_dir.name:
                    # ffmpeg-*-full_build/bin/ffmpeg.exe 패턴 탐색
                    for bin_dir in pkg_dir.rglob("bin"):
                        ffmpeg_exe = bin_dir / "ffmpeg.exe"
                        if ffmpeg_exe.exists():
                            # PATH에 추가
                            os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
                            return str(ffmpeg_exe)

        # 3순위: 일반적인 Windows 설치 경로들
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

# FFmpeg 경로 확인
FFMPEG_PATH = find_ffmpeg()
FFPROBE_PATH = None

if FFMPEG_PATH:
    # ffprobe도 같은 디렉토리에 있을 것으로 예상
    ffprobe_name = "ffprobe.exe" if sys.platform == "win32" else "ffprobe"
    probe_path = Path(FFMPEG_PATH).parent / ffprobe_name
    if probe_path.exists():
        FFPROBE_PATH = str(probe_path)
    else:
        FFPROBE_PATH = shutil.which("ffprobe")

    print(f"✅ FFmpeg 발견: {FFMPEG_PATH}")
    print(f"✅ FFprobe 발견: {FFPROBE_PATH}")
else:
    print("❌ FFmpeg를 찾을 수 없습니다!")
    print("   설치 방법: winget install Gyan.FFmpeg")
    sys.exit(1)

# ============================================================
# Flask 앱 설정
# ============================================================
app = Flask(__name__, static_folder="static")

# 업로드 폴더 설정 (임시)
UPLOAD_FOLDER = Path(__file__).parent / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

# 기본 출력 폴더 설정 (프로젝트 루트/output)
OUTPUT_FOLDER = Path(__file__).parent / "output"
OUTPUT_FOLDER.mkdir(exist_ok=True)

# 최대 업로드 크기: 10GB
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024 * 1024

# 작업 상태 저장소 (메모리)
tasks = {}

# ============================================================
# 유틸리티 함수
# ============================================================
def get_video_info(filepath):
    """FFprobe를 사용하여 동영상 메타데이터를 추출합니다."""
    cmd = [
        FFPROBE_PATH,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(filepath)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        raise Exception(f"FFprobe 오류: {result.stderr}")

    info = json.loads(result.stdout)
    fmt = info.get("format", {})

    # 비디오 스트림 정보 추출
    video_stream = None
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video":
            video_stream = stream
            break

    duration = float(fmt.get("duration", 0))
    file_size = int(fmt.get("size", 0))
    bit_rate = int(fmt.get("bit_rate", 0))

    width = int(video_stream.get("width", 0)) if video_stream else 0
    height = int(video_stream.get("height", 0)) if video_stream else 0
    codec = video_stream.get("codec_name", "unknown") if video_stream else "unknown"

    return {
        "duration": duration,
        "file_size": file_size,
        "bit_rate": bit_rate,
        "width": width,
        "height": height,
        "resolution": f"{width}x{height}",
        "codec": codec,
    }


def calculate_split_points(duration, file_size, target_size_bytes):
    """
    목표 용량에 맞춰 분할 시점(초)을 계산합니다.
    파트 수를 먼저 결정하고, 시간을 균등 분배합니다.
    """
    if file_size <= target_size_bytes or duration <= 0:
        return [0, duration]

    # 파트 수 계산 (목표 용량 기준)
    num_parts = math.ceil(file_size / target_size_bytes)

    # 각 파트에 시간을 균등 분배
    part_duration = duration / num_parts

    # 분할 시점 생성
    split_points = [round(i * part_duration, 2) for i in range(num_parts)]
    split_points.append(round(duration, 2))

    return split_points


def format_time(seconds):
    """초를 HH:MM:SS 형식으로 변환합니다."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def split_video_worker(task_id, input_path, output_dir, split_points, original_filename):
    """
    백그라운드 스레드에서 실행되는 동영상 분할 작업.
    FFmpeg -progress 옵션으로 실시간 진행률을 추적합니다.
    """
    task = tasks[task_id]
    task["status"] = "processing"
    task["start_time"] = time.time()
    total_parts = len(split_points) - 1
    task["total_parts"] = total_parts
    task["parts"] = []

    # 파일 확장자 추출
    stem = Path(original_filename).stem
    ext = Path(original_filename).suffix

    total_duration = split_points[-1] - split_points[0]
    processed_duration = 0

    try:
        for i in range(total_parts):
            start = split_points[i]
            end = split_points[i + 1]
            part_num = i + 1

            output_filename = f"{stem}_{part_num}{ext}"
            output_path = Path(output_dir) / output_filename

            task["current_part"] = part_num
            task["message"] = f"Part {part_num}/{total_parts} 분할 중..."

            # FFmpeg 명령어 구성
            cmd = [
                FFMPEG_PATH,
                "-y",  # 덮어쓰기 허용
                "-i", str(input_path),
                "-ss", str(start),
                "-to", str(end),
                "-c", "copy",  # 무손실 복사
                "-avoid_negative_ts", "make_zero",
                "-progress", "pipe:1",
                str(output_path)
            ]

            # FFmpeg 프로세스 실행
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                encoding="utf-8",
                errors="replace"
            )

            # ⚠️ stderr를 별도 스레드에서 수집 (파이프 데드락 방지)
            # stdout만 읽으면 stderr 버퍼가 가득 찰 때 FFmpeg가 멈추는 문제 발생
            stderr_lines = []
            def _drain_stderr():
                for err_line in process.stderr:
                    stderr_lines.append(err_line)
            stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
            stderr_thread.start()

            part_duration = end - start

            # stdout에서 진행률 파싱
            for line in process.stdout:
                line = line.strip()
                if line.startswith("out_time_us="):
                    try:
                        out_time_us = int(line.split("=")[1])
                        out_time_sec = out_time_us / 1_000_000
                        # 현재 파트의 진행률 계산
                        part_progress = min(out_time_sec / part_duration, 1.0) if part_duration > 0 else 0
                        # 전체 진행률 계산
                        overall = (processed_duration + out_time_sec) / total_duration
                        task["progress"] = min(int(overall * 100), 99)

                        # 처리 속도 및 예상 잔여 시간 계산
                        elapsed = time.time() - task["start_time"]
                        if elapsed > 0 and overall > 0:
                            total_estimated = elapsed / overall
                            remaining = max(total_estimated - elapsed, 0)
                            task["estimated_remaining_seconds"] = round(remaining)
                            # 처리 속도 (원본 시간 기준)
                            total_processed = processed_duration + out_time_sec
                            task["speed_mbps"] = round(
                                (total_processed / elapsed) * (task.get("file_size", 0) / total_duration) / (1024 * 1024),
                                1
                            ) if total_duration > 0 else 0
                    except (ValueError, ZeroDivisionError):
                        pass

            process.wait()
            stderr_thread.join(timeout=5)  # stderr 스레드 종료 대기

            if process.returncode != 0:
                raise Exception(f"FFmpeg 에러 (Part {part_num}): {''.join(stderr_lines)}")

            processed_duration += part_duration

            # 분할된 파일 정보 수집
            if output_path.exists():
                part_size = output_path.stat().st_size
                task["parts"].append({
                    "part_number": part_num,
                    "filename": output_filename,
                    "file_path": str(output_path),
                    "file_size": part_size,
                    "start_time": format_time(start),
                    "end_time": format_time(end),
                    "duration": round(end - start, 1),
                })

        # 완료
        task["status"] = "completed"
        task["progress"] = 100
        task["message"] = "분할 완료! 🎉"
        task["elapsed_time"] = round(time.time() - task["start_time"], 1)
        task["estimated_remaining_seconds"] = 0

    except Exception as e:
        task["status"] = "error"
        task["message"] = f"오류 발생: {str(e)}"
        task["progress"] = 0
        print(f"❌ 분할 오류 (task {task_id}): {e}")

    finally:
        # 업로드된 임시 파일 정리 (원본은 건드리지 않음)
        try:
            if Path(input_path).parent == UPLOAD_FOLDER:
                os.remove(input_path)
        except Exception:
            pass


# ============================================================
# API 라우트
# ============================================================

@app.route("/")
def index():
    """메인 페이지를 서빙합니다."""
    return send_from_directory("static", "index.html")


@app.route("/api/upload", methods=["POST"])
def upload_video():
    """동영상 파일을 업로드하고 메타데이터를 반환합니다."""
    if "file" not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "파일명이 비어있습니다."}), 400

    # 지원 형식 검증
    allowed_ext = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_ext:
        return jsonify({"error": f"지원하지 않는 형식: {ext}. 지원 형식: {', '.join(allowed_ext)}"}), 400

    # 고유 task_id 생성
    task_id = str(uuid.uuid4())[:8]

    # 파일 저장 (임시)
    save_path = UPLOAD_FOLDER / f"{task_id}_{file.filename}"
    file.save(str(save_path))

    try:
        # 메타데이터 추출
        info = get_video_info(save_path)

        # 작업 상태 초기화
        tasks[task_id] = {
            "task_id": task_id,
            "filename": file.filename,
            "file_path": str(save_path),
            "file_size": info["file_size"],
            "duration": info["duration"],
            "resolution": info["resolution"],
            "codec": info["codec"],
            "bit_rate": info["bit_rate"],
            "status": "uploaded",
            "progress": 0,
            "message": "업로드 완료",
        }

        return jsonify({
            "task_id": task_id,
            "filename": file.filename,
            "file_size": info["file_size"],
            "duration": info["duration"],
            "resolution": info["resolution"],
            "codec": info["codec"],
        })

    except Exception as e:
        # 실패 시 임시 파일 정리
        if save_path.exists():
            os.remove(save_path)
        return jsonify({"error": f"파일 분석 실패: {str(e)}"}), 500


@app.route("/api/split", methods=["POST"])
def split_video():
    """동영상 분할을 시작합니다."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "요청 데이터가 없습니다."}), 400

    task_id = data.get("task_id")
    target_size_mb = data.get("target_size_mb", 200)
    output_dir = data.get("output_dir", "")

    if not task_id or task_id not in tasks:
        return jsonify({"error": "유효하지 않은 task_id입니다."}), 400

    task = tasks[task_id]

    if task["status"] not in ("uploaded",):
        return jsonify({"error": f"현재 상태에서는 분할을 시작할 수 없습니다: {task['status']}"}), 400

    # 저장 경로 검증
    if not output_dir:
        return jsonify({"error": "저장 경로를 지정해 주세요."}), 400

    output_path = Path(output_dir)
    try:
        output_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return jsonify({"error": f"저장 경로 생성 실패: {str(e)}"}), 400

    if not os.access(str(output_path), os.W_OK):
        return jsonify({"error": f"저장 경로에 쓰기 권한이 없습니다: {output_dir}"}), 400

    # 목표 용량 MB → bytes
    target_size_bytes = target_size_mb * 1024 * 1024

    # 분할 시점 계산
    split_points = calculate_split_points(
        task["duration"],
        task["file_size"],
        target_size_bytes
    )

    total_parts = len(split_points) - 1
    task["output_dir"] = str(output_path)
    task["target_size_mb"] = target_size_mb

    # 백그라운드 스레드에서 분할 시작
    thread = threading.Thread(
        target=split_video_worker,
        args=(task_id, task["file_path"], str(output_path), split_points, task["filename"]),
        daemon=True
    )
    thread.start()

    return jsonify({
        "task_id": task_id,
        "status": "processing",
        "estimated_parts": total_parts,
        "output_dir": str(output_path),
        "message": f"분할 시작! 예상 {total_parts}개 파트",
    })


@app.route("/api/status/<task_id>")
def get_status(task_id):
    """분할 진행 상태를 반환합니다."""
    if task_id not in tasks:
        return jsonify({"error": "유효하지 않은 task_id입니다."}), 404

    task = tasks[task_id]

    elapsed = 0
    if task.get("start_time"):
        elapsed = round(time.time() - task["start_time"], 1)

    return jsonify({
        "task_id": task_id,
        "status": task.get("status", "unknown"),
        "progress": task.get("progress", 0),
        "current_part": task.get("current_part", 0),
        "total_parts": task.get("total_parts", 0),
        "elapsed_seconds": elapsed,
        "estimated_remaining_seconds": task.get("estimated_remaining_seconds", 0),
        "speed_mbps": task.get("speed_mbps", 0),
        "message": task.get("message", ""),
        "parts": task.get("parts", []),
        "output_dir": task.get("output_dir", ""),
    })


@app.route("/api/validate-path", methods=["POST"])
def validate_path():
    """저장 경로의 유효성을 검증합니다."""
    data = request.get_json()
    path_str = data.get("path", "")

    if not path_str:
        return jsonify({"valid": False, "message": "경로를 입력해 주세요."})

    path = Path(path_str)
    try:
        # 경로가 존재하지 않으면 생성 가능한지 확인
        if not path.exists():
            # 부모 디렉토리 확인
            parent = path.parent
            while not parent.exists() and parent != parent.parent:
                parent = parent.parent
            if parent.exists() and os.access(str(parent), os.W_OK):
                return jsonify({"valid": True, "message": "폴더가 자동으로 생성됩니다.", "path": str(path)})
            else:
                return jsonify({"valid": False, "message": "경로를 생성할 수 없습니다."})
        elif path.is_dir():
            if os.access(str(path), os.W_OK):
                return jsonify({"valid": True, "message": "유효한 경로입니다.", "path": str(path)})
            else:
                return jsonify({"valid": False, "message": "쓰기 권한이 없습니다."})
        else:
            return jsonify({"valid": False, "message": "파일이 아닌 폴더 경로를 입력해 주세요."})
    except Exception as e:
        return jsonify({"valid": False, "message": f"경로 확인 실패: {str(e)}"})


@app.route("/api/open-folder", methods=["POST"])
def open_folder():
    """탐색기에서 폴더를 엽니다. (Windows 전용)"""
    data = request.get_json()
    folder_path = data.get("path", "")

    if not folder_path or not Path(folder_path).exists():
        return jsonify({"error": "유효하지 않은 경로입니다."}), 400

    try:
        if sys.platform == "win32":
            os.startfile(folder_path)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/browse-folder", methods=["POST"])
def browse_folder():
    """네이티브 폴더 선택 다이얼로그를 엽니다. (tkinter 활용)"""
    import tkinter as tk
    from tkinter import filedialog

    data = request.get_json() or {}
    initial_dir = data.get("initial_dir", str(OUTPUT_FOLDER))

    # 초기 디렉토리가 존재하지 않으면 기본 출력 폴더 사용
    if not Path(initial_dir).exists():
        initial_dir = str(OUTPUT_FOLDER)

    result = {"path": ""}

    def _open_dialog():
        """별도 스레드에서 tkinter 다이얼로그 실행 (Flask 블로킹 방지)"""
        root = tk.Tk()
        root.withdraw()
        # 다이얼로그를 최상위로 표시
        root.wm_attributes('-topmost', 1)
        folder = filedialog.askdirectory(
            parent=root,
            title="분할 파일 저장 폴더 선택",
            initialdir=initial_dir
        )
        root.destroy()
        result["path"] = folder or ""

    # tkinter는 메인 스레드 외에서도 별도 Tk 인스턴스로 동작 가능
    dialog_thread = threading.Thread(target=_open_dialog)
    dialog_thread.start()
    dialog_thread.join(timeout=300)  # 최대 5분 대기

    if result["path"]:
        return jsonify({"path": result["path"], "selected": True})
    else:
        return jsonify({"path": "", "selected": False})


@app.route("/api/default-path")
def get_default_path():
    """기본 저장 경로를 반환합니다."""
    return jsonify({"path": str(OUTPUT_FOLDER)})


@app.route("/api/cleanup/<task_id>", methods=["DELETE"])
def cleanup(task_id):
    """작업 관련 임시 파일을 정리합니다."""
    if task_id in tasks:
        task = tasks[task_id]
        # 업로드 임시 파일 정리 (output은 사용자가 지정한 경로이므로 건드리지 않음)
        upload_file = task.get("file_path", "")
        if upload_file and Path(upload_file).exists() and Path(upload_file).parent == UPLOAD_FOLDER:
            try:
                os.remove(upload_file)
            except Exception:
                pass
        del tasks[task_id]
        return jsonify({"success": True, "message": "정리 완료"})

    return jsonify({"error": "task를 찾을 수 없습니다."}), 404


# ============================================================
# 서버 시작
# ============================================================
if __name__ == "__main__":
    print("=" * 50)
    print("🎬 Video Trim - 동영상 분할 도구")
    print("=" * 50)
    print(f"📁 업로드 임시 폴더: {UPLOAD_FOLDER}")
    print(f"🌐 서버 시작: http://localhost:5000")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=True)
