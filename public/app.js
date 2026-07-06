/**
 * 股票教学案例管理系统 - 前端逻辑
 */

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('case-date').value = today;
    document.getElementById('evidence-date').value = today;
    document.getElementById('feedback-date').value = today;
    
    initUploadZone();
    updateStats();
    loadCases();
    loadEvidence();
    loadFeedback();
    loadDocuments();
    loadTags();
});

// 显示页面
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('bg-blue-50', 'text-blue-600');
        n.classList.add('text-gray-700');
    });
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('bg-blue-50', 'text-blue-600');
    
    if (sectionId === 'chart') setTimeout(loadChart, 100);
}

// 更新统计
async function updateStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('stat-cases').textContent = data.caseCount;
        document.getElementById('stat-evidence').textContent = data.evidenceCount;
        document.getElementById('stat-feedback').textContent = data.feedbackCount;
        document.getElementById('stat-docs').textContent = data.documentCount || 0;
    } catch (e) { console.error('加载统计失败:', e); }
}

// ========== 文件上传 ==========
function initUploadZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) handleFileUpload(files[0]);
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileUpload(e.target.files[0]);
    });
}

async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('document', file);
    
    const dropZone = document.getElementById('drop-zone');
    dropZone.innerHTML = '<p class="text-lg text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>正在解析文档...</p>';
    
    try {
        const res = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await res.json();
        
        if (result.success) {
            showParseResult(result);
            updateStats();
            loadCases();
            loadDocuments();
        } else {
            alert('解析失败: ' + result.error);
        }
    } catch (e) {
        alert('上传失败: ' + e);
    } finally {
        dropZone.innerHTML = `
            <i class="fas fa-cloud-upload-alt text-5xl text-gray-400 mb-4"></i>
            <p class="text-lg text-gray-600 mb-2">拖拽文档到此处，或点击上传</p>
            <p class="text-sm text-gray-400">支持 Word (.docx)、PDF (.pdf)、文本 (.txt)</p>
        `;
    }
}

function showParseResult(result) {
    const resultDiv = document.getElementById('upload-result');
    const summaryDiv = document.getElementById('parse-summary');
    const stocksDiv = document.getElementById('parsed-stocks');
    
    resultDiv.classList.remove('hidden');
    
    summaryDiv.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <p class="text-green-700"><i class="fas fa-check-circle mr-2"></i>${result.parsed.summary}</p>
            <p class="text-sm text-green-600 mt-1">已自动添加 ${result.addedToCases} 只股票到案例库</p>
        </div>
    `;
    
    if (result.parsed.stocks.length === 0) {
        stocksDiv.innerHTML = '<p class="text-gray-400">未检测到股票信息</p>';
        return;
    }
    
    stocksDiv.innerHTML = result.parsed.stocks.map(s => `
        <div class="border rounded-lg p-4 bg-gray-50">
            <div class="flex items-center justify-between mb-2">
                <span class="font-bold text-lg">${s.stock_name || s.stock_code} (${s.stock_code})</span>
                ${s.evidence_type ? `<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm">${s.evidence_type}</span>` : ''}
            </div>
            ${s.pressure_points.length ? `<p class="text-sm text-red-600">压力: ${s.pressure_points.join(', ')}</p>` : ''}
            ${s.support_points.length ? `<p class="text-sm text-green-600">支撑: ${s.support_points.join(', ')}</p>` : ''}
            ${s.risk_points.length ? `<p class="text-sm text-orange-600">风险: ${s.risk_points.join('; ')}</p>` : ''}
            ${s.opportunity_points.length ? `<p class="text-sm text-blue-600">机会: ${s.opportunity_points.join('; ')}</p>` : ''}
            ${s.tags.length ? `<p class="text-sm text-gray-500 mt-1">标签: ${s.tags.join(', ')}</p>` : ''}
        </div>
    `).join('');
}

async function loadDocuments() {
    try {
        const res = await fetch('/api/documents');
        const data = await res.json();
        const container = document.getElementById('documents-list');
        
        if (data.documents.length === 0) {
            container.innerHTML = '<p class="text-gray-400">暂无上传的文档</p>';
            return;
        }
        
        container.innerHTML = data.documents.map(d => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center">
                    <i class="fas fa-file-alt text-gray-400 mr-3"></i>
                    <span>${d.original_name}</span>
                </div>
                <span class="text-sm text-gray-400">${new Date(d.upload_date).toLocaleString()}</span>
            </div>
        `).join('');
    } catch (e) { console.error('加载文档失败:', e); }
}

