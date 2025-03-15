class AudioSegmentComponent {
    constructor(segment, index) {
        this.segment = segment;
        this.index = index;
        this.element = this.createSegmentElement();
    }

    createSegmentElement() {
        const segmentEl = document.createElement('div');
        segmentEl.className = 'audio-segment';
        segmentEl.dataset.index = this.index;

        const isSilence = this.segment.file_path.startsWith('Silence');
        const fileName = isSilence 
            ? `靜音 - ${this.segment.duration_ms / 1000} 秒` 
            : this.segment.file_path.split('/').pop();
        
        // 片段頭部
        const headerEl = document.createElement('div');
        headerEl.className = 'segment-header';

        // 文件信息
        const fileInfoEl = document.createElement('div');
        fileInfoEl.className = 'file-info';

        // 文件圖標
        const iconEl = document.createElement('div');
        iconEl.className = `file-icon ${isSilence ? 'silence' : ''}`;
        const iconI = document.createElement('i');
        iconI.className = isSilence ? 'fas fa-volume-mute' : 'fas fa-music';
        iconEl.appendChild(iconI);
        fileInfoEl.appendChild(iconEl);

        // 文件詳情
        const fileDetailsEl = document.createElement('div');
        fileDetailsEl.className = 'file-details';
        
        const nameEl = document.createElement('div');
        nameEl.className = 'file-name';
        nameEl.textContent = fileName;
        fileDetailsEl.appendChild(nameEl);

        const durationEl = document.createElement('div');
        durationEl.className = 'duration-label';
        durationEl.textContent = `總時長: ${this.formatDuration(this.segment.duration_ms)}`;
        fileDetailsEl.appendChild(durationEl);
        
        fileInfoEl.appendChild(fileDetailsEl);
        headerEl.appendChild(fileInfoEl);

        // 控制按鈕
        const controlsEl = document.createElement('div');
        controlsEl.className = 'control-buttons';

        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'control-btn';
        moveUpBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        moveUpBtn.title = '上移';
        moveUpBtn.onclick = (e) => {
            e.stopPropagation();
            this.onMoveUp();
        };
        controlsEl.appendChild(moveUpBtn);

        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'control-btn';
        moveDownBtn.innerHTML = '<i class="fas fa-arrow-down"></i>';
        moveDownBtn.title = '下移';
        moveDownBtn.onclick = (e) => {
            e.stopPropagation();
            this.onMoveDown();
        };
        controlsEl.appendChild(moveDownBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'control-btn delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = '刪除';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.onDelete();
        };
        controlsEl.appendChild(deleteBtn);

        headerEl.appendChild(controlsEl);
        segmentEl.appendChild(headerEl);

        // 片段主體 - 時間控制
        if (!isSilence) {
            const bodyEl = document.createElement('div');
            bodyEl.className = 'segment-body';

            // 開始時間
            const startTimeControlEl = document.createElement('div');
            startTimeControlEl.className = 'time-control';
            
            const startLabel = document.createElement('label');
            startLabel.textContent = '開始時間:';
            startTimeControlEl.appendChild(startLabel);
            
            const startInput = document.createElement('input');
            startInput.type = 'text';
            startInput.className = 'time-edit';
            startInput.value = this.msToTime(this.segment.start_ms);
            startInput.oninput = (e) => this.onStartTimeChanged(e.target.value);
            startTimeControlEl.appendChild(startInput);
            
            bodyEl.appendChild(startTimeControlEl);

            // 結束時間
            const endTimeControlEl = document.createElement('div');
            endTimeControlEl.className = 'time-control';
            
            const endLabel = document.createElement('label');
            endLabel.textContent = '結束時間:';
            endTimeControlEl.appendChild(endLabel);
            
            const endInput = document.createElement('input');
            endInput.type = 'text';
            endInput.className = 'time-edit';
            endInput.value = this.msToTime(this.segment.end_ms);
            endInput.oninput = (e) => this.onEndTimeChanged(e.target.value);
            endTimeControlEl.appendChild(endInput);
            
            bodyEl.appendChild(endTimeControlEl);

            // 操作按鈕
            const actionButtonsEl = document.createElement('div');
            actionButtonsEl.className = 'action-buttons';
            
            const previewBtn = document.createElement('button');
            previewBtn.className = 'preview-btn';
            previewBtn.innerHTML = '<i class="fas fa-play"></i> 預覽';
            previewBtn.onclick = (e) => {
                e.stopPropagation();
                this.onPreview();
            };
            actionButtonsEl.appendChild(previewBtn);
            
            const stopBtn = document.createElement('button');
            stopBtn.className = 'stop-btn';
            stopBtn.innerHTML = '<i class="fas fa-stop"></i> 停止';
            stopBtn.onclick = (e) => {
                e.stopPropagation();
                this.onStopPreview();
            };
            actionButtonsEl.appendChild(stopBtn);
            
            bodyEl.appendChild(actionButtonsEl);
            segmentEl.appendChild(bodyEl);
        } else {
            // 對於靜音片段，只顯示預覽和停止按鈕
            const bodyEl = document.createElement('div');
            bodyEl.className = 'segment-body';
            
            const actionButtonsEl = document.createElement('div');
            actionButtonsEl.className = 'action-buttons';
            actionButtonsEl.style.marginLeft = 'auto';
            
            const previewBtn = document.createElement('button');
            previewBtn.className = 'preview-btn';
            previewBtn.innerHTML = '<i class="fas fa-play"></i> 預覽';
            previewBtn.onclick = (e) => {
                e.stopPropagation();
                this.onPreview();
            };
            actionButtonsEl.appendChild(previewBtn);
            
            const stopBtn = document.createElement('button');
            stopBtn.className = 'stop-btn';
            stopBtn.innerHTML = '<i class="fas fa-stop"></i> 停止';
            stopBtn.onclick = (e) => {
                e.stopPropagation();
                this.onStopPreview();
            };
            actionButtonsEl.appendChild(stopBtn);
            
            bodyEl.appendChild(actionButtonsEl);
            segmentEl.appendChild(bodyEl);
        }

        return segmentEl;
    }

    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    msToTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes.toString().padStart(3, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    timeToMs(timeStr) {
        try {
            const [minutes, rest] = timeStr.split(':');
            const [seconds, ms] = rest.split('.');
            const totalMs = (parseInt(minutes) * 60 + parseInt(seconds)) * 1000 + parseInt(ms) * 10;
            return totalMs;
        } catch (e) {
            console.error(`時間格式轉換錯誤: ${e}, 時間字符串: '${timeStr}'`);
            return 0;
        }
    }

    onStartTimeChanged(value) {
        const ms = this.timeToMs(value);
        this.segment.start_ms = ms;
        document.dispatchEvent(new CustomEvent('segment-time-changed', {
            detail: { index: this.index, type: 'start', ms }
        }));
    }

    onEndTimeChanged(value) {
        const ms = this.timeToMs(value);
        this.segment.end_ms = ms;
        document.dispatchEvent(new CustomEvent('segment-time-changed', {
            detail: { index: this.index, type: 'end', ms }
        }));
    }

    onMoveUp() {
        document.dispatchEvent(new CustomEvent('move-segment-up', {
            detail: { index: this.index }
        }));
    }

    onMoveDown() {
        document.dispatchEvent(new CustomEvent('move-segment-down', {
            detail: { index: this.index }
        }));
    }

    onDelete() {
        document.dispatchEvent(new CustomEvent('delete-segment', {
            detail: { index: this.index }
        }));
    }

    onPreview() {
        document.dispatchEvent(new CustomEvent('preview-segment', {
            detail: { index: this.index }
        }));
    }

    onStopPreview() {
        document.dispatchEvent(new CustomEvent('stop-preview'));
    }
}