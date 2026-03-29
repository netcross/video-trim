/**
 * Video Trim - 프론트엔드 로직
 * 복수 파일 업로드, 순차 분할, 진행률 추적, 결과 표시
 */

// ============================================================
// 상태 관리
// ============================================================
const state = {
    taskId: null,          // 현재 작업 ID
    fileInfo: null,        // 현재 처리 중인 파일 정보
    isPathValid: false,    // 저장 경로 유효 여부
    pollingTimer: null,    // 상태 폴링 타이머
    currentStep: 1,        // 현재 스텝 (1, 2, 3)
    defaultPath: '',       // 기본 저장 경로 (output 폴더)

    // 복수 파일 큐
    fileQueue: [],         // 대기 중인 File 객체 배열
    queueIndex: 0,         // 현재 처리 중인 파일 인덱스
    allResults: [],        // 모든 파일의 분할 결과 배열
    isProcessingQueue: false, // 큐 처리 중 여부
};

// ============================================================
// DOM 요소 참조
// ============================================================
const dom = {
    // Step 1
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    uploadProgress: document.getElementById('uploadProgress'),
    uploadTitle: document.getElementById('uploadTitle'),
    uploadPercent: document.getElementById('uploadPercent'),
    uploadFill: document.getElementById('uploadFill'),

    // 파일 큐
    fileQueue: document.getElementById('fileQueue'),
    fileQueueCount: document.getElementById('fileQueueCount'),
    fileQueueList: document.getElementById('fileQueueList'),
    clearQueueBtn: document.getElementById('clearQueueBtn'),
    startQueueBtn: document.getElementById('startQueueBtn'),

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

    // 큐 진행
    queueProgress: document.getElementById('queueProgress'),
    queueCurrent: document.getElementById('queueCurrent'),
    queueTotal: document.getElementById('queueTotal'),
    queueFill: document.getElementById('queueFill'),
    queueFileName: document.getElementById('queueFileName'),

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
// Step 1: 파일 선택 (복수 파일 큐)
// ============================================================

// 허용 확장자 체크
function isAllowedFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return ['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext);
}

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
    const files = Array.from(e.dataTransfer.files).filter(isAllowedFile);
    if (files.length > 0) addFilesToQueue(files);
});

// 클릭으로 파일 선택
dom.dropZone.addEventListener('click', () => {
    dom.fileInput.click();
});

dom.fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(isAllowedFile);
    if (files.length > 0) addFilesToQueue(files);
    dom.fileInput.value = ''; // 동일 파일 재선택 가능하도록 리셋
});

/**
 * 파일 큐에 추가
 */
function addFilesToQueue(files) {
    for (const file of files) {
        // 이미 큐에 같은 이름+크기의 파일이 있으면 건너뛰기
        const isDuplicate = state.fileQueue.some(
            f => f.name === file.name && f.size === file.size
        );
        if (!isDuplicate) {
            state.fileQueue.push(file);
        }
    }
    renderFileQueue();
}

/**
 * 파일 큐 UI 렌더링
 */
function renderFileQueue() {
    const count = state.fileQueue.length;
    dom.fileQueueCount.textContent = count;

    if (count === 0) {
        dom.fileQueue.classList.add('hidden');
        return;
    }

    dom.fileQueue.classList.remove('hidden');
    dom.fileQueueList.innerHTML = '';

    // 전체 큐 용량 합산
    const totalSize = state.fileQueue.reduce((sum, f) => sum + f.size, 0);

    state.fileQueue.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-queue-item';
        item.innerHTML = `
            <span class="queue-file-icon">📹</span>
            <span class="queue-file-name">${file.name}</span>
            <span class="queue-file-size">${formatSize(file.size)}</span>
            <button class="queue-remove-btn" data-index="${index}" title="제거">✕</button>
        `;
        dom.fileQueueList.appendChild(item);
    });

    // 큐 하단 요약 표시 업데이트
    const summaryEl = document.getElementById('queueSummary');
    if (summaryEl) {
        summaryEl.textContent = `총 ${count}개 파일 • ${formatSize(totalSize)}`;
    }

    // 삭제 버튼 이벤트
    dom.fileQueueList.querySelectorAll('.queue-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            state.fileQueue.splice(idx, 1);
            renderFileQueue();
        });
    });
}