// ========== 案例记录 ==========
async function addCase() {
    const data = {
        date: document.getElementById('case-date').value,
        stock_code: document.getElementById('case-code').value,
        stock_name: document.getElementById('case-name').value,
        pressure_points: document.getElementById('case-pressure').value.split(',').map(s => s.trim()).filter(s => s),
        support_points: document.getElementById('case-support').value.split(',').map(s => s.trim()).filter(s => s),
        risk_points: document.getElementById('case-risk').value.split('\n').filter(s => s.trim()),
        opportunity_points: document.getElementById('case-opportunity').value.split('\n').filter(s => s.trim())
    };
    
    if (!data.stock_code) { alert('请输入股票代码'); return; }
    
    try {
        const res = await fetch('/api/cases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            alert('添加成功！');
            document.getElementById('case-code').value = '';
            document.getElementById('case-name').value = '';
            document.getElementById('case-pressure').value = '';
            document.getElementById('case-support').value = '';
            document.getElementById('case-risk').value = '';
            document.getElementById('case-opportunity').value = '';
            loadCases();
            updateStats();
        }
    } catch (e) { alert('添加失败: ' + e); }
}

async function loadCases() {
    try {
        const res = await fetch('/api/cases');
        const data = await res.json();
        const container = document.getElementById('cases-list');
        
        if (data.cases.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">暂无案例，请上传文档或手动添加</p>';
            return;
        }
        
        container.innerHTML = data.cases.slice(0, 50).map(c => `
            <div class="border rounded-lg p-4 hover:shadow-md transition-all">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-semibold">${c.stock_name || c.stock_code}</span>
                        <span class="text-gray-400">(${c.stock_code})</span>
                        <span class="text-gray-400 ml-2">${c.date}</span>
                    </div>
                </div>
                <div class="mt-2 text-sm">
                    ${c.pressure_points && c.pressure_points.length ? `<span class="text-red-600">压力: ${c.pressure_points.join(', ')}</span>` : ''}
                    ${c.support_points && c.support_points.length ? `<span class="text-green-600 ml-4">支撑: ${c.support_points.join(', ')}</span>` : ''}
                </div>
                ${c.risk_points && c.risk_points.length ? `<p class="text-sm text-orange-600 mt-1">风险: ${c.risk_points.join('; ')}</p>` : ''}
                ${c.opportunity_points && c.opportunity_points.length ? `<p class="text-sm text-blue-600 mt-1">机会: ${c.opportunity_points.join('; ')}</p>` : ''}
            </div>
        `).join('');
    } catch (e) { console.error('加载案例失败:', e); }
}

// ========== 印证案例 ==========
async function addEvidence() {
    const data = {
        date: document.getElementById('evidence-date').value,
        stock_code: document.getElementById('evidence-code').value,
        stock_name: document.getElementById('evidence-name').value,
        evidence_type: document.getElementById('evidence-type').value,
        evidence_tags: document.getElementById('evidence-tags').value.split(',').map(s => s.trim()).filter(s => s),
        description: document.getElementById('evidence-desc').value,
        ppt_page: document.getElementById('evidence-page').value
    };
    
    if (!data.stock_code) { alert('请输入股票代码'); return; }
    
    try {
        const res = await fetch('/api/evidence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            alert('添加成功！');
            document.getElementById('evidence-code').value = '';
            document.getElementById('evidence-name').value = '';
            document.getElementById('evidence-tags').value = '';
            document.getElementById('evidence-desc').value = '';
            document.getElementById('evidence-page').value = '';
            loadEvidence();
            updateStats();
        }
    } catch (e) { alert('添加失败: ' + e); }
}

