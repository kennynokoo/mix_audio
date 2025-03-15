document.addEventListener('DOMContentLoaded', () => {
    const app = new AudioMergerApp();
    app.init();
});

class AudioMergerApp {
    constructor() {
        this.audioSegments = [];
        this.socket = io();
        this.audioPlayer = document.getElementById('audioPlayer');
        this.currentPreviewUrl = null;
    }

    init() {
        this.setupEventListeners();
        this.setupSocketListeners();
        this.setupSortable();
        this.setupAudioPlayer();
        this.updateSegmentsCount();
    }

    setupEventListeners() {
        // 按鈕事件
        document.getElementById('selectFilesBtn').addEventListener('click', () => this.selectFiles());
        document.getElementById('addSilenceBtn').addEventListener('click', () => this.showSilencePanel());
        document.getElementById('closeSilencePanel').addEventListener('click', () => this.hideSilencePanel());
        document.getElementById('confirmSilenceBtn').addEventListener('click', () => this.addSilence());
        document.getElementById('mergeButton').addEventListener('click', () => this.mergeAudio());
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileSelection(e));
        document.getElementById('clearAllBtn').addEventListener('click', () => this.confirmClearAll());
        
        // 靜音持續時間控制
        document.getElementById('increaseDuration').addEventListener('click', () => this.adjustSilenceDuration(1));
        document.getElementById('decreaseDuration').addEventListener('click', () => this.adjustSilenceDuration(-1));
        
        // 模態對話框控制
        document.getElementById('modalClose').addEventListener('click', () => this.hideModal());
        document.getElementById('modalCancel').addEventListener('click', () => this.hideModal());
        document.getElementById('modalConfirm').addEventListener('click', () => {
            if (this.modalConfirmCallback) {
                this.modalConfirmCallback();
            }
            this.hideModal();
        });
        
