/**
 * 股票教学案例管理系统 - 完整版服务器
 * 包含：文档自动解析、数据库存储、图表展示
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const Database = require('better-sqlite3');
const DocumentParser = require('./documentParser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保数据目录存在
if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
}

// 数据库初始化
const db = new Database('data/stock_cases.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        stock_code TEXT NOT NULL,
        stock_name TEXT,
        pressure_points TEXT,
        support_points TEXT,
        risk_points TEXT,
        opportunity_points TEXT,
        source_doc TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        stock_code TEXT NOT NULL,
        stock_name TEXT,
        evidence_type TEXT,
        evidence_tags TEXT,
        description TEXT,
        ppt_page INTEGER,
        image_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        student_name TEXT,
        stock_code TEXT,
        profit_amount REAL,
        method_tags TEXT,
        description TEXT,
        screenshot_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS nasdaq_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        original_name TEXT,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        parsed_data TEXT
    );
`);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 确保上传目录存在
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

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
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const parser = new DocumentParser();

// ========== API 路由 ==========

// 获取统计
app.get('/api/stats', (req, res) => {
    const stats = db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM cases) as caseCount,
            (SELECT COUNT(*) FROM evidence) as evidenceCount,
            (SELECT COUNT(*) FROM feedback) as feedbackCount,
            (SELECT COUNT(*) FROM nasdaq_data) as nasdaqCount
    `).get();
    res.json(stats);
});

// ========== 案例记录 API ==========

app.get('/api/cases', (req, res) => {
    const cases = db.prepare('SELECT * FROM cases ORDER BY date DESC, id DESC').all();
    res.json({ cases: cases.map(c => ({
        ...c,
        pressure_points: JSON.parse(c.pressure_points || '[]'),
        support_points: JSON.parse(c.support_points || '[]'),
        risk_points: JSON.parse(c.risk_points || '[]'),
        opportunity_points: JSON.parse(c.opportunity_points || '[]')
    })) });
});

app.post('/api/cases', (req, res) => {
    const { date, stock_code, stock_name, pressure_points, support_points, risk_points, opportunity_points } = req.body;
    
    const result = db.prepare(`
        INSERT INTO cases (date, stock_code, stock_name, pressure_points, support_points, risk_points, opportunity_points)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        date, stock_code, stock_name,
        JSON.stringify(pressure_points || []),
        JSON.stringify(support_points || []),
        JSON.stringify(risk_points || []),
        JSON.stringify(opportunity_points || [])
    );
    
    res.json({ success: true, id: result.lastInsertRowid });
});

// ========== 文档上传与自动解析 API ==========

app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }
        
        const fileExt = path.extname(req.file.originalname).toLowerCase().slice(1);
        const filePath = req.file.path;
        
        // 解析文档
        const parseResult = await parser.parseDocument(filePath, fileExt);
        
        // 保存解析结果
        const docResult = db.prepare(`
            INSERT INTO documents (filename, original_name, parsed_data)
            VALUES (?, ?, ?)
        `).run(req.file.filename, req.file.originalname, JSON.stringify(parseResult));
        
        // 自动将解析出的股票添加到案例库
        const insertCase = db.prepare(`
            INSERT INTO cases (date, stock_code, stock_name, pressure_points, support_points, risk_points, opportunity_points, source_doc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const today = new Date().toISOString().split('T')[0];
        let addedCount = 0;
        
        for (const stock of parseResult.stocks) {
            try {
                insertCase.run(
                    today,
                    stock.stock_code,
                    stock.stock_name,
                    JSON.stringify(stock.pressure_points),
                    JSON.stringify(stock.support_points),
                    JSON.stringify(stock.risk_points),
                    JSON.stringify(stock.opportunity_points),
                    req.file.originalname
                );
                addedCount++;
            } catch (e) {
                // 忽略重复
            }
        }
        
        res.json({
            success: true,
            documentId: docResult.lastInsertRowid,
            filename: req.file.originalname,
            parsed: parseResult,
            addedToCases: addedCount
        });
        
    } catch (error) {
        console.error('解析文档失败:', error);
        res.status(500).json({ error: '解析失败: ' + error.message });
    }
});

// 获取文档列表
app.get('/api/documents', (req, res) => {
    const docs = db.prepare('SELECT id, original_name, upload_date FROM documents ORDER BY upload_date DESC').all();
    res.json({ documents: docs });
});

// ========== 印证案例 API ==========

app.get('/api/evidence', (req, res) => {
    let sql = 'SELECT * FROM evidence ORDER BY date DESC, id DESC';
    const params = [];
    
    if (req.query.tag) {
        sql = 'SELECT * FROM evidence WHERE evidence_type = ? OR evidence_tags LIKE ? ORDER BY date DESC';
        params.push(req.query.tag, `%${req.query.tag}%`);
    }
    
    if (req.query.stock) {
        sql = 'SELECT * FROM evidence WHERE stock_code = ? ORDER BY date DESC';
        params.push(req.query.stock);
    }
    
    const evidence = db.prepare(sql).all(...params);
    res.json({ evidence: evidence.map(e => ({
        ...e,
        evidence_tags: JSON.parse(e.evidence_tags || '[]')
    })) });
});

app.post('/api/evidence', (req, res) => {
    const { date, stock_code, stock_name, evidence_type, evidence_tags, description, ppt_page } = req.body;
    
    const result = db.prepare(`
        INSERT INTO evidence (date, stock_code, stock_name, evidence_type, evidence_tags, description, ppt_page)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        date, stock_code, stock_name, evidence_type,
        JSON.stringify(evidence_tags || []),
        description, ppt_page || null
    );
    
    res.json({ success: true, id: result.lastInsertRowid });
});

// 搜索
app.get('/api/search', (req, res) => {
    const query = req.query.q || '';
    const stock = req.query.stock;
    
    let sql = 'SELECT * FROM evidence WHERE 1=1';
    const params = [];
    
    if (query) {
        sql += ` AND (evidence_type LIKE ? OR evidence_tags LIKE ? OR description LIKE ?)`;
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    
    if (stock) {
        sql += ` AND stock_code = ?`;
        params.push(stock);
    }
    
    sql += ' ORDER BY date DESC';
    
    const results = db.prepare(sql).all(...params);
    res.json({ results: results.map(r => ({
        ...r,
        evidence_tags: JSON.parse(r.evidence_tags || '[]')
    })) });
});

// 获取所有标签
app.get('/api/tags', (req, res) => {
    const types = db.prepare(`
        SELECT evidence_type as name, COUNT(*) as count 
        FROM evidence 
        WHERE evidence_type IS NOT NULL 
        GROUP BY evidence_type
    `).all();
    
    const allTags = new Set();
    const evidence = db.prepare('SELECT evidence_tags FROM evidence').all();
    evidence.forEach(e => {
        try {
            const tags = JSON.parse(e.evidence_tags || '[]');
            tags.forEach(t => allTags.add(t));
        } catch {}
    });
    
    res.json({
        evidence_types: types,
        all_tags: Array.from(allTags)
    });
});

// ========== 学员反馈 API ==========

app.get('/api/feedback', (req, res) => {
    let sql = 'SELECT * FROM feedback ORDER BY date DESC, id DESC';
    const params = [];
    
    if (req.query.method) {
        sql = 'SELECT * FROM feedback WHERE method_tags LIKE ? ORDER BY date DESC';
        params.push(`%${req.query.method}%`);
    }
    
    const feedback = db.prepare(sql).all(...params);
    res.json({ feedback: feedback.map(f => ({
        ...f,
        method_tags: JSON.parse(f.method_tags || '[]')
    })) });
});

app.post('/api/feedback', (req, res) => {
    const { date, student_name, stock_code, profit_amount, method_tags, description } = req.body;
    
    const result = db.prepare(`
        INSERT INTO feedback (date, student_name, stock_code, profit_amount, method_tags, description)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        date, student_name, stock_code, profit_amount,
        JSON.stringify(method_tags || []),
        description
    );
    
    res.json({ success: true, id: result.lastInsertRowid });
});

// ========== 图表数据 API ==========

app.get('/api/nasdaq/data', (req, res) => {
    const data = db.prepare('SELECT * FROM nasdaq_data ORDER BY date').all();
    res.json({ data });
});

app.get('/api/chart/data', (req, res) => {
    const nasdaq = db.prepare('SELECT * FROM nasdaq_data ORDER BY date').all();
    
    const cases = db.prepare(`
        SELECT date, GROUP_CONCAT(stock_code) as stocks, COUNT(*) as count
        FROM cases
        GROUP BY date
    `).all();
    
    const evidence = db.prepare(`
        SELECT date, COUNT(*) as count
        FROM evidence
        GROUP BY date
    `).all();
    
    const feedback = db.prepare(`
        SELECT date, COUNT(*) as count
        FROM feedback
        GROUP BY date
    `).all();
    
    res.json({ nasdaq, cases, evidence, feedback });
});

// 生成演示数据
app.post('/api/demo/generate', (req, res) => {
    // 生成纳指数据
    const insertNasdaq = db.prepare(`
        INSERT OR REPLACE INTO nasdaq_data (date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const today = new Date();
    for (let i = 60; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        const base = 14000 + Math.sin(i / 10) * 1000;
        const random = (Math.random() - 0.5) * 500;
        const close = base + random;
        const open = close + (Math.random() - 0.5) * 100;
        const high = Math.max(open, close) + Math.random() * 50;
        const low = Math.min(open, close) - Math.random() * 50;
        
        insertNasdaq.run(
            date.toISOString().split('T')[0],
            parseFloat(open.toFixed(2)),
            parseFloat(high.toFixed(2)),
            parseFloat(low.toFixed(2)),
            parseFloat(close.toFixed(2)),
            Math.floor(Math.random() * 1000000)
        );
    }
    
    res.json({ success: true, message: '演示数据已生成' });
});

// 页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('  股票教学案例管理系统 - 完整版');
    console.log('='.repeat(50));
    console.log(`  🚀 服务已启动！`);
    console.log(`  📍 访问地址: http://localhost:${PORT}`);
    console.log(`  📁 数据库: data/stock_cases.db`);
    console.log('='.repeat(50));
});
