/**
 * 股票教学案例管理系统 - Render 版
 * 使用内存存储（适合云部署）
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
app.use(express.json());
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
    documents: []
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
    limits: { fileSize: 50 * 1024 * 1024 }
});

const parser = new DocumentParser();

// 初始化演示数据
function initDemoData() {
    // 生成纳指数据
    const today = new Date();
    for (let i = 60; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        const base = 14000 + Math.sin(i / 10) * 1000;
        const random = (Math.random() - 0.5) * 500;
        const close = base + random;
        
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
        { id: 1, date: db.nasdaq[10].date, stock_code: '600519', stock_name: '贵州茅台', pressure_points: [1800], support_points: [1750], risk_points: ['跌破支撑需止损'], opportunity_points: ['机构持续买入'] },
        { id: 2, date: db.nasdaq[20].date, stock_code: '000001', stock_name: '平安银行', pressure_points: [15, 16], support_points: [14], risk_points: ['注意量能变化'], opportunity_points: ['趋势向上'] },
        { id: 3, date: db.nasdaq[30].date, stock_code: '300750', stock_name: '宁德时代', pressure_points: [450], support_points: [400, 380], risk_points: ['高位震荡风险'], opportunity_points: ['新能源龙头', '机构加仓'] }
    ];
    
    // 演示印证案例
    db.evidence = [
        { id: 1, date: db.nasdaq[15].date, stock_code: '600519', stock_name: '贵州茅台', evidence_type: '筹码', evidence_tags: ['单峰密集', '主力流入'], description: '筹码峰集中在1700-1800区间', ppt_page: 5 },
        { id: 2, date: db.nasdaq[25].date, stock_code: '000001', stock_name: '平安银行', evidence_type: '趋势', evidence_tags: ['上升通道', '均线多头排列'], description: '处于上升通道中', ppt_page: 12 },
        { id: 3, date: db.nasdaq[35].date, stock_code: '300750', stock_name: '宁德时代', evidence_type: '机构DC', evidence_tags: ['主力建仓', '资金流入'], description: '机构资金持续流入', ppt_page: 8 }
    ];
    
    // 演示反馈
    db.feedback = [
        { id: 1, date: db.nasdaq[12].date, student_name: '张三', stock_code: '600519', profit_amount: 5000, method_tags: ['筹码', '0家K线'], description: '根据筹码分布买入，获利10%' },
        { id: 2, date: db.nasdaq[22].date, student_name: '李四', stock_code: '000001', profit_amount: 3000, method_tags: ['趋势'], description: '按趋势方法操作，获利8%' }
    ];
}

initDemoData();

// ========== API 路由 ==========

// 获取统计
app.get('/api/stats', (req, res) => {
    res.json({
        caseCount: db.cases.length,
        evidenceCount: db.evidence.length,
        feedbackCount: db.feedback.length,
        nasdaqCount: db.nasdaq.length,
        documentCount: db.documents.length
    });
});

// ========== 文档上传与自动解析 API ==========

app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }
        
        const fileExt = path.extname(req.file.originalname).toLowerCase().slice(1);
        const filePath = req.file.path;
        
        // 读取文件内容
        let text = '';
        try {
            text = fs.readFileSync(filePath, 'utf-8');
        } catch (e) {
            // 如果是二进制文件（如PPT），尝试提取文本
            const buffer = fs.readFileSync(filePath);
            text = extractTextFromBuffer(buffer, fileExt);
        }
        
        // 解析文档
        const parseResult = parser.extractStockInfo(text);
        
        // 保存文档记录
        db.documents.push({
            id: Date.now(),
            filename: req.file.filename,
            original_name: req.file.originalname,
            upload_date: new Date().toISOString()
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
                    source_doc: req.file.originalname
                });
                addedCount++;
            }
        }
        
        res.json({
            success: true,
            documentId: Date.now(),
            filename: req.file.originalname,
            parsed: parseResult,
            addedToCases: addedCount
        });
        
    } catch (error) {
        console.error('解析文档失败:', error);
        res.status(500).json({ error: '解析失败: ' + error.message });
    }
});

// 从缓冲区提取文本
function extractTextFromBuffer(buffer, ext) {
    try {
        let text = '';
        const str = buffer.toString('utf-8');
        
        // PPTX/DOCX 是 ZIP 格式，尝试提取 XML 中的文本
        if (ext === 'pptx' || ext === 'docx') {
            // 提取 <a:t> 标签中的文本（PPTX）
            const textMatches = str.match(/<a:t>([^<]+)<\/a:t>/g);
            if (textMatches) {
                text = textMatches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ');
            }
            
            // 提取 <w:t> 标签中的文本（DOCX）
            const wordMatches = str.match(/<w:t>([^<]+)<\/w:t>/g);
            if (wordMatches) {
                text += ' ' + wordMatches.map(m => m.replace(/<\/?w:t>/g, '')).join(' ');
            }
        }
        
        // 提取中文字符和数字
        if (!text || text.length < 10) {
            const chineseMatches = str.match(/[\u4e00-\u9fa5]+/g);
            const numberMatches = str.match(/\d{6}/g);
            if (chineseMatches) text += chineseMatches.join(' ');
            if (numberMatches) text += ' ' + numberMatches.join(' ');
        }
        
        return text || str.replace(/[^\u4e00-\u9fa5\d\s]/g, ' ');
    } catch (e) {
        return buffer.toString('utf-8');
    }
}

// 获取文档列表
app.get('/api/documents', (req, res) => {
    const docs = db.documents.sort((a, b) => b.id - a.id);
    res.json({ documents: docs });
});

// ========== 案例记录 API ==========

app.get('/api/cases', (req, res) => {
    const cases = db.cases.sort((a, b) => b.id - a.id);
    res.json({ cases });
});

app.post('/api/cases', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.cases.push(data);
    res.json({ success: true, id: data.id });
});

// ========== 印证案例 API ==========

app.get('/api/evidence', (req, res) => {
    let result = [...db.evidence];
    
    if (req.query.tag) {
        result = result.filter(e => 
            e.evidence_type === req.query.tag || 
            (e.evidence_tags && e.evidence_tags.includes(req.query.tag))
        );
    }
    
    if (req.query.stock) {
        result = result.filter(e => e.stock_code === req.query.stock);
    }
    
    res.json({ evidence: result.sort((a, b) => b.id - a.id) });
});

app.post('/api/evidence', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.evidence.push(data);
    res.json({ success: true, id: data.id });
});

// 标签
app.get('/api/tags', (req, res) => {
    const typeCount = {};
    const allTags = new Set();
    
    db.evidence.forEach(e => {
        if (e.evidence_type) {
            typeCount[e.evidence_type] = (typeCount[e.evidence_type] || 0) + 1;
        }
        if (e.evidence_tags) {
            e.evidence_tags.forEach(t => allTags.add(t));
        }
    });
    
    res.json({
        evidence_types: Object.entries(typeCount).map(([name, count]) => ({ name, count })),
        all_tags: Array.from(allTags)
    });
});

// 搜索
app.get('/api/search', (req, res) => {
    const query = (req.query.q || '').toLowerCase();
    const stock = req.query.stock;
    
    let results = db.evidence.filter(e => {
        const matchQuery = !query || 
            (e.evidence_type && e.evidence_type.toLowerCase().includes(query)) ||
            (e.evidence_tags && e.evidence_tags.some(t => t.toLowerCase().includes(query))) ||
            (e.description && e.description.toLowerCase().includes(query));
        const matchStock = !stock || e.stock_code === stock;
        return matchQuery && matchStock;
    });
    
    res.json({ results });
});

// ========== 学员反馈 API ==========

app.get('/api/feedback', (req, res) => {
    let result = [...db.feedback];
    
    if (req.query.method) {
        result = result.filter(f => 
            f.method_tags && f.method_tags.includes(req.query.method)
        );
    }
    
    res.json({ feedback: result.sort((a, b) => b.id - a.id) });
});

app.post('/api/feedback', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.feedback.push(data);
    res.json({ success: true, id: data.id });
});

// ========== 图表数据 API ==========

app.get('/api/nasdaq/data', (req, res) => {
    res.json({ data: db.nasdaq });
});

app.get('/api/chart/data', (req, res) => {
    const cases = {};
    db.cases.forEach(c => {
        if (!cases[c.date]) {
            cases[c.date] = { count: 0, stocks: [] };
        }
        cases[c.date].count++;
        cases[c.date].stocks.push(c.stock_code);
    });
    
    const evidence = {};
    db.evidence.forEach(e => {
        evidence[e.date] = (evidence[e.date] || 0) + 1;
    });
    
    const feedback = {};
    db.feedback.forEach(f => {
        feedback[f.date] = (feedback[f.date] || 0) + 1;
    });
    
    res.json({ nasdaq: db.nasdaq, cases, evidence, feedback });
});

// 生成演示数据
app.post('/api/demo/generate', (req, res) => {
    initDemoData();
    res.json({ success: true, message: '演示数据已生成' });
});

// 页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('  股票教学案例管理系统 - Render版');
    console.log('='.repeat(50));
    console.log(`  🚀 服务已启动！`);
    console.log(`  📍 端口: ${PORT}`);
    console.log('='.repeat(50));
});
