/**
 * Video Trim - 프론트엔드 로직
 * 동영상 업로드, 분할 설정, 진행률 추적, 결과 표시
 */

// ============================================================
// 상태 관리
// ============================================================
const state = {
    taskId: null,          // 현재 작업 ID
    fileInfo: null,        // 업로드된 파일 정보
    isPathValid: false,    // 저장 경로 유효 여부
    pollingTimer: null,    // 상태 폴링 타이머
    currentStep: 1,        // 현재 스텝 (1, 2, 3)
    defaultPath: '',       // 기본 저장 경로 (output 폴더)
};

// ============================================================
// DOM 요소 참조
// ============================================================
const dom = {
    // Step 1
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    uploadProgress: document.getElementById('uploadProgress'),
    uploadPercent: document.getElementById('uploadPercent'),
    uploadFill: document.getElementById('uploadFill'),

    // Step 2
    fileName: document.getElementById('fileName'),
    fileMeta: document.getElementById('fileMeta'),
    fileSize: document.getElementById('fileSize'),
    fileDuration: document.getElementById('fileDuration'),
    fileResolution: document.getElementById('fileResolution'),
    fileCodec: document.getElementById('fileCodec'),
    sizeSlider: document.getElementById('sizeSlider'),
    sizeInput: document.getElementById('sizeInput'),
    estimatedParts: document.getElementById('estimatedParts'),
    outputPath: document.getElementById('outputPath'),
    validatePathBtn: document.getElementById('validatePathBtn'),
    browseBtn: document.getElementById('browseBtn'),
    pathStatus: document.getElementById('pathStatus'),
    splitBtn: document.getElementById('splitBtn'),

    // 스테이터스 바
    statusBar: document.getElementById('statusBar'),
    statusTitle: document.getElementById('statusTitle'),
    statusPercent: document.getElementById('statusPercent'),
    statusFill: document.getElementById('statusFill'),
    statusPart: document.getElementById('statusPart'),
    statusElapsed: document.getElementById('statusElapsed'),
    statusRemaining: document.getElementById('statusRemaining'),
    statusSpeed: document.getElementById('statusSpeed'),

    // Step 3
    resultSummary: document.getElementById('resultSummary'),
    resultPath: document.getElementById('resultPath'),
    openFolderBtn: document.getElementById('openFolderBtn'),
    partsList: document.getElementById('partsList'),
    newFileBtn: document.getElementById('newFileBtn'),

    // 섹션 & 스텝
    sections: {
        1: document.getElementById('step1'),
        2: document.getElementById('step2'),
        3: document.getElementById('step3'),
    },
    steps: document.querySelectorAll('.step-indicator .step'),
    stepLines: document.querySelectorAll('.step-indicator .step-line'),
};

// ============================================================
// 유틸리티 함수
// ============================================================

