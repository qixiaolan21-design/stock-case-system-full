/**
 * 文档解析器 - 从Word/PDF中提取股票信息
 */

const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const fs = require('fs');

class DocumentParser {
    /**
     * 解析文档并提取股票信息
     */
    async parseDocument(filePath, fileType) {
        let text = '';
        
        if (fileType === 'docx' || fileType === 'doc') {
            const result = await mammoth.extractRawText({ path: filePath });
            text = result.value;
        } else if (fileType === 'pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const result = await pdf(dataBuffer);
            text = result.text;
        } else if (fileType === 'txt') {
            text = fs.readFileSync(filePath, 'utf-8');
        }
        
        return this.extractStockInfo(text);
    }
    
    /**
     * 从文本中提取股票信息
     */
    extractStockInfo(text) {
        const stocks = [];
        
        // 股票代码模式（6位数字）
        const stockPattern = /(\d{6})/g;
        const stockMatches = [...text.matchAll(stockPattern)];
        
        // 为每个股票代码提取上下文
        const lines = text.split('\n');
        
        for (const match of stockMatches) {
            const code = match[1];
            const stockInfo = {
                stock_code: code,
                stock_name: this.extractStockName(text, code),
                pressure_points: this.extractPressurePoints(text, code),
                support_points: this.extractSupportPoints(text, code),
                risk_points: this.extractRiskPoints(text, code),
                opportunity_points: this.extractOpportunityPoints(text, code),
                evidence_type: this.detectEvidenceType(text, code),
                tags: this.extractTags(text, code)
            };
            
            // 去重
            if (!stocks.find(s => s.stock_code === code)) {
                stocks.push(stockInfo);
            }
        }
        
        return {
            stocks,
            full_text: text,
            summary: this.generateSummary(stocks)
        };
    }
    
    /**
     * 提取股票名称
     */
    extractStockName(text, code) {
        // 查找代码附近的名称
        const patterns = [
            new RegExp(`(${code}\\s*[,，]\\s*([^\\s,，]+))`),
            new RegExp(`([^\\s,，]+\\s*[,，]\\s*${code})`),
            new RegExp(`${code}\\s*([^(\\s]{2,8})`),
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const name = match[2] || match[1];
                if (name && name !== code && !name.match(/^\d+$/)) {
                    return name.replace(/[,，\s]/g, '');
                }
            }
        }
        
        return '';
    }
    
    /**
     * 提取压力位
     */
    extractPressurePoints(text, code) {
        const pressures = [];
        const patterns = [
            /压力[位点][:：]\s*(\d+(?:\.\d+)?)/g,
            /压力[:：]\s*(\d+(?:\.\d+)?)/g,
            /上方压力[:：]\s*(\d+(?:\.\d+)?)/g,
            /阻力位[:：]\s*(\d+(?:\.\d+)?)/g,
            /(\d+(?:\.\d+)?)\s*附近.*压力/g,
        ];
        
        // 在代码附近查找
        const context = this.getContextAroundCode(text, code, 500);
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const price = parseFloat(match[1]);
                if (price > 0 && !pressures.includes(price)) {
                    pressures.push(price);
                }
            }
        }
        
        return pressures.slice(0, 5); // 最多5个
    }
    
    /**
     * 提取支撑位
     */
    extractSupportPoints(text, code) {
        const supports = [];
        const patterns = [
            /支撑[位点][:：]\s*(\d+(?:\.\d+)?)/g,
            /支撑[:：]\s*(\d+(?:\.\d+)?)/g,
            /下方支撑[:：]\s*(\d+(?:\.\d+)?)/g,
            /支撑位[:：]\s*(\d+(?:\.\d+)?)/g,
            /(\d+(?:\.\d+)?)\s*附近.*支撑/g,
        ];
        
        const context = this.getContextAroundCode(text, code, 500);
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const price = parseFloat(match[1]);
                if (price > 0 && !supports.includes(price)) {
                    supports.push(price);
                }
            }
        }
        
        return supports.slice(0, 5);
    }
    
    /**
     * 提取风险点
     */
    extractRiskPoints(text, code) {
        const risks = [];
        const patterns = [
            /风险[:：]([^。\n]+)/g,
            /注意[:：]([^。\n]+风险[^。\n]*)/g,
            /风险点[:：]([^。\n]+)/g,
            /警惕[:：]([^。\n]+)/g,
        ];
        
        const context = this.getContextAroundCode(text, code, 800);
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const risk = match[1].trim();
                if (risk && risk.length > 3 && !risks.includes(risk)) {
                    risks.push(risk);
                }
            }
        }
        
        return risks.slice(0, 3);
    }
    
    /**
     * 提取机会点
     */
    extractOpportunityPoints(text, code) {
        const opportunities = [];
        const patterns = [
            /机会[:：]([^。\n]+)/g,
            /买点[:：]([^。\n]+)/g,
            /关注[:：]([^。\n]+机会[^。\n]*)/g,
            /机会点[:：]([^。\n]+)/g,
            /可以介入[:：]([^。\n]+)/g,
        ];
        
        const context = this.getContextAroundCode(text, code, 800);
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const opp = match[1].trim();
                if (opp && opp.length > 3 && !opportunities.includes(opp)) {
                    opportunities.push(opp);
                }
            }
        }
        
        return opportunities.slice(0, 3);
    }
    
    /**
     * 检测印证类型
     */
    detectEvidenceType(text, code) {
        const context = this.getContextAroundCode(text, code, 300);
        
        const typePatterns = {
            '筹码': /筹码|集中度|分布/,
            '机构DC': /机构|DC|主力|资金/,
            '密码': /密码|涨停|量学/,
            '趋势': /趋势|通道|上升|下降/,
            '量能': /量能|成交量|放量|缩量/,
            'K线': /K线|形态|阳线|阴线/,
            '支撑压力': /支撑|压力|阻力/,
            '均线': /均线|MA|5日线|10日线/
        };
        
        for (const [type, pattern] of Object.entries(typePatterns)) {
            if (pattern.test(context)) {
                return type;
            }
        }
        
        return '';
    }
    
    /**
     * 提取标签
     */
    extractTags(text, code) {
        const tags = [];
        const context = this.getContextAroundCode(text, code, 500);
        
        const tagPatterns = [
            /#([^\s#]+)/g,
            /【([^】]+)】/g,
            /标签[:：]([^\n]+)/g,
        ];
        
        for (const pattern of tagPatterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const tag = match[1].trim();
                if (tag && !tags.includes(tag)) {
                    tags.push(tag);
                }
            }
        }
        
        return tags;
    }
    
    /**
     * 获取代码周围的上下文
     */
    getContextAroundCode(text, code, range) {
        const index = text.indexOf(code);
        if (index === -1) return text;
        
        const start = Math.max(0, index - range);
        const end = Math.min(text.length, index + range);
        
        return text.substring(start, end);
    }
    
    /**
     * 生成摘要
     */
    generateSummary(stocks) {
        if (stocks.length === 0) {
            return '未检测到股票信息';
        }
        
        return `检测到 ${stocks.length} 只股票：${stocks.map(s => s.stock_code).join(', ')}`;
    }
}

module.exports = DocumentParser;
