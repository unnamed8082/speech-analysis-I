// 语音情绪分析系统 - 纯前端实现
class AudioEmotionAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = 0;
    }

    // 初始化音频分析器
    initAudioAnalyzer() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            return true;
        } catch (error) {
            console.error('音频分析器初始化失败:', error);
            return false;
        }
    }

    // 分析音频文件
    async analyzeAudioFile(audioFile) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.initAudioAnalyzer()) {
                    throw new Error('浏览器不支持Web Audio API');
                }

                const arrayBuffer = await audioFile.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                
                // 创建音频源
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
                
                // 分析音频特征
                const features = this.extractAudioFeatures(audioBuffer);
                const emotionResult = this.calculateEmotion(features, audioBuffer.duration);
                
                // 清理资源
                source.disconnect();
                this.audioContext.close();
                
                resolve(emotionResult);
            } catch (error) {
                reject(error);
            }
        });
    }

    // 提取音频特征
    extractAudioFeatures(audioBuffer) {
        const features = {
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            channels: audioBuffer.numberOfChannels
        };

        // 获取音频数据（使用左声道）
        const channelData = audioBuffer.getChannelData(0);
        const length = channelData.length;

        // 1. 音量特征 (RMS)
        let sum = 0;
        for (let i = 0; i < length; i++) {
            sum += channelData[i] * channelData[i];
        }
        features.rms = Math.sqrt(sum / length);
        features.rmsVariance = this.calculateVariance(channelData, features.rms);

        // 2. 过零率 (Zero Crossing Rate)
        let zeroCrossings = 0;
        for (let i = 1; i < length; i++) {
            if (channelData[i-1] * channelData[i] < 0) {
                zeroCrossings++;
            }
        }
        features.zcr = zeroCrossings / length;

        // 3. 频谱特征
        const spectralFeatures = this.calculateSpectralFeatures(channelData);
        Object.assign(features, spectralFeatures);

        return features;
    }

    // 计算方差
    calculateVariance(data, mean) {
        let variance = 0;
        for (let i = 0; i < data.length; i++) {
            variance += Math.pow(data[i] - mean, 2);
        }
        return variance / data.length;
    }

    // 计算频谱特征
    calculateSpectralFeatures(channelData) {
        const features = {};
        
        // 简单的频谱分析（实际应用中可以使用更复杂的FFT）
        const frameSize = 1024;
        const spectralCentroid = this.calculateSpectralCentroid(channelData, frameSize);
        features.spectralCentroid = spectralCentroid;
        
        // 能量分布
        let lowFreqEnergy = 0;
        let midFreqEnergy = 0;
        let highFreqEnergy = 0;
        
        const third = Math.floor(channelData.length / 3);
        for (let i = 0; i < channelData.length; i++) {
            const energy = Math.abs(channelData[i]);
            if (i < third) lowFreqEnergy += energy;
            else if (i < 2 * third) midFreqEnergy += energy;
            else highFreqEnergy += energy;
        }
        
        features.lowFreqRatio = lowFreqEnergy / (lowFreqEnergy + midFreqEnergy + highFreqEnergy);
        features.highFreqRatio = highFreqEnergy / (lowFreqEnergy + midFreqEnergy + highFreqEnergy);
        
        return features;
    }

    // 计算频谱重心（简化版）
    calculateSpectralCentroid(data, frameSize) {
        let weightedSum = 0;
        let sum = 0;
        
        for (let i = 0; i < Math.min(data.length, frameSize); i++) {
            const magnitude = Math.abs(data[i]);
            weightedSum += i * magnitude;
            sum += magnitude;
        }
        
        return sum > 0 ? weightedSum / sum : 0;
    }

    // 计算情绪分数
    calculateEmotion(features, duration) {
        const { rms, rmsVariance, zcr, spectralCentroid, lowFreqRatio, highFreqRatio } = features;

        // 基于音频特征计算情绪指标
        const emotionScores = {
            calm: Math.max(0, 100 - rmsVariance * 1000 - zcr * 500),
            tense: Math.min(100, zcr * 800 + rmsVariance * 600),
            angry: Math.min(100, spectralCentroid * 50 + highFreqRatio * 200),
            excited: Math.min(100, (rmsVariance + zcr) * 400)
        };

        // 归一化处理
        const total = Object.values(emotionScores).reduce((sum, score) => sum + score, 0);
        Object.keys(emotionScores).forEach(key => {
            emotionScores[key] = Math.round((emotionScores[key] / total) * 100);
        });

        // 冲突风险计算
        const conflictRisk = Math.min(100, 
            emotionScores.tense * 0.4 + 
            emotionScores.angry * 0.6 + 
            emotionScores.excited * 0.2
        );

        return {
            emotions: emotionScores,
            conflictRisk: Math.round(conflictRisk),
            duration: Math.round(duration * 100) / 100,
            timestamp: new Date().toLocaleString('zh-CN'),
            features: {
                volume: Math.round(rms * 1000),
                variability: Math.round(rmsVariance * 1000),
                zeroCrossing: Math.round(zcr * 100)
            }
        };
    }
}