// 전체 삭제 버튼
dom.clearQueueBtn.addEventListener('click', () => {
    state.fileQueue = [];
    renderFileQueue();
});

// 분할 설정으로 이동 버튼 — 업로드 없이 Step 2로 이동
dom.startQueueBtn.addEventListener('click', () => {
    if (state.fileQueue.length === 0) return;

    // Step 2로 이동 (업로드 없이 설정만 표시)
    showQueueSettingsView();
    goToStep(2);
});

/**
 * 복수 파일 큐의 설정 화면 표시 (업로드 전)
 */
function showQueueSettingsView() {
    const count = state.fileQueue.length;
    const totalSize = state.fileQueue.reduce((sum, f) => sum + f.size, 0);

    // 파일 정보 카드에 큐 요약 표시
    dom.fileName.textContent = count === 1
        ? state.fileQueue[0].name
        : `${count}개 파일 일괄 분할`;
    dom.fileMeta.textContent = count === 1
        ? '파일 크기 분석 중... (분할 시작 시 업로드됩니다)'
        : `총 ${formatSize(totalSize)} • 순차적으로 업로드 & 분할됩니다`;

    // 복수 파일인 경우 대표 정보 표시
    dom.fileSize.textContent = formatSize(totalSize);
    dom.fileDuration.textContent = '-';
    dom.fileResolution.textContent = '-';
    dom.fileCodec.textContent = '-';

    // 큐 파일 리스트를 Step 2에도 표시
    updateStep2FileList();

    // 예상 파트 수 — 단일 파일이면 대략 계산, 복수면 '업로드 후 확인'
    if (count === 1) {
        const targetMB = parseInt(dom.sizeInput.value) || 200;
        const targetBytes = targetMB * 1024 * 1024;
        const parts = Math.ceil(state.fileQueue[0].size / targetBytes);
        dom.estimatedParts.textContent = `약 ${parts}`;
    } else {
        const targetMB = parseInt(dom.sizeInput.value) || 200;
        const targetBytes = targetMB * 1024 * 1024;
        let totalParts = 0;
        state.fileQueue.forEach(f => {
            totalParts += Math.ceil(f.size / targetBytes);
        });
        dom.estimatedParts.textContent = `약 ${totalParts} (${count}개 파일)`;
    }

    // 기본 경로 설정 및 검증
    if (dom.outputPath.value && !state.isPathValid) {
        validatePath();
    }
}

/**
 * Step 2에 파일 큐 리스트를 표시
 */
function updateStep2FileList() {
    const container = document.getElementById('step2FileList');
    if (!container) return;

    container.innerHTML = '';

    if (state.fileQueue.length <= 1) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    state.fileQueue.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'step2-file-item';
        item.setAttribute('data-queue-index', index);
        item.innerHTML = `
            <span class="step2-file-num">${index + 1}</span>
            <span class="step2-file-name">${file.name}</span>
            <span class="step2-file-size">${formatSize(file.size)}</span>
            <span class="step2-file-status" id="step2FileStatus_${index}">⏳ 대기</span>
        `;
        container.appendChild(item);
    });
}

// ============================================================
// Step 2: 분할 설정
// ============================================================

/**
 * 파일 정보를 UI에 표시 (업로드 후 실제 정보로 업데이트)
 */
function populateFileInfo(info) {
    dom.fileName.textContent = info.filename;
    const queueText = state.fileQueue.length > 1
        ? `파일 ${state.queueIndex + 1}/${state.fileQueue.length}`
        : `Task ID: ${info.task_id}`;
    dom.fileMeta.textContent = `업로드 완료 • ${queueText}`;
    dom.fileSize.textContent = formatSize(info.file_size);
    dom.fileDuration.textContent = formatDuration(info.duration);
    dom.fileResolution.textContent = info.resolution;
    dom.fileCodec.textContent = info.codec.toUpperCase();
}

