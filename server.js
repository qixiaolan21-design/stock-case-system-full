/**
 * 股票教学案例管理系统 - Render 版
 * 为运营人员优化 - 整理 YouTube 主播课件
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const DocumentParser = require('./documentParser-simple');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 确保上传目录存在
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// 内存数据库
const db = {
    cases: [],
    evidence: [],
    feedback: [],
    nasdaq: [],
    documents: [],
    videos: [], // 视频记录
    tags: [], // 标签库
    exportHistory: [] // 导出历史
};

// 文件上传配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

const parser = new DocumentParser();

// 初始化演示数据
function initDemoData() {
    // 纳指数据
    const today = new Date();
    for (let i = 60; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const base = 14000 + Math.sin(i / 10) * 1000;
        const close = base + (Math.random() - 0.5) * 500;
        db.nasdaq.push({
            date: date.toISOString().split('T')[0],
            open: parseFloat((close + (Math.random() - 0.5) * 100).toFixed(2)),
            high: parseFloat((Math.max(close, close + (Math.random() - 0.5) * 100) + Math.random() * 50).toFixed(2)),
            low: parseFloat((Math.min(close, close + (Math.random() - 0.5) * 100) - Math.random() * 50).toFixed(2)),
            close: parseFloat(close.toFixed(2))
        });
    }
    
    // 演示案例
    db.cases = [
        { id: 1, date: db.nasdaq[10].date, stock_code: '600519', stock_name: '贵州茅台', pressure_points: [1800], support_points: [1750], risk_points: ['跌破支撑需止损'], opportunity_points: ['机构持续买入'], source_video: '2024-01-15 直播' },
        { id: 2, date: db.nasdaq[20].date, stock_code: '000001', stock_name: '平安银行', pressure_points: [15, 16], support_points: [14], risk_points: ['注意量能变化'], opportunity_points: ['趋势向上'], source_video: '2024-01-20 直播' }
    ];
    
    // 演示印证案例（关联PPT）
    db.evidence = [
        { id: 1, date: db.nasdaq[15].date, stock_code: '600519', stock_name: '贵州茅台', evidence_type: '筹码', evidence_tags: ['单峰密集', '主力流入'], description: '筹码峰集中在1700-1800区间', ppt_page: 5, video_title: '筹码分析专场', video_url: '', timestamp: '15:30' },
        { id: 2, date: db.nasdaq[25].date, stock_code: '000001', stock_name: '平安银行', evidence_type: '趋势', evidence_tags: ['上升通道', '均线多头排列'], description: '处于上升通道中', ppt_page: 12, video_title: '趋势交易技巧', video_url: '', timestamp: '22:15' }
    ];
    
    // 演示视频记录
    db.videos = [
        { id: 1, title: '筹码分析专场', date: '2024-01-15', url: 'https://youtube.com/xxx', duration: '45:00', topic: '筹码', stock_count: 5 },
        { id: 2, title: '趋势交易技巧', date: '2024-01-20', url: 'https://youtube.com/yyy', duration: '38:00', topic: '趋势', stock_count: 3 }
    ];
    
    // 标签库
    db.tags = ['筹码', '机构DC', '密码', '趋势', '量能', 'K线', '支撑压力', '均线', '0家K线', '飘带'];
}

initDemoData();

// ========== API 路由 ==========

app.get('/api/stats', (req, res) => {
    res.json({
        caseCount: db.cases.length,
        evidenceCount: db.evidence.length,
        feedbackCount: db.feedback.length,
        nasdaqCount: db.nasdaq.length,
        documentCount: db.documents.length,
        videoCount: db.videos.length
    });
});

// ========== 文档上传（支持PPT/PDF/Word） ==========

app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }
        
        const originalName = req.file.originalname;
        const fileExt = path.extname(originalName).toLowerCase();
        const filePath = req.file.path;
        
        console.log('上传文件:', originalName, '类型:', fileExt);
        
        // 读取文件内容
        let text = '';
        
        if (fileExt === '.txt' || fileExt === '.csv') {
            // 文本文件直接读取
            text = fs.readFileSync(filePath, 'utf-8');
        } else if (fileExt === '.pptx' || fileExt === '.docx') {
            // Office文件：解压提取XML文本
            text = await extractOfficeText(filePath, fileExt);
        } else if (fileExt === '.pdf') {
            // PDF：尝试读取文本
            try {
                text = fs.readFileSync(filePath, 'utf-8');
            } catch (e) {
                text = extractBinaryText(fs.readFileSync(filePath));
            }
        } else {
            // 其他文件尝试提取
            text = extractBinaryText(fs.readFileSync(filePath));
        }
        
        console.log('提取文本长度:', text.length);
        
        // 解析文档
        const parseResult = parser.extractStockInfo(text);
        
        // 保存文档记录
        const docId = Date.now();
        db.documents.push({
            id: docId,
            filename: req.file.filename,
            original_name: originalName,
            file_type: fileExt,
            upload_date: new Date().toISOString(),
            extracted_text: text.substring(0, 5000), // 只保存前5000字符
            stock_count: parseResult.stocks.length
        });
        
        // 自动将解析出的股票添加到案例库
        const today = new Date().toISOString().split('T')[0];
        let addedCount = 0;
        
        for (const stock of parseResult.stocks) {
            const exists = db.cases.find(c => 
                c.stock_code === stock.stock_code && c.date === today
            );
            if (!exists) {
                db.cases.push({
                    id: Date.now() + addedCount,
                    date: today,
                    ...stock,
                    source_doc: originalName
                });
                addedCount++;
            }
        }
        
        res.json({
            success: true,
            documentId: docId,
            filename: originalName,
            fileType: fileExt,
            parsed: parseResult,
            addedToCases: addedCount,
            preview: text.substring(0, 500) // 返回前500字符预览
        });
        
    } catch (error) {
        console.error('解析文档失败:', error);
        res.status(500).json({ error: '解析失败: ' + error.message });
    }
});

// 提取 Office 文档文本
async function extractOfficeText(filePath, ext) {
    try {
        const JSZip = require('jszip');
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);
        
        let text = '';
        
        // PPTX: 提取 slide XML 中的文本
        if (ext === '.pptx') {
            const slideFiles = Object.keys(zip.files).filter(f => 
                f.startsWith('ppt/slides/slide') && f.endsWith('.xml')
            );
            
            for (const slideFile of slideFiles) {
                const content = await zip.files[slideFile].async('text');
                // 提取 <a:t> 标签内容
                const matches = content.match(/<a:t>([^<]+)<\/a:t>/g);
                if (matches) {
                    text += matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ') + '\n';
                }
            }
        }
        
        // DOCX: 提取 document.xml 中的文本
        if (ext === '.docx') {
            const docXml = zip.files['word/document.xml'];
            if (docXml) {
                const content = await docXml.async('text');
                const matches = content.match(/<w:t>([^<]+)<\/w:t>/g);
                if (matches) {
                    text = matches.map(m => m.replace(/<\/?w:t>/g, '')).join(' ');
                }
            }
        }
        
        return text;
    } catch (e) {
        console.error('Office提取失败:', e);
        return extractBinaryText(fs.readFileSync(filePath));
    }
}

// 从二进制文件提取可读文本
function extractBinaryText(buffer) {
    let text = '';
    const str = buffer.toString('utf-8');
    
    // 提取中文字符
    const chineseMatches = str.match(/[\u4e00-\u9fa5]{2,}/g);
    if (chineseMatches) {
        text += chineseMatches.join(' ');
    }
    
    // 提取股票代码（6位数字）
    const stockMatches = str.match(/\d{6}/g);
    if (stockMatches) {
        text += ' ' + stockMatches.join(' ');
    }
    
    // 提取数字（价格等）
    const numMatches = str.match(/\d{2,4}\.\d{1,2}/g);
    if (numMatches) {
        text += ' ' + numMatches.join(' ');
    }
    
    return text;
}

// ========== 视频管理 API ==========

app.get('/api/videos', (req, res) => {
    res.json({ videos: db.videos.sort((a, b) => b.id - a.id) });
});

app.post('/api/videos', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.videos.push(data);
    res.json({ success: true, id: data.id });
});

// ========== 案例、印证、反馈 API ==========

app.get('/api/cases', (req, res) => {
    let result = [...db.cases];
    if (req.query.video) {
        result = result.filter(c => c.source_video === req.query.video);
    }
    res.json({ cases: result.sort((a, b) => b.id - a.id) });
});

app.post('/api/cases', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.cases.push(data);
    res.json({ success: true, id: data.id });
});

app.get('/api/evidence', (req, res) => {
    let result = [...db.evidence];
    if (req.query.tag) {
        result = result.filter(e => 
            e.evidence_type === req.query.tag || 
            (e.evidence_tags && e.evidence_tags.includes(req.query.tag))
        );
    }
    if (req.query.video) {
        result = result.filter(e => e.video_title === req.query.video);
    }
    res.json({ evidence: result.sort((a, b) => b.id - a.id) });
});

app.post('/api/evidence', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.evidence.push(data);
    res.json({ success: true, id: data.id });
});

app.get('/api/feedback', (req, res) => {
    res.json({ feedback: db.feedback.sort((a, b) => b.id - a.id) });
});

app.post('/api/feedback', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.feedback.push(data);
    res.json({ success: true, id: data.id });
});

// ========== 标签管理 ==========

app.get('/api/tags', (req, res) => {
    const typeCount = {};
    db.evidence.forEach(e => {
        if (e.evidence_type) {
            typeCount[e.evidence_type] = (typeCount[e.evidence_type] || 0) + 1;
        }
    });
    
    res.json({
        all_tags: db.tags,
        evidence_types: Object.entries(typeCount).map(([name, count]) => ({ name, count }))
    });
});

app.post('/api/tags', (req, res) => {
    const { tag } = req.body;
    if (tag && !db.tags.includes(tag)) {
        db.tags.push(tag);
    }
    res.json({ success: true, tags: db.tags });
});

// ========== 搜索 ==========

app.get('/api/search', (req, res) => {
    const query = (req.query.q || '').toLowerCase();
    const type = req.query.type || 'all';
    
    let results = [];
    
    if (type === 'all' || type === 'evidence') {
        const evidence = db.evidence.filter(e => 
            (e.evidence_type && e.evidence_type.toLowerCase().includes(query)) ||
            (e.evidence_tags && e.evidence_tags.some(t => t.toLowerCase().includes(query))) ||
            (e.description && e.description.toLowerCase().includes(query)) ||
            (e.stock_code && e.stock_code.includes(query)) ||
            (e.stock_name && e.stock_name.toLowerCase().includes(query))
        );
        results = [...results, ...evidence.map(e => ({ ...e, result_type: 'evidence' }))];
    }
    
    if (type === 'all' || type === 'cases') {
        const cases = db.cases.filter(c => 
            (c.stock_code && c.stock_code.includes(query)) ||
            (c.stock_name && c.stock_name.toLowerCase().includes(query))
        );
        results = [...results, ...cases.map(c => ({ ...c, result_type: 'case' }))];
    }
    
    res.json({ results });
});

// ========== 导出功能 ==========

app.post('/api/export', (req, res) => {
    const { type, filters } = req.body;
    
    let data = [];
    if (type === 'evidence') {
        data = db.evidence;
        if (filters.tag) {
            data = data.filter(e => e.evidence_type === filters.tag);
        }
    } else if (type === 'cases') {
        data = db.cases;
    }
    
    // 记录导出历史
    db.exportHistory.push({
        id: Date.now(),
        type,
        filters,
        count: data.length,
        date: new Date().toISOString()
    });
    
    res.json({
        success: true,
        data,
        count: data.length,
        exportDate: new Date().toISOString()
    });
});

app.get('/api/export/history', (req, res) => {
    res.json({ history: db.exportHistory.sort((a, b) => b.id - a.id) });
});

// ========== 图表数据 ==========

app.get('/api/chart/data', (req, res) => {
    const cases = {};
    db.cases.forEach(c => {
        if (!cases[c.date]) cases[c.date] = { count: 0, stocks: [] };
        cases[c.date].count++;
        cases[c.date].stocks.push(c.stock_code);
    });
    
    res.json({ 
        nasdaq: db.nasdaq, 
        cases, 
        evidence: db.evidence,
        videos: db.videos 
    });
});

// 页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('  股票教学案例管理系统 - 运营版');
    console.log('='.repeat(50));
    console.log(`  🚀 服务已启动！端口: ${PORT}`);
    console.log('='.repeat(50));
});
