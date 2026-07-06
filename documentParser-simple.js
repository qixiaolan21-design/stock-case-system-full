/**
 * 文档解析器 - 简化版（Vercel 适配）
 * 只处理文本，不依赖文件系统
 */

class DocumentParser {
    /**
     * 从文本中提取股票信息
     */
    extractStockInfo(text) {
        const stocks = [];
        
        // 股票代码模式（6位数字）
        const stockPattern = /(\d{6})/g;
        const stockMatches = [...text.matchAll(stockPattern)];
        
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
            
            if (!stocks.find(s => s.stock_code === code)) {
                stocks.push(stockInfo);
            }
        }
        
        return {
            stocks,
            full_text: text,
            summary: stocks.length > 0 
                ? `检测到 ${stocks.length} 只股票：${stocks.map(s => s.stock_code).join(', ')}`
                : '未检测到股票信息'
        };
    }
    
    extractStockName(text, code) {
        const patterns = [
            new RegExp(`(${code}\\s*[,，]\\s*([^\\s,，]{2,8}))`),
            new RegExp(`([^\\s,，]{2,8}\\s*[,，]\\s*${code})`),
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
    
    extractPressurePoints(text, code) {
        const pressures = [];
        const context = this.getContextAroundCode(text, code, 500);
        const patterns = [
            /压力[位点][:：]\s*(\d+(?:\.\d+)?)/g,
            /压力[:：]\s*(\d+(?:\.\d+)?)/g,
            /上方压力[:：]\s*(\d+(?:\.\d+)?)/g,
            /阻力位[:：]\s*(\d+(?:\.\d+)?)/g,
        ];
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const price = parseFloat(match[1]);
                if (price > 0 && !pressures.includes(price)) pressures.push(price);
            }
        }
        return pressures.slice(0, 5);
    }
    
    extractSupportPoints(text, code) {
        const supports = [];
        const context = this.getContextAroundCode(text, code, 500);
        const patterns = [
            /支撑[位点][:：]\s*(\d+(?:\.\d+)?)/g,
            /支撑[:：]\s*(\d+(?:\.\d+)?)/g,
            /下方支撑[:：]\s*(\d+(?:\.\d+)?)/g,
        ];
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const price = parseFloat(match[1]);
                if (price > 0 && !supports.includes(price)) supports.push(price);
            }
        }
        return supports.slice(0, 5);
    }
    
    extractRiskPoints(text, code) {
        const risks = [];
        const context = this.getContextAroundCode(text, code, 800);
        const patterns = [
            /风险[:：]([^。\n]+)/g,
            /注意[:：]([^。\n]*风险[^。\n]*)/g,
            /警惕[:：]([^。\n]+)/g,
        ];
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const risk = match[1].trim();
                if (risk && risk.length > 3 && !risks.includes(risk)) risks.push(risk);
            }
        }
        return risks.slice(0, 3);
    }
    
    extractOpportunityPoints(text, code) {
        const opportunities = [];
        const context = this.getContextAroundCode(text, code, 800);
        const patterns = [
            /机会[:：]([^。\n]+)/g,
            /买点[:：]([^。\n]+)/g,
            /可以介入[:：]([^。\n]+)/g,
        ];
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const opp = match[1].trim();
                if (opp && opp.length > 3 && !opportunities.includes(opp)) opportunities.push(opp);
            }
        }
        return opportunities.slice(0, 3);
    }
    
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
            if (pattern.test(context)) return type;
        }
        return '';
    }
    
    extractTags(text, code) {
        const tags = [];
        const context = this.getContextAroundCode(text, code, 500);
        const tagPatterns = [
            /#([^\s#]+)/g,
            /【([^】]+)】/g,
        ];
        
        for (const pattern of tagPatterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const tag = match[1].trim();
                if (tag && !tags.includes(tag)) tags.push(tag);
            }
        }
        return tags;
    }
    
    getContextAroundCode(text, code, range) {
        const index = text.indexOf(code);
        if (index === -1) return text;
        const start = Math.max(0, index - range);
        const end = Math.min(text.length, index + range);
        return text.substring(start, end);
    }
}

module.exports = DocumentParser;