async function loadEvidence() {
    try {
        const res = await fetch('/api/evidence');
        const data = await res.json();
        const container = document.getElementById('evidence-list');
        
        if (data.evidence.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">暂无印证案例</p>';
            return;
        }
        
        const typeColors = {
            '筹码': 'bg-blue-100 text-blue-700', '机构DC': 'bg-purple-100 text-purple-700',
            '密码': 'bg-orange-100 text-orange-700', '趋势': 'bg-green-100 text-green-700',
            '量能': 'bg-pink-100 text-pink-700', 'K线': 'bg-yellow-100 text-yellow-700',
            '支撑压力': 'bg-indigo-100 text-indigo-700', '均线': 'bg-teal-100 text-teal-700'
        };
        
        container.innerHTML = data.evidence.slice(0, 50).map(e => `
            <div class="border rounded-lg p-4 hover:shadow-md transition-all">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-semibold">${e.stock_name || e.stock_code}</span>
                        <span class="text-gray-400">(${e.stock_code})</span>
                        <span class="text-gray-400 ml-2">${e.date}</span>
                        ${e.evidence_type ? `<span class="ml-2 px-2 py-1 rounded text-sm ${typeColors[e.evidence_type] || 'bg-gray-100'}">${e.evidence_type}</span>` : ''}
                    </div>
                    ${e.ppt_page ? `<span class="text-sm text-gray-500">PPT第${e.ppt_page}页</span>` : ''}
                </div>
                ${e.evidence_tags && e.evidence_tags.length ? `
                    <div class="mt-2">${e.evidence_tags.map(t => `<span class="px-2 py-1 bg-gray-100 rounded text-sm mr-1">${t}</span>`).join('')}</div>
                ` : ''}
                ${e.description ? `<p class="mt-2 text-gray-600 text-sm">${e.description}</p>` : ''}
            </div>
        `).join('');
    } catch (e) { console.error('加载印证案例失败:', e); }
}

async function loadTags() {
    try {
        const res = await fetch('/api/tags');
        const data = await res.json();
        const container = document.getElementById('tag-cloud');
        
        if (data.evidence_types.length === 0) return;
        
        container.innerHTML = data.evidence_types.map(t => {
            const colors = {
                '筹码': 'bg-blue-100 text-blue-700 hover:bg-blue-200',
                '机构DC': 'bg-purple-100 text-purple-700 hover:bg-purple-200',
                '密码': 'bg-orange-100 text-orange-700 hover:bg-orange-200',
                '趋势': 'bg-green-100 text-green-700 hover:bg-green-200',
                '量能': 'bg-pink-100 text-pink-700 hover:bg-pink-200',
                'K线': 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
            };
            return `<span class="px-3 py-1 rounded-full cursor-pointer ${colors[t.name] || 'bg-gray-100 text-gray-700 hover:bg-gray-200'}" onclick="searchByTag('${t.name}')">${t.name} (${t.count})</span>`;
        }).join('');
    } catch (e) { console.error('加载标签失败:', e); }
}

// ========== 学员反馈 ==========
async function addFeedback() {
    const methodTags = Array.from(document.querySelectorAll('.method-tag:checked')).map(cb => cb.value);
    const data = {
        date: document.getElementById('feedback-date').value,
        student_name: document.getElementById('feedback-student').value,
        stock_code: document.getElementById('feedback-stock').value,
        profit_amount: parseFloat(document.getElementById('feedback-profit').value) || null,
        method_tags: methodTags,
        description: document.getElementById('feedback-desc').value
    };
    
    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            alert('添加成功！');
            document.getElementById('feedback-student').value = '';
            document.getElementById('feedback-stock').value = '';
            document.getElementById('feedback-profit').value = '';
            document.getElementById('feedback-desc').value = '';
            document.querySelectorAll('.method-tag').forEach(cb => cb.checked = false);
            loadFeedback();
            updateStats();
        }
    } catch (e) { alert('添加失败: ' + e); }
}

async function loadFeedback() {
    try {
        const res = await fetch('/api/feedback');
        const data = await res.json();
        const container = document.getElementById('feedback-list');
        
        if (data.feedback.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">暂无反馈</p>';
            return;
        }
        
        container.innerHTML = data.feedback.slice(0, 50).map(f => `
            <div class="border rounded-lg p-4 hover:shadow-md transition-all">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-semibold">${f.student_name || '匿名'}</span>
                        <span class="text-gray-400 ml-2">${f.date}</span>
                        ${f.stock_code ? `<span class="text-gray-500 ml-2">(${f.stock_code})</span>` : ''}
                    </div>
                    ${f.profit_amount ? `<span class="text-green-600 font-bold">+${f.profit_amount.toLocaleString()}</span>` : ''}
                </div>
                ${f.method_tags && f.method_tags.length ? `
                    <div class="mt-2">${f.method_tags.map(t => `<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm mr-1">${t}</span>`).join('')}</div>
                ` : ''}
                ${f.description ? `<p class="mt-2 text-gray-600 text-sm">${f.description}</p>` : ''}
            </div>
        `).join('');
    } catch (e) { console.error('加载反馈失败:', e); }
}

