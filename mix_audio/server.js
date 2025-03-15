const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const http = require('http');
const socketIo = require('socket.io');

// 定義PORT變量（修復PORT未定義錯誤）
const PORT = process.env.PORT || 3000;

// 創建Express應用
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 設定靜態文件服務
app.use(express.static('public'));

// 確保目錄存在
const uploadsDir = path.join(__dirname, 'uploads');
const tempDir = path.join(__dirname, 'temp');
const outputDir = path.join(__dirname, 'output');
const assetsDir = path.join(__dirname, 'assets');

[uploadsDir, tempDir, outputDir, assetsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// 添加自動清理文件功能
function cleanupFiles() {
    console.log('開始定期清理臨時文件...', new Date().toLocaleString());
    
    // 獲取當前時間
    const now = new Date();
    
    // 設置不同的保留期限（毫秒）
    const uploadsRetention = 7 * 24 * 60 * 60 * 1000; // 7天
    const tempRetention = 24 * 60 * 60 * 1000;       // 1天
    const outputRetention = 14 * 24 * 60 * 60 * 1000; // 14天
    
    // 清理函數
    function cleanDir(dir, retention) {
        if (!fs.existsSync(dir)) return;
        
        fs.readdir(dir, (err, files) => {
            if (err) {
                console.error(`讀取目錄 ${dir} 時出錯:`, err);
                return;
            }
            
            files.forEach(file => {
                const filePath = path.join(dir, file);
                
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        console.error(`獲取文件 ${filePath} 狀態時出錯:`, err);
                        return;
                    }
                    
                    // 如果是目錄，跳過
                    if (stats.isDirectory()) return;
                    
                    // 檢查文件年齡
                    const fileAge = now - stats.mtime;
                    if (fileAge > retention) {
                        fs.unlink(filePath, err => {
                            if (err) {
                                console.error(`刪除文件 ${filePath} 時出錯:`, err);
                            } else {
                                console.log(`已刪除舊文件: ${filePath}`);
                            }
                        });
                    }
                });
            });
        });
    }
    
    // 清理各個目錄
    cleanDir(uploadsDir, uploadsRetention);
    cleanDir(tempDir, tempRetention);
    cleanDir(outputDir, outputRetention);
}

// 每天執行一次清理
setInterval(cleanupFiles, 24 * 60 * 60 * 1000);

// 啟動時也執行一次清理，但延遲10分鐘，避免影響應用啟動
setTimeout(cleanupFiles, 10 * 60 * 1000);

// 設定文件上傳
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // 保留原始文件名但添加UUID避免衝突
        const uniquePrefix = uuidv4();
        cb(null, uniquePrefix + '-' + file.originalname);
    }
});

// 修改文件過濾器，更寬容地接受音頻文件
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // 檢查文件類型，更寬容的方式
        const fileExt = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.mp3', '.wav', '.m4a'];
        
        // 只檢查擴展名，不檢查MIME類型
        if (allowedExts.includes(fileExt)) {
            return cb(null, true);
        }
        
        // 對於某些可能被誤判的MIME類型，如果擴展名正確，也接受
        if (file.mimetype.includes('audio/') || 
            file.mimetype.includes('video/') || // 有些m4a文件可能被標記為video
            file.mimetype === 'application/octet-stream') {
            
            if (allowedExts.includes(fileExt)) {
                return cb(null, true);
            }
        }
        
        // 記錄文件信息，幫助調試
        console.log('拒絕的文件:', {
            name: file.originalname,
            mimetype: file.mimetype,
            extension: fileExt
        });
        
        // 如果既不是正確的擴展名，也不是合適的MIME類型，則拒絕
        cb(new Error('只能上傳mp3、wav或m4a格式的音頻文件'));
    }
});

// 簡化版音頻處理類，對應Python版本的SimpleAudioSegment
class AudioProcessor {
    static getAudioInfo(filePath) {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) return reject(err);
                
                const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                if (!audioStream) {
                    return reject(new Error('找不到音頻流'));
                }
                
                const durationSec = parseFloat(metadata.format.duration);
                const durationMs = Math.round(durationSec * 1000);
                