/**
 * 예상 분할 파트 수 계산 및 표시
 */
function updateEstimatedParts() {
    const targetMB = parseInt(dom.sizeInput.value) || 200;
    const targetBytes = targetMB * 1024 * 1024;

    if (state.fileInfo) {
        // 업로드 후 실제 정보가 있으면 정확한 파트 수 표시
        const parts = Math.ceil(state.fileInfo.file_size / targetBytes);
        dom.estimatedParts.textContent = parts;
    } else if (state.fileQueue.length > 0) {
        // 업로드 전이면 파일 크기로 대략 계산
        if (state.fileQueue.length === 1) {
            const parts = Math.ceil(state.fileQueue[0].size / targetBytes);
            dom.estimatedParts.textContent = `약 ${parts}`;
        } else {
            let totalParts = 0;
            state.fileQueue.forEach(f => {
                totalParts += Math.ceil(f.size / targetBytes);
            });
            dom.estimatedParts.textContent = `약 ${totalParts} (${state.fileQueue.length}개 파일)`;
        }
    }
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

// ============================================================
// 분할 시작: 큐 전체를 순차적으로 업로드 + 분할
// ============================================================
dom.splitBtn.addEventListener('click', startQueueProcessing);

/**
 * 큐 전체 처리 시작 (핵심 함수!)
 * 1. 설정값(용량, 경로) 확정
 * 2. 각 파일에 대해: 업로드 → 분할 → 완료 대기 → 다음 파일
 */
async function startQueueProcessing() {
    if (!state.isPathValid || state.fileQueue.length === 0) return;

    state.isProcessingQueue = true;
    state.queueIndex = 0;
    state.allResults = [];

    // 분할 버튼 비활성화
    dom.splitBtn.disabled = true;
    dom.splitBtn.innerHTML = '<span class="btn-icon">⏳</span> 처리 중...';

    // 복수 파일인 경우 큐 진행 표시
    if (state.fileQueue.length > 1) {
        dom.queueProgress.classList.remove('hidden');
        dom.queueTotal.textContent = state.fileQueue.length;
        dom.queueCurrent.textContent = '0';
        dom.queueFill.style.width = '0%';
        if (dom.queueFileName) {
            dom.queueFileName.textContent = state.fileQueue[0].name;
        }
    }

    // 첫 번째 파일부터 처리 시작
    await processNextFile();
}

/**
 * 다음 파일 처리 (업로드 + 분할)
 */
async function processNextFile() {
    const queueIndex = state.queueIndex;
    const file = state.fileQueue[queueIndex];
    if (!file) {
        // 모든 파일 처리 완료
        state.isProcessingQueue = false;
        showAllResults();
        return;
    }

    // 큐 진행 UI 업데이트
    if (state.fileQueue.length > 1) {
        dom.queueCurrent.textContent = state.allResults.length;
        dom.queueFill.style.width = `${(state.allResults.length / state.fileQueue.length) * 100}%`;
        if (dom.queueFileName) {
            dom.queueFileName.textContent = file.name;
        }
    }

    // Step 2 파일 리스트에서 현재 파일 하이라이트
    updateStep2FileListStatus(queueIndex, 'processing');

    // 1단계: 업로드
    try {
        dom.uploadProgress.classList.remove('hidden');
        dom.uploadTitle.textContent = state.fileQueue.length > 1
            ? `📤 파일 업로드 중... (${queueIndex + 1}/${state.fileQueue.length})`
            : '📤 파일 업로드 중...';
        dom.uploadPercent.textContent = '0%';
        dom.uploadFill.style.width = '0%';

        const uploadResult = await uploadFile(file);

        // 업로드 진행률 숨김
        dom.uploadProgress.classList.add('hidden');

        // 상태 갱신
        state.taskId = uploadResult.task_id;
        state.fileInfo = uploadResult;

        // 파일 정보 UI 업데이트
        populateFileInfo(uploadResult);
        updateEstimatedParts();

    } catch (error) {
        dom.uploadProgress.classList.add('hidden');
        showToast(`파일 업로드 실패: ${error.message}`);
        updateStep2FileListStatus(queueIndex, 'error');

        // 실패한 파일 건너뛰고 다음 파일 시도
        state.queueIndex++;
        if (state.queueIndex < state.fileQueue.length) {
            await processNextFile();
        } else {
            state.isProcessingQueue = false;
            if (state.allResults.length > 0) {
                showAllResults();
            } else {
                dom.splitBtn.disabled = false;
                dom.splitBtn.innerHTML = '<span class="btn-icon">✂️</span> 분할 시작';
            }
        }
        return;
    }

    // 2단계: 분할 시작
    try {
        const targetMB = parseInt(dom.sizeInput.value) || 200;
        const outputDir = dom.outputPath.value.trim();

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

        // 진행률 리셋
        dom.statusFill.style.width = '0%';
        dom.statusPercent.textContent = '0%';
        dom.statusPart.textContent = '준비 중...';
        dom.statusElapsed.textContent = '00:00';
        dom.statusRemaining.textContent = '계산 중...';
        dom.statusSpeed.textContent = '-';

        // 폴링 시작 — 완료 시 onFileCompleted가 호출됨
        startPolling();

    } catch (error) {
        showToast(`분할 시작 실패: ${error.message}`);
        updateStep2FileListStatus(queueIndex, 'error');

        // 실패한 파일 건너뛰고 다음 파일 시도
        state.queueIndex++;
        if (state.queueIndex < state.fileQueue.length) {
            await processNextFile();
        } else {
            state.isProcessingQueue = false;
            if (state.allResults.length > 0) {
                showAllResults();
            } else {
                dom.splitBtn.disabled = false;
                dom.splitBtn.innerHTML = '<span class="btn-icon">✂️</span> 분할 시작';
            }
        }
    }
}

/**
 * 파일 업로드 (Promise 반환)
 */
function uploadFile(file) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        // 업로드 진행률 추적
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                dom.uploadPercent.textContent = `${percent}%`;
                dom.uploadFill.style.width = `${percent}%`;
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                try {
                    const data = JSON.parse(xhr.responseText);
                    reject(new Error(data.error || '업로드 실패'));
                } catch {
                    reject(new Error('업로드 실패'));
                }
            }
        });

        xhr.addEventListener('error', () => reject(new Error('네트워크 오류')));
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    });
}