        // 自定義事件
        document.addEventListener('move-segment-up', (e) => this.moveSegmentUp(e.detail.index));
        document.addEventListener('move-segment-down', (e) => this.moveSegmentDown(e.detail.index));
        document.addEventListener('delete-segment', (e) => this.confirmDeleteSegment(e.detail.index));
        document.addEventListener('preview-segment', (e) => this.previewSegment(e.detail.index));
        document.addEventListener('stop-preview', () => this.stopPreview());
        document.addEventListener('segment-time-changed', (e) => this.updateSegmentTime(e.detail));
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.updateStatusMessage('已連接到服務器');
        });

        this.socket.on('audio-loaded', (segment) => {
            this.addAudioSegment(segment);
        });

        this.socket.on('audio-load-error', (error) => {
            this.showToast('載入失敗: ' + error);
        });

        this.socket.on('merge-progress', (progress) => {
            this.updateProgress(progress);
        });

        this.socket.on('merge-completed', (filePath) => {
            this.mergeCompleted(filePath);
        });

        this.socket.on('merge-failed', (error) => {
            this.mergeFailed(error);
        });

        this.socket.on('status-update', (status) => {
            this.updateStatusLabel(status);
        });

        this.socket.on('preview-ready', (url) => {
            this.playPreview(url);
        });

        this.socket.on('preview-error', (error) => {
            this.showToast('預覽失敗: ' + error);
        });
    }

    setupSortable() {
        const container = document.getElementById('segmentsContainer');
        this.sortable = new Sortable(container, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            handle: '.segment-header',
            onEnd: (evt) => {
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;
                if (oldIndex !== newIndex) {
                    this.moveSegment(oldIndex, newIndex);
                }
            }
        });
    }

    setupAudioPlayer() {
        const player = this.audioPlayer;
        const seekSlider = document.getElementById('seekSlider');
        const currentTimeDisplay = document.getElementById('currentTime');
        const totalTimeDisplay = document.getElementById('totalTime');
        const playerStatus = document.getElementById('playerStatus');
        const playPauseBtn = document.getElementById('playPauseBtn');
        
        // 提高更新頻率，使時間顯示更流暢
        let updateInterval;
        
        // 播放/暫停按鈕點擊處理
        playPauseBtn.addEventListener('click', () => {
            if (player.paused) {
                player.play();
            } else {
                player.pause();
            }
        });
        
        player.addEventListener('play', () => {
            // 播放時啟動高頻率更新
            clearInterval(updateInterval);
            updateInterval = setInterval(() => {
                if (!player.paused) {
                    this.updatePlayerDisplay();
                }
            }, 30); // 每30毫秒更新一次
            
            // 更新按鈕狀態
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            playPauseBtn.classList.add('playing');
            
            playerStatus.textContent = '播放中';
            playerStatus.className = 'player-status-indicator playing';
        });
        
        player.addEventListener('pause', () => {
            clearInterval(updateInterval);
            
            // 更新按鈕狀態，但只有在不是結束的情況下
            if (!player.ended) {
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                playPauseBtn.classList.remove('playing');
                
                playerStatus.textContent = '已暫停';
                playerStatus.className = 'player-status-indicator paused';
            }
        });
        
        player.addEventListener('ended', () => {
            clearInterval(updateInterval);
            seekSlider.value = 0;
            currentTimeDisplay.textContent = '000:00.00';
            
            // 重置按鈕狀態
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            playPauseBtn.classList.remove('playing');
            playPauseBtn.disabled = true;
            
            // 重置滑塊
            seekSlider.disabled = true;
            
            playerStatus.textContent = '已停止';
            playerStatus.className = 'player-status-indicator stopped';
            this.updateStatusMessage('音頻播放結束');
        });
        
        // 改進時間更新響應
        player.addEventListener('timeupdate', () => {
            this.updatePlayerDisplay();
        });
        
        player.addEventListener('loadedmetadata', () => {
            totalTimeDisplay.textContent = this.formatTime(player.duration * 1000);
            seekSlider.disabled = false;
            playPauseBtn.disabled = false;
            this.updatePlayerDisplay();
            playerStatus.textContent = '已就緒';
            playerStatus.className = 'player-status-indicator ready';
        });
        
        // 改進拖動響應性
        let isDragging = false;
        let wasPlaying = false;
        
        seekSlider.addEventListener('mousedown', () => {
            isDragging = true;
            wasPlaying = !player.paused;
            if (wasPlaying) {
                player.pause(); // 拖動時暫停播放，提高響應性
            }
        });
        
        seekSlider.addEventListener('touchstart', () => {
            isDragging = true;
            wasPlaying = !player.paused;
            if (wasPlaying) {
                player.pause(); // 觸摸設備上拖動時暫停播放
            }
        });
        
        seekSlider.addEventListener('mousemove', () => {
            if (isDragging) {
                const seekTime = (seekSlider.value / 1000) * player.duration;
                currentTimeDisplay.textContent = this.formatTime(seekTime * 1000);
            }
        });
        
        seekSlider.addEventListener('input', () => {
            const seekTime = (seekSlider.value / 1000) * player.duration;
            currentTimeDisplay.textContent = this.formatTime(seekTime * 1000);
        });
        
        seekSlider.addEventListener('change', () => {
            const seekTime = (seekSlider.value / 1000) * player.duration;
            player.currentTime = seekTime;
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                if (wasPlaying) {
                    player.play(); // 釋放鼠標後繼續播放
                }
            }
        });
        
        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                if (wasPlaying) {
                    player.play(); // 觸摸結束後繼續播放
                }
            }
        });
        
        // 為進度條添加點擊直接跳轉功能
        const sliderContainer = document.querySelector('.seek-slider-container');
        sliderContainer.addEventListener('click', (e) => {
            if (e.target === seekSlider) return; // 已由滑塊自己處理
            
            // 計算點擊位置對應的時間
            const rect = sliderContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            seekSlider.value = pos * 1000;
            
            if (player.duration) {
                player.currentTime = pos * player.duration;
                if (!player.paused) {
                    player.play();
                }
            }
        });
        
        // 初始狀態
        playPauseBtn.disabled = true;
        playerStatus.textContent = '未播放';
        playerStatus.className = 'player-status-indicator inactive';
    }

    updatePlayerDisplay() {
        const player = this.audioPlayer;
        const seekSlider = document.getElementById('seekSlider');
        const currentTimeDisplay = document.getElementById('currentTime');
        const bufferBar = document.getElementById('bufferBar');
        
        if (player.duration) {
            // 更精確地更新時間顯示
            const currentTime = player.currentTime;
            currentTimeDisplay.textContent = this.formatTime(currentTime * 1000);
            
            // 更新進度條，使用高精度值
            const progress = (currentTime / player.duration) * 1000;
            seekSlider.value = progress;
            
            // 更新緩衝進度
            if (player.buffered.length > 0) {
                const bufferedEnd = player.buffered.end(player.buffered.length - 1);
                const bufferedPercent = (bufferedEnd / player.duration) * 100;
                bufferBar.style.width = `${bufferedPercent}%`;
            }
        }
    }

    selectFiles() {
        document.getElementById('fileInput').click();
    }

    handleFileSelection(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        // 顯示狀態
        this.updateStatusMessage(`正在上傳 ${files.length} 個文件...`);
        
        // 創建FormData對象
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('audioFiles', files[i]);
        }

        // 發送到伺服器
        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                this.showToast('上傳失敗: ' + data.error);
            } else {
                this.updateStatusMessage(`已上傳 ${files.length} 個文件`);
            }
        })
        .catch(error => {
            this.showToast('上傳失敗: ' + error.message);
        });

        // 清除文件輸入，允許重新選擇相同的文件
        event.target.value = '';
    }

    showSilencePanel() {
        document.getElementById('silencePanel').classList.add('active');
    }

    hideSilencePanel() {
        document.getElementById('silencePanel').classList.remove('active');
    }

    adjustSilenceDuration(change) {
        const input = document.getElementById('silenceDuration');
        let value = parseInt(input.value) || 0;
        value = Math.max(1, value + change);
        input.value = value;
    }

    addSilence() {
        const durationInput = document.getElementById('silenceDuration');
        const duration = parseInt(durationInput.value);
        
        if (!duration || duration <= 0) {
            this.showToast('請輸入有效的靜音時長');
            return;
        }

        const segment = {
            file_path: `Silence - ${duration} seconds`,
            start_ms: 0,
            end_ms: duration * 1000,
            duration_ms: duration * 1000
        };

        this.audioSegments.push(segment);
        this.updateSegmentsUI();
        this.hideSilencePanel();
        this.updateStatusMessage(`已添加 ${duration} 秒靜音`);
        this.showToast(`已添加 ${duration} 秒靜音`);
    }

    addAudioSegment(segment) {
        this.audioSegments.push(segment);
        this.updateSegmentsUI();
        this.updateStatusMessage(`已添加音頻: ${this.getFileName(segment.file_path)}`);
    }

    updateSegmentsUI() {
        const container = document.getElementById('segmentsContainer');
        
        // 完全清除容器內容
        container.innerHTML = '';
        
        // 重新創建空狀態元素
        const newEmptyState = document.createElement('div');
        newEmptyState.id = 'emptyState';
        newEmptyState.className = 'empty-state';
        newEmptyState.innerHTML = `
            <i class="fas fa-music"></i>
            <p>請添加音頻片段或靜音</p>
        `;
        
        // 顯示或隱藏空狀態
        if (this.audioSegments.length === 0) {
            newEmptyState.style.display = 'flex';
            container.appendChild(newEmptyState);
        } else {
            // 添加片段
            this.audioSegments.forEach((segment, index) => {
                const segmentComp = new AudioSegmentComponent(segment, index);
                container.appendChild(segmentComp.element);
            });
            
            // 添加隱藏的空狀態元素（以備後用）
            newEmptyState.style.display = 'none';
            container.appendChild(newEmptyState);
        }
        
        // 更新片段計數
        this.updateSegmentsCount();
    }

    updateSegmentsCount() {
        const countEl = document.getElementById('segmentsCount');
        countEl.textContent = `${this.audioSegments.length} 個片段`;
    }

    moveSegmentUp(index) {
        if (index <= 0 || index >= this.audioSegments.length) return;
        
        [this.audioSegments[index-1], this.audioSegments[index]] = 
        [this.audioSegments[index], this.audioSegments[index-1]];
        
        this.updateSegmentsUI();
        this.updateStatusMessage(`片段上移到位置 ${index-1}`);
    }

    moveSegmentDown(index) {
        if (index < 0 || index >= this.audioSegments.length-1) return;
        
        [this.audioSegments[index+1], this.audioSegments[index]] = 
        [this.audioSegments[index], this.audioSegments[index+1]];
        
        this.updateSegmentsUI();
        this.updateStatusMessage(`片段下移到位置 ${index+1}`);
    }

    moveSegment(oldIndex, newIndex) {
        const segment = this.audioSegments.splice(oldIndex, 1)[0];
        this.audioSegments.splice(newIndex, 0, segment);
        this.updateStatusMessage(`片段移動到位置 ${newIndex}`);
    }

    confirmDeleteSegment(index) {
        if (index < 0 || index >= this.audioSegments.length) return;
        
        const segment = this.audioSegments[index];
        const fileName = this.getFileName(segment.file_path);
        
        this.showModal(
            '確認刪除', 
            `確定要刪除片段 "${fileName}" 嗎？`, 
            () => this.deleteSegment(index)
        );
    }

    deleteSegment(index) {
        if (index < 0 || index >= this.audioSegments.length) return;
        
        const segment = this.audioSegments[index];
        this.audioSegments.splice(index, 1);
        this.updateSegmentsUI();
        this.updateStatusMessage(`已刪除片段: ${this.getFileName(segment.file_path)}`);
        this.showToast('片段已刪除');
    }

    confirmClearAll() {
        if (this.audioSegments.length === 0) {
            this.showToast('沒有片段可清除');
            return;
        }
        
        this.showModal(
            '確認清除', 
            `確定要清除所有 ${this.audioSegments.length} 個片段嗎？`, 
            () => this.clearAllSegments()
        );
    }

    clearAllSegments() {
        this.stopPreview();
        this.audioSegments = [];
        this.updateSegmentsUI();
        this.updateStatusMessage('已清除所有片段');
        this.showToast('所有片段已清除');
        
        // 強制重新渲染空狀態
        const container = document.getElementById('segmentsContainer');
        const emptyState = document.getElementById('emptyState');
        
        // 確保移除所有子元素
        while (container.firstChild) {
            if (container.firstChild !== emptyState) {
                container.removeChild(container.firstChild);
            } else {
                break;
            }
        }
        
        // 確保空狀態顯示
        if (emptyState) {
            emptyState.style.display = 'flex';
        }
    }

    updateSegmentTime(detail) {
        const { index, type, ms } = detail;
        if (index < 0 || index >= this.audioSegments.length) return;
        
        if (type === 'start') {
            this.audioSegments[index].start_ms = ms;
        } else if (type === 'end') {
            this.audioSegments[index].end_ms = ms;
        }
    }

    previewSegment(index) {
        if (index < 0 || index >= this.audioSegments.length) return;
        
        const segment = this.audioSegments[index];
        
        if (segment.file_path.startsWith('Silence')) {
            this.showToast('預覽靜音片段');
        }
        
        const start = segment.start_ms;
        const end = segment.end_ms;
        
        // 驗證時間範圍
        if (start >= end) {
            this.showToast('預覽的開始時間必須小於結束時間');
            // 重置時間
            segment.start_ms = 0;
            segment.end_ms = segment.duration_ms;
            this.updateSegmentsUI();
            return;
        }
        
        if (end > segment.duration_ms) {
            this.showToast('預覽的結束時間不能超過音頻時長');
            segment.end_ms = segment.duration_ms;
            this.updateSegmentsUI();
            return;
        }
        
        this.updateStatusMessage('準備預覽...');
        
        // 發送到伺服器進行處理
        this.socket.emit('preview-segment', { segment, index });
    }

    playPreview(url) {
        this.currentPreviewUrl = url;
        this.audioPlayer.src = url;
        
        // 使用 Promise 確保用戶體驗更好
        const playPromise = this.audioPlayer.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                document.getElementById('seekSlider').disabled = false;
                document.getElementById('playPauseBtn').disabled = false;
                this.updateStatusMessage('正在預覽...');
            }).catch(error => {
                console.error('播放錯誤:', error);
                this.showToast('播放失敗，請重試');
            });
        }
    }

    stopPreview() {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        document.getElementById('seekSlider').disabled = true;
        document.getElementById('currentTime').textContent = '000:00.00';
        document.getElementById('playPauseBtn').innerHTML = '<i class="fas fa-play"></i>';
        document.getElementById('playPauseBtn').classList.remove('playing');
        document.getElementById('playPauseBtn').disabled = true;
        document.getElementById('playerStatus').textContent = '已停止';
        document.getElementById('playerStatus').className = 'player-status-indicator stopped';
        this.updateStatusMessage('預覽停止');
    }

    mergeAudio() {
        if (this.audioSegments.length === 0) {
            this.showToast('請添加至少一個音頻片段進行合併');
            return;
        }
        
        // 驗證所有片段的時間範圍
        for (let i = 0; i < this.audioSegments.length; i++) {
            const segment = this.audioSegments[i];
            const start = segment.start_ms;
            const end = segment.end_ms;
            
            if (start >= end) {
                this.showToast(`片段 ${i+1} 的開始時間必須小於結束時間`);
                return;
            }
            
            if (end > segment.duration_ms) {
                this.showToast(`片段 ${i+1} 的結束時間不能超過音頻時長`);
                return;
            }
        }
        
        // 獲取選擇的格式
        const format = document.getElementById('exportFormat').value;
        
        // 顯示進度條
        this.showProgressArea();
        this.updateStatusLabel('正在合併音頻...');
        this.updateStatusMessage('正在合併音頻...');
        
        // 發送合併請求到伺服器
        this.socket.emit('merge-audio', {
            segments: this.audioSegments,
            format: format
        });
    }

    updateProgress(progress) {
        const progressBar = document.getElementById('progressBar');
        progressBar.style.width = `${progress}%`;
        
        if (progress >= 90) {
            this.updateStatusLabel(`導出中... ${progress}%`);
        } else {
            this.updateStatusLabel(`處理中... ${progress}%`);
        }
    }

    mergeCompleted(filePath) {
        this.hideProgressArea();
        this.updateStatusMessage('合併完成');
        
        // 創建下載鏈接
        const downloadUrl = `/download?file=${encodeURIComponent(filePath)}`;
        
        this.showModal(
            '合併成功', 
            `<p>音頻已成功合併</p>
             <div class="text-center mt-3">
                <a href="${downloadUrl}" class="btn btn-success" download>
                    <i class="fas fa-download"></i> 下載合併音頻
                </a>
             </div>`, 
            () => {
                // 清空片段列表
                this.audioSegments = [];
                this.updateSegmentsUI();
            },
            true
        );
    }

    mergeFailed(error) {
        this.hideProgressArea();
        this.updateStatusMessage('合併失敗');
        this.showModal('合併失敗', `合併過程中發生錯誤：<br>${error}`);
    }

    showProgressArea() {
        document.getElementById('progressArea').classList.add('active');
        document.getElementById('progressBar').style.width = '0%';
        document.getElementById('mergeButton').disabled = true;
        document.getElementById('selectFilesBtn').disabled = true;
        document.getElementById('addSilenceBtn').disabled = true;
    }

    hideProgressArea() {
        document.getElementById('progressArea').classList.remove('active');
        document.getElementById('mergeButton').disabled = false;
        document.getElementById('selectFilesBtn').disabled = false;
        document.getElementById('addSilenceBtn').disabled = false;
    }

    updateStatusLabel(message) {
        const statusLabel = document.getElementById('statusLabel');
        statusLabel.textContent = message;
    }

    updateStatusMessage(message) {
        const statusMessage = document.getElementById('statusMessage');
        statusMessage.textContent = message;
    }

    showModal(title, body, confirmCallback = null, hideCancel = false) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        
        this.modalConfirmCallback = confirmCallback;
        
        // 顯示或隱藏取消按鈕
        document.getElementById('modalCancel').style.display = hideCancel ? 'none' : 'block';
        
        document.getElementById('modalOverlay').classList.add('active');
    }

    hideModal() {
        document.getElementById('modalOverlay').classList.remove('active');
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('active');
        
        // 清除舊的計時器
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        
        this.toastTimer = setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    }

    formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes.toString().padStart(3, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    getFileName(filePath) {
        if (filePath.startsWith('Silence')) {
            return filePath;
        }
        return filePath.split('/').pop().split('\\').pop();
    }
}