                resolve({
                    file_path: filePath,
                    start_ms: 0,
                    end_ms: durationMs,
                    duration_ms: durationMs,
                    channels: audioStream.channels,
                    sample_rate: audioStream.sample_rate,
                    bit_rate: metadata.format.bit_rate
                });
            });
        });
    }
    
    // 修改靜音創建方法，不使用lavfi
    static async createSilence(durationMs, outputPath) {
        try {
            // 創建WAV文件的內存緩沖區
            const sampleRate = 44100;
            const channels = 2;
            const bytesPerSample = 2; // 16-bit
            const numSamples = Math.ceil(durationMs * sampleRate / 1000);
            const dataSize = numSamples * channels * bytesPerSample;
            
            // WAV文件頭部 (44字節) + 數據
            const buffer = Buffer.alloc(44 + dataSize);
            
            // RIFF header
            buffer.write('RIFF', 0);
            buffer.writeUInt32LE(36 + dataSize, 4); // 文件大小 - 8
            buffer.write('WAVE', 8);
            
            // fmt子塊
            buffer.write('fmt ', 12);
            buffer.writeUInt32LE(16, 16); // fmt塊大小
            buffer.writeUInt16LE(1, 20); // 音頻格式 (PCM)
            buffer.writeUInt16LE(channels, 22); // 聲道數
            buffer.writeUInt32LE(sampleRate, 24); // 採樣率
            buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28); // 字節率
            buffer.writeUInt16LE(channels * bytesPerSample, 32); // 塊對齊
            buffer.writeUInt16LE(8 * bytesPerSample, 34); // 位深度
            
            // data子塊
            buffer.write('data', 36);
            buffer.writeUInt32LE(dataSize, 40); // data塊大小
            
            // 寫入文件 (數據部分默認為全0，即靜音)
            fs.writeFileSync(outputPath, buffer);
            
            return outputPath;
        } catch (error) {
            throw new Error(`創建靜音文件失敗: ${error.message}`);
        }
    }
    
    static trimAudio(inputPath, outputPath, startMs, endMs) {
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .setStartTime(startMs / 1000)
                .setDuration((endMs - startMs) / 1000)
                .output(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(err))
                .run();
        });
    }
    
    static async mergeAudio(segments, outputPath, format = 'mp3', progressCallback = null) {
        const mergedListFile = path.join(tempDir, `merged_list_${Date.now()}.txt`);
        const processedFiles = [];
        
        try {
            // 處理每個片段
            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];
                const segmentOutputPath = path.join(tempDir, `segment_${i}_${Date.now()}.wav`);
                
                if (segment.file_path.startsWith('Silence')) {
                    // 處理靜音片段
                    const duration = segment.end_ms - segment.start_ms;
                    await AudioProcessor.createSilence(duration, segmentOutputPath);
                } else {
                    // 處理音頻片段
                    await AudioProcessor.trimAudio(
                        segment.file_path,
                        segmentOutputPath,
                        segment.start_ms,
                        segment.end_ms
                    );
                }
                
                processedFiles.push(segmentOutputPath);
                
                // 報告進度
                if (progressCallback) {
                    progressCallback(Math.floor((i + 1) / segments.length * 90));
                }
            }
            
            // 創建合併清單文件
            const fileList = processedFiles.map(file => `file '${file.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")}'`).join('\n');
            fs.writeFileSync(mergedListFile, fileList);
            
            // 合併所有片段
            return new Promise((resolve, reject) => {
                let command = ffmpeg()
                    .input(mergedListFile)
                    .inputOptions(['-f', 'concat', '-safe', '0'])
                    .output(outputPath);
                    
                // 根據格式設置輸出選項
                if (format === 'mp3') {
                    command = command.outputOptions(['-b:a', '192k']);
                } else if (format === 'm4a') {
                    command = command.outputOptions(['-c:a', 'aac', '-b:a', '192k']);
                } else if (format === 'wav') {
                    command = command.outputOptions(['-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2']);
                }
                
                command
                    .on('progress', progress => {
                        if (progressCallback && progress.percent) {
                            const overallProgress = 90 + Math.floor(progress.percent / 10);
                            progressCallback(Math.min(overallProgress, 99));
                        }
                    })
                    .on('end', () => {
                        // 清理臨時文件
                        processedFiles.forEach(file => {
                            try { 
                                if (fs.existsSync(file)) {
                                    fs.unlinkSync(file); 
                                }
                            } catch (e) { 
                                console.error(`刪除臨時文件失敗: ${file}`, e); 
                            }
                        });
                        
                        try { 
                            if (fs.existsSync(mergedListFile)) {
                                fs.unlinkSync(mergedListFile); 
                            }
                        } catch (e) { 
                            console.error(`刪除合併清單失敗: ${mergedListFile}`, e); 
                        }
                        
                        if (progressCallback) progressCallback(100);
                        resolve(outputPath);
                    })
                    .on('error', err => {
                        // 清理臨時文件
                        processedFiles.forEach(file => {
                            try { 
                                if (fs.existsSync(file)) {
                                    fs.unlinkSync(file);
                                }
                            } catch (e) { 
                                console.error(`刪除臨時文件失敗: ${file}`, e); 
                            }
                        });
                        
                        try { 
                            if (fs.existsSync(mergedListFile)) {
                                fs.unlinkSync(mergedListFile); 
                            }
                        } catch (e) { 
                            console.error(`刪除合併清單失敗: ${mergedListFile}`, e); 
                        }
                        
                        reject(err);
                    })
                    .run();
            });
        } catch (error) {
            // 清理臨時文件
            processedFiles.forEach(file => {
                try { 
                    if (fs.existsSync(file)) {
                        fs.unlinkSync(file); 
                    }
                } catch (e) { 
                    console.error(`刪除臨時文件失敗: ${file}`, e); 
                }
            });
            
            try { 
                if (fs.existsSync(mergedListFile)) {
                    fs.unlinkSync(mergedListFile); 
                }
            } catch (e) { 
                console.error(`刪除合併清單失敗: ${mergedListFile}`, e); 
            }
            
            throw error;
        }
    }
}