// ========== 搜索 ==========
async function performSearch() {
    const query = document.getElementById('search-input').value;
    const stock = document.getElementById('search-stock').value;
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (stock) params.append('stock', stock);
    
    try {
        const res = await fetch('/api/search?' + params);
        const data = await res.json();
        const container = document.getElementById('search-results');
        
        if (data.results.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">未找到相关案例</p>';
            return;
        }
        
        container.innerHTML = data.results.map(r => `
            <div class="border rounded-lg p-4 hover:shadow-md transition-all">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-semibold">${r.stock_name || r.stock_code}</span>
                        <span class="text-gray-400">(${r.stock_code})</span>
                        <span class="text-gray-400 ml-2">${r.date}</span>
                        ${r.evidence_type ? `<span class="ml-2 px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm">${r.evidence_type}</span>` : ''}
                    </div>
                    ${r.ppt_page ? `<span class="text-sm text-gray-500">PPT第${r.ppt_page}页</span>` : ''}
                </div>
                ${r.evidence_tags && r.evidence_tags.length ? `
                    <div class="mt-2">${r.evidence_tags.map(t => `<span class="px-2 py-1 bg-gray-100 rounded text-sm mr-1">${t}</span>`).join('')}</div>
                ` : ''}
                ${r.description ? `<p class="mt-2 text-gray-600 text-sm">${r.description}</p>` : ''}
            </div>
        `).join('');
    } catch (e) { console.error('搜索失败:', e); }
}

function searchByTag(tag) {
    document.getElementById('search-input').value = tag;
    performSearch();
}

// ========== 图表 ==========
let chart = null;
async function loadChart() {
    try {
        const res = await fetch('/api/chart/data');
        const data = await res.json();
        
        if (!chart) chart = echarts.init(document.getElementById('chart-container'));
        
        if (data.nasdaq.length === 0) {
            document.getElementById('chart-container').innerHTML = '<div class="flex items-center justify-center h-full text-gray-400">暂无数据，请先生成演示数据</div>';
            return;
        }
        
        const dates = data.nasdaq.map(d => d.date);
        const prices = data.nasdaq.map(d => [d.open, d.close, d.low, d.high]);
        
        // 标记案例日期
        const caseData = data.cases.map(c => ({
            name: '案例',
            value: [c.date, data.nasdaq.find(n => n.date === c.date)?.close || 0],
            stocks: c.stocks
        }));
        
        const option = {
            title: { text: '纳指走势与教学案例', left: 'center' },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                formatter: function(params) {
                    let html = params[0].axisValue + '<br/>';
                    if (params[0].seriesName === '纳指') {
                        const d = params[0].data;
                        html += `开盘: ${d[1]}<br/>收盘: ${d[2]}<br/>最低: ${d[3]}<br/>最高: ${d[4]}`;
                    }
                    return html;
                }
            },
            legend: { data: ['纳指', '案例'], top: 30 },
            xAxis: { type: 'category', data: dates, scale: true },
            yAxis: { scale: true },
            dataZoom: [
                { type: 'inside', start: 50, end: 100 },
                { type: 'slider', top: '90%', start: 50, end: 100 }
            ],
            series: [
                {
                    name: '纳指',
                    type: 'candlestick',
                    data: prices,
                    itemStyle: { color: '#ef232a', color0: '#14b143' }
                },
                {
                    name: '案例',
                    type: 'scatter',
                    data: caseData,
                    symbolSize: 10,
                    itemStyle: { color: '#3b82f6' }
                }
            ]
        };
        
        chart.setOption(option);
    } catch (e) { console.error('加载图表失败:', e); }
}

async function generateDemoData() {
    try {
        await fetch('/api/demo/generate', { method: 'POST' });
        alert('演示数据已生成！');
        updateStats();
        loadChart();
    } catch (e) { alert('生成失败: ' + e); }
}