/**
 * Step 2 파일 리스트 상태 업데이트
 */
function updateStep2FileListStatus(index, status) {
    const statusEl = document.getElementById(`step2FileStatus_${index}`);
    if (!statusEl) return;

    const item = statusEl.closest('.step2-file-item');

    switch (status) {
        case 'processing':
            statusEl.textContent = '🔄 처리 중';
            statusEl.className = 'step2-file-status processing';
            if (item) item.classList.add('processing');
            break;
        case 'completed':
            statusEl.textContent = '✅ 완료';
            statusEl.className = 'step2-file-status completed';
            if (item) {
                item.classList.remove('processing');
                item.classList.add('completed');
            }
            break;
        case 'error':
            statusEl.textContent = '❌ 실패';
            statusEl.className = 'step2-file-status error';
            if (item) {
                item.classList.remove('processing');
                item.classList.add('error');
            }
            break;
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
            state.isProcessingQueue = false;
            return;
        }

        const data = await res.json();

        // 스테이터스 바 업데이트
        updateStatusBar(data);

        // 완료 또는 에러 시 폴링 중지
        if (data.status === 'completed') {
            stopPolling();
            onFileCompleted(data);
        } else if (data.status === 'error') {
            stopPolling();
            showToast(data.message || '분할 중 오류가 발생했습니다.');
            updateStep2FileListStatus(state.queueIndex, 'error');

            // 에러 발생해도 다음 파일 처리 시도 (큐 모드일 때)
            if (state.isProcessingQueue && state.queueIndex + 1 < state.fileQueue.length) {
                dom.statusBar.classList.add('hidden');
                state.queueIndex++;
                await processNextFile();
            } else {
                dom.splitBtn.disabled = false;
                dom.splitBtn.innerHTML = '<span class="btn-icon">✂️</span> 분할 시작';
                dom.statusBar.classList.add('hidden');
                state.isProcessingQueue = false;
                if (state.allResults.length > 0) {
                    showAllResults();
                }
            }
        }
    } catch (error) {
        console.error('폴링 오류:', error);
    }
}

