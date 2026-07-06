/**
 * 股票教学案例管理系统 - Vercel 适配版
 * 使用内存存储（适合演示）
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const DocumentParser = require('./documentParser');

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 内存数据库
const db = {
    cases: [],
    evidence: [],
    feedback: [],
    nasdaq: [],
    documents: []
};

// 文件上传配置（内存存储）
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

const parser = new DocumentParser();

// 初始化演示数据
function initDemoData() {
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
}
initDemoData();

// API 路由

app.get('/api/stats', (req, res) => {
    res.json({
        caseCount: db.cases.length,
        evidenceCount: db.evidence.length,
        feedbackCount: db.feedback.length,
        nasdaqCount: db.nasdaq.length,
        documentCount: db.documents.length
    });
});

// 文档上传
app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '没有上传文件' });
        
        const text = req.file.buffer.toString('utf-8');
        const parseResult = parser.extractStockInfo(text);
        
        db.documents.push({
            id: Date.now(),
            filename: req.file.originalname,
            upload_date: new Date().toISOString()
        });
        
        // 添加到案例库
        const today = new Date().toISOString().split('T')[0];
        let addedCount = 0;
        for (const stock of parseResult.stocks) {
            if (!db.cases.find(c => c.stock_code === stock.stock_code && c.date === today)) {
                db.cases.push({ id: Date.now() + addedCount, date: today, ...stock, source_doc: req.file.originalname });
                addedCount++;
            }
        }
        
        res.json({ success: true, parsed: parseResult, addedToCases: addedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/documents', (req, res) => {
    res.json({ documents: db.documents });
});

// 案例
app.get('/api/cases', (req, res) => {
    res.json({ cases: db.cases.sort((a, b) => b.id - a.id) });
});

app.post('/api/cases', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.cases.push(data);
    res.json({ success: true, id: data.id });
});

// 印证案例
app.get('/api/evidence', (req, res) => {
    let result = db.evidence;
    if (req.query.tag) {
        result = result.filter(e => e.evidence_type === req.query.tag || (e.evidence_tags && e.evidence_tags.includes(req.query.tag)));
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
        if (e.evidence_type) typeCount[e.evidence_type] = (typeCount[e.evidence_type] || 0) + 1;
        if (e.evidence_tags) e.evidence_tags.forEach(t => allTags.add(t));
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
    const results = db.evidence.filter(e => {
        const matchQuery = !query || (e.evidence_type && e.evidence_type.toLowerCase().includes(query)) ||
            (e.evidence_tags && e.evidence_tags.some(t => t.toLowerCase().includes(query))) ||
            (e.description && e.description.toLowerCase().includes(query));
        const matchStock = !stock || e.stock_code === stock;
        return matchQuery && matchStock;
    });
    res.json({ results });
});

// 反馈
app.get('/api/feedback', (req, res) => {
    let result = db.feedback;
    if (req.query.method) {
        result = result.filter(f => f.method_tags && f.method_tags.includes(req.query.method));
    }
    res.json({ feedback: result.sort((a, b) => b.id - a.id) });
});

app.post('/api/feedback', (req, res) => {
    const data = { id: Date.now(), ...req.body };
    db.feedback.push(data);
    res.json({ success: true, id: data.id });
});

// 图表数据
app.get('/api/chart/data', (req, res) => {
    const cases = {};
    db.cases.forEach(c => {
        if (!cases[c.date]) cases[c.date] = { count: 0, stocks: [] };
        cases[c.date].count++;
        cases[c.date].stocks.push(c.stock_code);
    });
    res.json({ nasdaq: db.nasdaq, cases, evidence: {}, feedback: {} });
});

// 页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