/**
 * 바이트를 읽기 쉬운 크기로 변환
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
}

/**
 * 초를 HH:MM:SS 형식으로 변환
 */
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}시간 ${m}분 ${s}초`;
    if (m > 0) return `${m}분 ${s}초`;
    return `${s}초`;
}

/**
 * 초를 MM:SS 형식으로 변환 (짧은 형식)
 */
function formatTimeShort(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 토스트 알림 표시
 */
function showToast(message, type = 'error') {
    // 기존 토스트 제거
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
}

/**
 * 스텝 전환
 */
function goToStep(stepNum) {
    state.currentStep = stepNum;

    // 섹션 표시/숨김
    Object.entries(dom.sections).forEach(([num, section]) => {
        section.classList.toggle('hidden', parseInt(num) !== stepNum);
        if (parseInt(num) === stepNum) {
            section.classList.remove('hidden');
        }
    });

    // 스텝 인디케이터 업데이트
    dom.steps.forEach((step, i) => {
        const sNum = i + 1;
        step.classList.remove('active', 'completed');
        if (sNum === stepNum) step.classList.add('active');
        else if (sNum < stepNum) step.classList.add('completed');
    });

    // 스텝 라인 업데이트
    dom.stepLines.forEach((line, i) => {
        line.classList.toggle('active', i < stepNum - 1);
    });
}

// ============================================================
// Step 1: 파일 업로드
// ============================================================

// 드래그 앤 드롭 이벤트
dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropZone.classList.add('dragover');
});

dom.dropZone.addEventListener('dragleave', () => {
    dom.dropZone.classList.remove('dragover');
});

dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
});

// 클릭으로 파일 선택
dom.dropZone.addEventListener('click', () => {
    dom.fileInput.click();
});

dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

/**
 * 파일 업로드 처리
 */
async function handleFile(file) {
    // 확장자 확인
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const allowed = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
    if (!allowed.includes(ext)) {
        showToast(`지원하지 않는 형식: ${ext}. 지원 형식: ${allowed.join(', ')}`);
        return;
    }

    // 업로드 프로그레스 표시
    dom.uploadProgress.classList.remove('hidden');
    dom.uploadPercent.textContent = '0%';
    dom.uploadFill.style.width = '0%';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const xhr = new XMLHttpRequest();

        // 업로드 진행률 추적
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                dom.uploadPercent.textContent = `${percent}%`;
                dom.uploadFill.style.width = `${percent}%`;
            }
        });

        // 응답 처리
        const response = await new Promise((resolve, reject) => {
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    const data = JSON.parse(xhr.responseText);
                    reject(new Error(data.error || '업로드 실패'));
                }
            });
            xhr.addEventListener('error', () => reject(new Error('네트워크 오류')));
            xhr.open('POST', '/api/upload');
            xhr.send(formData);
        });

        // 성공
        state.taskId = response.task_id;
        state.fileInfo = response;

        // Step 2로 이동
        populateFileInfo(response);
        goToStep(2);
        updateEstimatedParts();

        // 기본 경로가 설정되어 있으면 자동 검증
        if (dom.outputPath.value && !state.isPathValid) {
            validatePath();
        }

    } catch (error) {
        showToast(error.message);
    } finally {
        dom.uploadProgress.classList.add('hidden');
    }
}

// ============================================================
// Step 2: 분할 설정
// ============================================================

/**
 * 파일 정보를 UI에 표시
 */
function populateFileInfo(info) {
    dom.fileName.textContent = info.filename;
    dom.fileMeta.textContent = `업로드 완료 • Task ID: ${info.task_id}`;
    dom.fileSize.textContent = formatSize(info.file_size);
    dom.fileDuration.textContent = formatDuration(info.duration);
    dom.fileResolution.textContent = info.resolution;
    dom.fileCodec.textContent = info.codec.toUpperCase();
}

/**
 * 예상 분할 파트 수 계산 및 표시
 */
function updateEstimatedParts() {
    if (!state.fileInfo) return;
    const targetMB = parseInt(dom.sizeInput.value) || 200;
    const targetBytes = targetMB * 1024 * 1024;
    // 파트 수 = 파일 크기 / 목표 용량 (올림)
    const parts = Math.ceil(state.fileInfo.file_size / targetBytes);
    dom.estimatedParts.textContent = parts;
}

// 슬라이더 ↔ 숫자 입력 동기화
dom.sizeSlider.addEventListener('input', () => {
    dom.sizeInput.value = dom.sizeSlider.value;
    updateEstimatedParts();
});

dom.sizeInput.addEventListener('input', () => {
    const val = parseInt(dom.sizeInput.value);
    if (val >= 10 && val <= 500) {
        dom.sizeSlider.value = val;
    }
    updateEstimatedParts();
});

// 저장 경로 검증
dom.validatePathBtn.addEventListener('click', validatePath);
dom.outputPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validatePath();
});

// 폴더 선택 다이얼로그
dom.browseBtn.addEventListener('click', browseFolderDialog);

async function browseFolderDialog() {
    try {
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
            // 선택된 경로 자동 검증
            await validatePath();
        }
    } catch (error) {
        showToast('폴더 선택 중 오류가 발생했습니다.');
    } finally {
        dom.browseBtn.disabled = false;
        dom.browseBtn.textContent = '📁 선택';
    }
}

async function validatePath() {
    const pathStr = dom.outputPath.value.trim();
    if (!pathStr) {
        dom.pathStatus.textContent = '경로를 입력해 주세요.';
        dom.pathStatus.className = 'path-status invalid';
        state.isPathValid = false;
        updateSplitButton();
        return;
    }

    try {
        const res = await fetch('/api/validate-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: pathStr }),
        });
        const data = await res.json();

        dom.pathStatus.textContent = data.message;
        dom.pathStatus.className = `path-status ${data.valid ? 'valid' : 'invalid'}`;
        state.isPathValid = data.valid;

        if (data.valid && data.path) {
            dom.outputPath.value = data.path;
        }
    } catch (error) {
        dom.pathStatus.textContent = '경로 확인 중 오류 발생';
        dom.pathStatus.className = 'path-status invalid';
        state.isPathValid = false;
    }

    updateSplitButton();
}

/**
 * 분할 버튼 활성화/비활성화
 */
function updateSplitButton() {
    dom.splitBtn.disabled = !state.isPathValid;
}

// 경로 입력 시 버튼 초기화
dom.outputPath.addEventListener('input', () => {
    state.isPathValid = false;
    dom.pathStatus.textContent = '';
    dom.pathStatus.className = 'path-status';
    updateSplitButton();
});

// 분할 시작
dom.splitBtn.addEventListener('click', startSplit);

async function startSplit() {
    if (!state.taskId || !state.isPathValid) return;

    const targetMB = parseInt(dom.sizeInput.value) || 200;
    const outputDir = dom.outputPath.value.trim();

    dom.splitBtn.disabled = true;
    dom.splitBtn.innerHTML = '<span class="btn-icon">⏳</span> 처리 시작 중...';

    try {
        const res = await fetch('/api/split', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task_id: state.taskId,
                target_size_mb: targetMB,
                output_dir: outputDir,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || '분할 시작 실패');
        }

        // 스테이터스 바 표시
        dom.statusBar.classList.remove('hidden');
        dom.statusTitle.textContent = `📹 ${state.fileInfo.filename} 분할 중...`;

        // 폴링 시작
        startPolling();

    } catch (error) {
        showToast(error.message);
        dom.splitBtn.disabled = false;
        dom.splitBtn.innerHTML = '<span class="btn-icon">✂️</span> 분할 시작';
    }
}

// ============================================================
// 진행률 폴링 (스테이터스 바)
// ============================================================

function startPolling() {
    if (state.pollingTimer) clearInterval(state.pollingTimer);
    state.pollingTimer = setInterval(pollStatus, 500);
}

function stopPolling() {
    if (state.pollingTimer) {
        clearInterval(state.pollingTimer);
        state.pollingTimer = null;
    }
}

async function pollStatus() {
    if (!state.taskId) return;

    try {
        const res = await fetch(`/api/status/${state.taskId}`);

        // 서버 재시작 등으로 task가 소실된 경우 (404)
        if (res.status === 404) {
            stopPolling();
            showToast('작업 정보를 찾을 수 없습니다. 서버가 재시작되었을 수 있습니다.');
            dom.splitBtn.disabled = false;
            dom.splitBtn.innerHTML = '<span class="btn-icon">✂️</span> 분할 시작';
            dom.statusBar.classList.add('hidden');
            return;
        }

        const data = await res.json();

        // 스테이터스 바 업데이트
        updateStatusBar(data);

        // 완료 또는 에러 시 폴링 중지
        if (data.status === 'completed') {
            stopPolling();
            showResults(data);
        } else if (data.status === 'error') {
            stopPolling();
            showToast(data.message || '분할 중 오류가 발생했습니다.');
            dom.splitBtn.disabled = false;
            dom.splitBtn.innerHTML = '<span class="btn-icon">✂️</span> 분할 시작';
            dom.statusBar.classList.add('hidden');
        }
    } catch (error) {
        console.error('폴링 오류:', error);
    }
}

function updateStatusBar(data) {
    const progress = data.progress || 0;

    dom.statusPercent.textContent = `${progress}%`;
    dom.statusFill.style.width = `${progress}%`;

    if (data.current_part && data.total_parts) {
        dom.statusPart.textContent = `Part ${data.current_part}/${data.total_parts} 처리 중`;
    }

    if (data.elapsed_seconds > 0) {
        dom.statusElapsed.textContent = formatTimeShort(data.elapsed_seconds);
    }

    if (data.estimated_remaining_seconds > 0) {
        dom.statusRemaining.textContent = `약 ${formatDuration(data.estimated_remaining_seconds)}`;
    } else if (progress > 0 && progress < 100) {
        dom.statusRemaining.textContent = '계산 중...';
    }

    if (data.speed_mbps > 0) {
        dom.statusSpeed.textContent = `${data.speed_mbps} MB/s`;
    }
}

// ============================================================
// Step 3: 결과 표시
// ============================================================

function showResults(data) {
    const parts = data.parts || [];
    const totalSize = parts.reduce((sum, p) => sum + p.file_size, 0);

    dom.resultSummary.textContent =
        `${parts.length}개 파트 • 총 ${formatSize(totalSize)} • 소요 시간: ${formatDuration(data.elapsed_seconds || 0)}`;

    dom.resultPath.textContent = data.output_dir || '';

    // 파트 리스트 생성
    dom.partsList.innerHTML = '';
    parts.forEach((part, index) => {
        const card = document.createElement('div');
        card.className = 'part-card';
        card.style.animationDelay = `${index * 0.08}s`;
        card.innerHTML = `
            <div class="part-number">${part.part_number}</div>
            <div class="part-info">
                <div class="part-name">${part.filename}</div>
                <div class="part-meta">${part.start_time} ~ ${part.end_time} (${formatDuration(part.duration)})</div>
            </div>
            <div class="part-size">${formatSize(part.file_size)}</div>
        `;
        dom.partsList.appendChild(card);
    });

    goToStep(3);
}

// 폴더 열기 버튼
dom.openFolderBtn.addEventListener('click', async () => {
    const path = dom.resultPath.textContent;
    if (!path) return;

    try {
        await fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
    } catch (error) {
        showToast('폴더 열기에 실패했습니다.');
    }
});

// 새 파일 처리 버튼
dom.newFileBtn.addEventListener('click', () => {
    // 상태 초기화
    state.taskId = null;
    state.fileInfo = null;
    state.isPathValid = false;

    // UI 초기화
    dom.fileInput.value = '';
    dom.sizeSlider.value = 200;
    dom.sizeInput.value = 200;
    dom.outputPath.value = '';
    dom.pathStatus.textContent = '';
    dom.pathStatus.className = 'path-status';
    dom.splitBtn.disabled = true;
    dom.splitBtn.innerHTML = '<span class="btn-icon">✂️</span> 분할 시작';
    dom.statusBar.classList.add('hidden');
    dom.partsList.innerHTML = '';

    // 기본 저장 경로로 리셋
    dom.outputPath.value = state.defaultPath;

    goToStep(1);
});

// ============================================================
// 초기화: 기본 저장 경로 로드
// ============================================================
async function initDefaultPath() {
    try {
        const res = await fetch('/api/default-path');
        const data = await res.json();
        if (data.path) {
            state.defaultPath = data.path;
            dom.outputPath.value = data.path;
        }
    } catch (error) {
        console.error('기본 경로 로드 실패:', error);
    }
}

// 초기 상태
goToStep(1);
initDefaultPath();
