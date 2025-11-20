// 语音情绪分析系统 - 纯前端实现
class AudioEmotionAnalyzer {
    constructor() {
        this.audioContext = null;
    }

    // 初始化音频分析器
    initAudioAnalyzer() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

                // 读取文件为ArrayBuffer
                const arrayBuffer = await this.readFileAsArrayBuffer(audioFile);
                
                // 解码音频数据
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                
                // 分析音频特征
                const features = this.extractAudioFeatures(audioBuffer);
                const emotionResult = this.calculateEmotion(features, audioBuffer.duration);
                
                resolve(emotionResult);
            } catch (error) {
                reject(error);
            }
        });
    }

    // 读取文件为ArrayBuffer
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // 提取音频特征
    extractAudioFeatures(audioBuffer) {
        // 限制分析长度为30秒
        const maxDuration = 30;
        const duration = Math.min(audioBuffer.duration, maxDuration);
        const sampleRate = audioBuffer.sampleRate;
        const totalSamples = Math.floor(duration * sampleRate);
        
        // 获取左声道数据
        const channelData = audioBuffer.getChannelData(0);
        const analysisData = channelData.slice(0, totalSamples);

        const features = {
            duration: duration,
            sampleRate: sampleRate
        };

        // 1. 音量特征 (RMS)
        let sum = 0;
        for (let i = 0; i < analysisData.length; i++) {
            sum += analysisData[i] * analysisData[i];
        }
        features.rms = Math.sqrt(sum / analysisData.length);
        
        // 计算音量变化
        features.rmsVariance = this.calculateVariance(analysisData, features.rms);

        // 2. 过零率 (Zero Crossing Rate)
        let zeroCrossings = 0;
        for (let i = 1; i < analysisData.length; i++) {
            if (analysisData[i-1] * analysisData[i] < 0) {
                zeroCrossings++;
            }
        }
        features.zcr = zeroCrossings / analysisData.length;

        // 3. 频谱特征
        const spectralFeatures = this.calculateSpectralFeatures(analysisData);
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
    calculateSpectralFeatures(data) {
        const features = {};
        
        // 简单的频谱分析
        let lowFreqEnergy = 0;
        let midFreqEnergy = 0;
        let highFreqEnergy = 0;
        
        const third = Math.floor(data.length / 3);
        for (let i = 0; i < data.length; i++) {
            const energy = Math.abs(data[i]);
            if (i < third) lowFreqEnergy += energy;
            else if (i < 2 * third) midFreqEnergy += energy;
            else highFreqEnergy += energy;
        }
        
        const totalEnergy = lowFreqEnergy + midFreqEnergy + highFreqEnergy;
        features.lowFreqRatio = lowFreqEnergy / totalEnergy;
        features.highFreqRatio = highFreqEnergy / totalEnergy;
        
        // 频谱重心（简化计算）
        let weightedSum = 0;
        let sum = 0;
        const frameSize = Math.min(data.length, 1024);
        
        for (let i = 0; i < frameSize; i++) {
            const magnitude = Math.abs(data[i]);
            weightedSum += i * magnitude;
            sum += magnitude;
        }
        
        features.spectralCentroid = sum > 0 ? weightedSum / sum : 0;
        
        return features;
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
        this.currentFile = null;
        this.emotionChart = null;
        this.featureChart = null;
        this.init();
    }

    init() {
        this.bindEvents();
        console.log('语音情绪分析系统已初始化');
    }

    bindEvents() {
        // 文件选择按钮点击事件
        document.getElementById('selectFileBtn').addEventListener('click', () => {
            document.getElementById('audioFile').click();
        });

        // 文件输入变化事件
        document.getElementById('audioFile').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        // 移除文件按钮
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
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    handleFileSelect(e) {
        if (e.target.files.length > 0) {
            this.handleFile(e.target.files[0]);
        }
    }

    handleFile(file) {
        // 验证文件类型
        if (!file.type.startsWith('audio/')) {
            this.showError('请选择音频文件（MP3、WAV、M4A等格式）');
            return;
        }

        // 验证文件大小（最大50MB）
        if (file.size > 50 * 1024 * 1024) {
            this.showError('文件大小不能超过50MB');
            return;
        }

        // 保存文件引用
        this.currentFile = file;

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

    showError(message) {
        alert(message);
        this.resetUpload();
    }

    resetUpload() {
        document.getElementById('audioFile').value = '';
        document.getElementById('audioPlayer').src = '';
        document.getElementById('audioPreview').style.display = 'none';
        document.getElementById('uploadArea').style.display = 'block';
        document.getElementById('fileInfo').textContent = '';
        document.getElementById('analyzeBtn').disabled = true;
        document.getElementById('resultsSection').style.display = 'none';
        this.currentFile = null;
        
        // 清理图表
        if (this.emotionChart) {
            this.emotionChart.destroy();
            this.emotionChart = null;
        }
        if (this.featureChart) {
            this.featureChart.destroy();
            this.featureChart = null;
        }
    }

    async analyzeAudio() {
        if (!this.currentFile) return;

        const analyzeBtn = document.getElementById('analyzeBtn');
        const loading = document.getElementById('loading');
        const resultsSection = document.getElementById('resultsSection');

        analyzeBtn.disabled = true;
        loading.style.display = 'block';
        resultsSection.style.display = 'none';

        try {
            const result = await this.analyzer.analyzeAudioFile(this.currentFile);
            this.displayResults(result);
        } catch (error) {
            console.error('分析失败:', error);
            this.showError('分析失败: ' + error.message);
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
        
        if (this.emotionChart) {
            this.emotionChart.destroy();
        }
        
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
        
        if (this.featureChart) {
            this.featureChart.destroy();
        }
        
        this.featureChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['音量强度', '音量变化', '过零率'],
                datasets: [{
                    label: '音频特征值',
                    data: [
                        features.volume / 10, 
                        features.variability / 5, 
                        features.zeroCrossing
                    ],
                    backgroundColor: [
                        'rgba(102, 126, 234, 0.7)',
                        'rgba(237, 137, 54, 0.7)',
                        'rgba(102, 204, 153, 0.7)'
                    ],
                    borderColor: [
                        'rgb(102, 126, 234)',
                        'rgb(237, 137, 54)',
                        'rgb(102, 204, 153)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
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
        const { emotions, conflictRisk, duration } = result;
        const reportContent = document.getElementById('reportContent');
        
        let reportHTML = `
            <div class="report-item">
                <h4>情绪分布总结</h4>
                <p>分析显示，对话中主要情绪为：<strong>${this.getDominantEmotion(emotions)}</strong>。</p>
                <ul>
                    <li><strong>平静 ${emotions.calm}%</strong>: 语调平稳，音量变化小</li>
                    <li><strong>紧张 ${emotions.tense}%</strong>: 语速较快，音调较高</li>
                    <li><strong>愤怒 ${emotions.angry}%</strong>: 音量突变，语调尖锐</li>
                    <li><strong>兴奋 ${emotions.excited}%</strong>: 能量集中，节奏活跃</li>
                </ul>
            </div>
            
            <div class="report-item">
                <h4>冲突风险评估</h4>
                <p>当前冲突风险指数为 <strong>${conflictRisk}%</strong>，属于${this.getRiskLevel(conflictRisk)}级别。</p>
                <p>${this.getRiskAdvice(conflictRisk)}</p>
            </div>
            
            <div class="report-item">
                <h4>建议措施</h4>
                <p>${this.getActionRecommendations(emotions, conflictRisk)}</p>
            </div>
        `;
        
        reportContent.innerHTML = reportHTML;
    }

    getDominantEmotion(emotions) {
        let maxValue = 0;
        let dominantEmotion = '';
        
        for (const [emotion, value] of Object.entries(emotions)) {
            if (value > maxValue) {
                maxValue = value;
                dominantEmotion = emotion;
            }
        }
        
        const emotionNames = {
            calm: '平静',
            tense: '紧张', 
            angry: '愤怒',
            excited: '兴奋'
        };
        
        return emotionNames[dominantEmotion] || '平静';
    }

    getRiskLevel(risk) {
        if (risk < 30) return '低风险';
        if (risk < 60) return '中等风险';
        return '高风险';
    }

    getRiskAdvice(risk) {
        if (risk < 30) {
            return '当前对话氛围良好，继续保持积极沟通即可。';
        } else if (risk < 60) {
            return '建议关注对话中的紧张情绪，适时引导话题走向更积极的方向。';
        } else {
            return '检测到较高冲突风险，建议暂停当前话题，先处理情绪再继续沟通。';
        }
    }

    getActionRecommendations(emotions, risk) {
        let recommendations = [];
        
        if (emotions.angry > 20) {
            recommendations.push('避免直接对抗，使用"我"语句表达感受');
        }
        
        if (emotions.tense > 30) {
            recommendations.push('尝试降低语速，使用更平静的语调');
        }
        
        if (risk > 50) {
            recommendations.push('考虑暂停讨论，稍后继续');
        }
        
        if (emotions.calm > 50) {
            recommendations.push('当前沟通方式有效，可继续保持');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('当前沟通状态良好，无需特别调整');
        }
        
        return recommendations.map(rec => `• ${rec}`).join('<br>');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new SpeechEmotionApp();
});