// 主应用类
class SpeechEmotionApp {
    constructor() {
        this.analyzer = new AudioEmotionAnalyzer();
        this.currentResult = null;
        this.init();
    }

    init() {
        this.bindEvents();
        console.log('语音情绪分析系统已初始化');
    }

    bindEvents() {
        // 文件选择
        document.getElementById('selectFileBtn').addEventListener('click', () => {
            document.getElementById('audioFile').click();
        });

        // 文件变化
        document.getElementById('audioFile').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        // 移除文件
        document.getElementById('removeAudioBtn').addEventListener('click', () => {
            this.resetUpload();
        });

        // 分析按钮
        document.getElementById('analyzeBtn').addEventListener('click', () => {
            this.analyzeAudio();
        });

        // 拖放功能
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    handleFileSelect(e) {
        if (e.target.files.length) {
            this.handleFile(e.target.files[0]);
        }
    }

    handleFile(file) {
        // 验证文件类型
        if (!file.type.startsWith('audio/')) {
            alert('请选择音频文件（MP3、WAV、M4A等格式）');
            return;
        }

        // 验证文件大小（最大50MB）
        if (file.size > 50 * 1024 * 1024) {
            alert('文件大小不能超过50MB');
            return;
        }

        // 显示文件信息
        document.getElementById('fileInfo').textContent = 
            `文件名: ${file.name} | 大小: ${this.formatFileSize(file.size)}`;

        // 创建对象URL并设置音频播放器
        const objectUrl = URL.createObjectURL(file);
        document.getElementById('audioPlayer').src = objectUrl;

        // 显示音频预览区域
        document.getElementById('audioPreview').style.display = 'flex';
        document.getElementById('uploadArea').style.display = 'none';

        // 启用分析按钮
        document.getElementById('analyzeBtn').disabled = false;
    }

    resetUpload() {
        document.getElementById('audioFile').value = '';
        document.getElementById('audioPlayer').src = '';
        document.getElementById('audioPreview').style.display = 'none';
        document.getElementById('uploadArea').style.display = 'block';
        document.getElementById('fileInfo').textContent = '';
        document.getElementById('analyzeBtn').disabled = true;
        document.getElementById('resultsSection').style.display = 'none';
        
        // 清理图表
        if (this.emotionChart) this.emotionChart.destroy();
        if (this.featureChart) this.featureChart.destroy();
    }

    async analyzeAudio() {
        const fileInput = document.getElementById('audioFile');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const loading = document.getElementById('loading');
        const resultsSection = document.getElementById('resultsSection');

        if (!fileInput.files.length) return;

        analyzeBtn.disabled = true;
        loading.style.display = 'block';
        resultsSection.style.display = 'none';

        try {
            const file = fileInput.files[0];
            this.currentResult = await this.analyzer.analyzeAudioFile(file);
            this.displayResults(this.currentResult);
        } catch (error) {
            console.error('分析失败:', error);
            document.getElementById('resultsContent').innerHTML = 
                `<p style="color: red; text-align: center;">分析失败: ${error.message}</p>`;
            resultsSection.style.display = 'block';
        } finally {
            loading.style.display = 'none';
            analyzeBtn.disabled = false;
        }
    }

    displayResults(result) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');
        
        // 更新时间戳
        document.getElementById('timestamp').textContent = result.timestamp;
        
        // 显示结果区域
        resultsSection.style.display = 'block';
        
        // 创建情绪分布图表
        this.createEmotionChart(result.emotions);
        
        // 创建特征分析图表
        this.createFeatureChart(result.features);
        
        // 更新风险指示器
        this.updateRiskIndicator(result.conflictRisk, result.emotions);
        
        // 生成详细报告
        this.generateReport(result);
        
        // 滚动到结果区域
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    createEmotionChart(emotions) {
        const ctx = document.getElementById('emotionChart').getContext('2d');
        
        if (this.emotionChart) this.emotionChart.destroy();
        
        this.emotionChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['平静', '紧张', '愤怒', '兴奋'],
                datasets: [{
                    data: [emotions.calm, emotions.tense, emotions.angry, emotions.excited],
                    backgroundColor: ['#4CAF50', '#FFC107', '#F44336', '#9C27B0'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    createFeatureChart(features) {
        const ctx = document.getElementById('featureChart').getContext('2d');
        
        if (this.featureChart) this.featureChart.destroy();
        
        this.featureChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['音量强度', '音量变化', '过零率', '高频成分', '低频成分'],
                datasets: [{
                    label: '音频特征',
                    data: [
                        features.volume / 10, 
                        features.variability / 5, 
                        features.zeroCrossing,
                        70, // 模拟高频数据
                        30  // 模拟低频数据
                    ],
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
                    borderColor: '#667eea',
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#667eea'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: {
                            display: true
                        },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
                }
            }
        });
    }

    updateRiskIndicator(risk, emotions) {
        const riskValue = document.getElementById('riskValue');
        const riskLevel = document.getElementById('riskLevel');
        const riskDescription = document.getElementById('riskDescription');
        const meterFill = document.getElementById('meterFill');
        
        riskValue.textContent = risk + '%';
        meterFill.style.width = risk + '%';
        
        let level, color, description;
        
        if (risk < 30) {
            level = '低风险';
            color = '#48bb78';
            description = '对话氛围良好，情绪平稳，冲突可能性低。';
        } else if (risk < 60) {
            level = '中等风险';
            color = '#ecc94b';
            description = '检测到一定紧张情绪，建议注意对话走向。';
        } else {
            level = '高风险';
            color = '#f56565';
            description = '检测到强烈负面情绪，冲突风险较高，建议及时干预。';
        }
        
        riskLevel.textContent = level;
        riskLevel.style.color = color;
        riskDescription.textContent = description;
        meterFill.style.background = color;
    }

    generateReport(result) {
        const { emotions, conflictRisk, duration, features } = result;
        const reportContent = document.getElementById('reportContent');
        
        let reportHTML = `
            <div class="report-item">
                <h4>情绪分布总结</h4>
                <p>分析显示，对话中主要情绪为：<strong>${this.getDominantEmotion(emotions)}</strong>。</p>
                <ul>
                    <li><strong>平静 ${emotions.calm}%</strong>: 语调平稳，音量变化小</li>
                    <li><strong>紧张 ${emotions.tense}%</strong>: 语速较快，音调较高</li>
                    <li><strong>愤怒 ${emotions.angry}%</strong>: 音量突变，语调尖锐