// 修改後的API路由，使用更好的錯誤處理
app.post('/api/upload', (req, res) => {
    upload.array('audioFiles')(req, res, function(err) {
        if (err) {
            console.error('上傳錯誤:', err);
            return res.status(400).json({ 
                error: err.message,
                details: '請確保您選擇的是mp3、wav或m4a格式的音頻文件。'
            });
        }
        
        const uploadedFiles = req.files;
        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json({ error: '沒有上傳文件' });
        }
        
        res.json({ success: true, count: uploadedFiles.length });
        
        // 非同步處理每個文件
        for (const file of uploadedFiles) {
            (async () => {
                try {
                    const filePath = file.path;
                    console.log(`處理文件: ${file.originalname} (${file.mimetype})`);
                    const segment = await AudioProcessor.getAudioInfo(filePath);
                    
                    // 通過Socket.IO發送結果
                    io.emit('audio-loaded', segment);
                } catch (error) {
                    console.error(`處理文件錯誤: ${file.originalname}`, error);
                    io.emit('audio-load-error', `無法加載 ${file.originalname}: ${error.message}`);
                }
            })();
        }
    });
});

// 下載路由
app.get('/download', (req, res) => {
    const file = req.query.file;
    if (!file) {
        return res.status(400).send('文件參數缺失');
    }
    
    const filePath = path.join(outputDir, path.basename(file));
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('文件不存在');
    }
    
    res.download(filePath);
});

// Socket.IO連接處理
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
    
    socket.on('preview-segment', async ({ segment, index }) => {
        try {
            socket.emit('status-update', '準備預覽...');
            
            // 創建預覽音頻
            const previewOutputPath = path.join(tempDir, `preview_${socket.id}_${Date.now()}.wav`);
            
            if (segment.file_path.startsWith('Silence')) {
                const duration = segment.end_ms - segment.start_ms;
                await AudioProcessor.createSilence(duration, previewOutputPath);
            } else {
                await AudioProcessor.trimAudio(
                    segment.file_path,
                    previewOutputPath,
                    segment.start_ms,
                    segment.end_ms
                );
            }
            
            // 發送預覽URL
            socket.emit('preview-ready', `/temp/${path.basename(previewOutputPath)}`);
            socket.emit('status-update', '正在預覽...');
        } catch (error) {
            console.error('預覽錯誤:', error);
            socket.emit('preview-error', error.message);
            socket.emit('status-update', '預覽失敗');
        }
    });
    
    socket.on('merge-audio', async ({ segments, format }) => {
        try {
            socket.emit('status-update', '開始合併處理...');
            
            // 驗證格式
            if (!['mp3', 'wav', 'm4a'].includes(format)) {
                throw new Error('不支持的格式');
            }
            
            // 創建輸出文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFileName = `merged_${timestamp}.${format}`;
            const outputPath = path.join(outputDir, outputFileName);
            
            // 開始合併
            await AudioProcessor.mergeAudio(
                segments, 
                outputPath, 
                format,
                (progress) => {
                    socket.emit('merge-progress', progress);
                    if (progress < 90) {
                        socket.emit('status-update', `處理中... ${progress}%`);
                    } else if (progress < 100) {
                        socket.emit('status-update', `導出中... ${progress}%`);
                    } else {
                        socket.emit('status-update', '處理完成');
                    }
                }
            );
            
            socket.emit('merge-completed', outputFileName);
        } catch (error) {
            console.error('合併錯誤:', error);
            socket.emit('merge-failed', error.message);
            socket.emit('status-update', '合併失敗');
        }
    });
});

// 為臨時目錄提供靜態服務，用於音頻預覽
app.use('/temp', express.static(tempDir));

// 處理404頁面
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// 啟動服務器（修改為允許內網訪問）
server.listen(PORT, '0.0.0.0', () => {
    console.log(`服務器運行在端口 ${PORT}`);
    console.log(`本機訪問: http://localhost:${PORT}`);
    console.log(`內網訪問: http://10.132.67.167:${PORT}`);
});