/**
 * 파일 분할 완료 시 처리 (큐의 다음 파일로 이동하거나 최종 결과 표시)
 */
async function onFileCompleted(data) {
    // 현재 파일 결과 저장
    state.allResults.push({
        filename: state.fileInfo.filename,
        parts: data.parts || [],
        output_dir: data.output_dir || '',
        elapsed_seconds: data.elapsed_seconds || 0,
    });

    // Step 2 파일 리스트 상태 업데이트
    updateStep2FileListStatus(state.queueIndex, 'completed');

    // 큐 진행 갱신
    if (state.fileQueue.length > 1) {
        dom.queueCurrent.textContent = state.allResults.length;
        dom.queueFill.style.width = `${(state.allResults.length / state.fileQueue.length) * 100}%`;
    }

    // 임시 파일 정리
    try {
        await fetch(`/api/cleanup/${state.taskId}`, { method: 'DELETE' });
    } catch (e) { /* 무시 */ }

    // 다음 파일로 이동
    state.queueIndex++;

    if (state.queueIndex < state.fileQueue.length) {
        // 스테이터스 바 리셋
        dom.statusBar.classList.add('hidden');

        // 다음 파일 처리
        await processNextFile();
    } else {
        // 모든 파일 처리 완료!
        state.isProcessingQueue = false;
        showAllResults();
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

/**
 * 모든 파일의 결과를 통합하여 표시
 */
function showAllResults() {
    const allParts = state.allResults.flatMap(r => r.parts);
    const totalSize = allParts.reduce((sum, p) => sum + p.file_size, 0);
    const totalElapsed = state.allResults.reduce((sum, r) => sum + r.elapsed_seconds, 0);
    const fileCount = state.allResults.length;

    if (fileCount > 1) {
        dom.resultSummary.textContent =
            `${fileCount}개 파일 → ${allParts.length}개 파트 • 총 ${formatSize(totalSize)} • 소요 시간: ${formatDuration(totalElapsed)}`;
    } else {
        dom.resultSummary.textContent =
            `${allParts.length}개 파트 • 총 ${formatSize(totalSize)} • 소요 시간: ${formatDuration(totalElapsed)}`;
    }

    dom.resultPath.textContent = state.allResults[0]?.output_dir || '';

    // 파트 리스트 생성
    dom.partsList.innerHTML = '';

    state.allResults.forEach((result, fileIdx) => {
        // 복수 파일인 경우 파일 구분 헤더 추가
        if (fileCount > 1) {
            const header = document.createElement('div');
            header.className = 'result-file-header';
            header.innerHTML = `<span class="result-file-icon">📹</span> ${result.filename}`;
            dom.partsList.appendChild(header);
        }

        result.parts.forEach((part, index) => {
            const card = document.createElement('div');
            card.className = 'part-card';
            card.style.animationDelay = `${(fileIdx * result.parts.length + index) * 0.06}s`;
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
    state.fileQueue = [];
    state.queueIndex = 0;
    state.allResults = [];
    state.isProcessingQueue = false;

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
    dom.queueProgress.classList.add('hidden');
    dom.partsList.innerHTML = '';
    dom.fileQueue.classList.add('hidden');
    dom.fileQueueList.innerHTML = '';
    dom.uploadProgress.classList.add('hidden');

    // Step 2 파일 리스트 초기화
    const step2FileList = document.getElementById('step2FileList');
    if (step2FileList) {
        step2FileList.innerHTML = '';
        step2FileList.classList.add('hidden');
    }

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
