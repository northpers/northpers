const crypto = require('crypto');
const db = require('../config/db');

const BOT_PATTERNS = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|headlesschrome|phantomjs|wget|curl|python|httpx|scrapy|gptbot|claude|perplexity|ccbot|bytespider|applebot-extended|meta-externalagent|cohere-ai|semrushbot|ahrefsbot|mj12bot|dotbot/i;

function parseUserAgent(ua) {
    if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
    let browser = 'Other', os = 'Other', device = 'Desktop';

    if (/chrome|chromium|crios/i.test(ua) && !/edg|opr|edge/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome|chromium|crios/i.test(ua)) browser = 'Safari';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/edg|edge/i.test(ua)) browser = 'Edge';
    else if (/opr|opera/i.test(ua)) browser = 'Opera';
    else if (/msie|trident/i.test(ua)) browser = 'IE';

    if (/iphone/i.test(ua)) { os = 'iOS'; device = 'Mobile'; }
    else if (/ipad/i.test(ua)) { os = 'iOS'; device = 'Tablet'; }
    else if (/android/i.test(ua)) { os = 'Android'; device = /mobile/i.test(ua) ? 'Mobile' : 'Tablet'; }
    else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/linux/i.test(ua)) os = 'Linux';

    return { browser, os, device };
}

function generateFingerprint(ip, ua) {
    return crypto.createHash('sha256').update((ip || '') + '||' + (ua || '')).digest('hex').substring(0, 32);
}

async function upsertVisitor(ip, ua, url) {
    try {
        const isBot = BOT_PATTERNS.test(ua) ? 1 : 0;
        const fp = generateFingerprint(ip, ua);
        const { browser, os, device } = parseUserAgent(ua);

        const [existing] = await db.execute(
            'SELECT id FROM visitor_sessions WHERE fingerprint = ?',
            [fp]
        );

        if (existing.length > 0) {
            await db.execute(
                'UPDATE visitor_sessions SET last_visit = NOW(), total_pageviews = total_pageviews + 1 WHERE id = ?',
                [existing[0].id]
            );
        } else {
            await db.execute(
                `INSERT INTO visitor_sessions (fingerprint, ip, user_agent, browser, os, device_type, is_bot, first_visit, last_visit)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [fp, ip, ua, browser, os, device, isBot]
            );
        }
    } catch (err) {
        // silent fail - logging should not break the request
    }
}

function requestLogger(req, res, next) {
    const startTime = Date.now();
    const originalEnd = res.end;

    res.end = function (...args) {
        const responseTime = Date.now() - startTime;
        const url = req.originalUrl || req.url;
        const method = req.method;
        const statusCode = res.statusCode;
        const contentLength = res.getHeader('content-length') || 0;
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || '';
        const ua = req.headers['user-agent'] || '';
        const referrer = req.headers['referer'] || req.headers['referrer'] || '';

        if (url.startsWith('/api/admin') || url.startsWith('/css/') || url.startsWith('/java/') || url.startsWith('/public/') || url.startsWith('/src/') || url.includes('.css') || url.includes('.js') || url.includes('.png') || url.includes('.jpg') || url.includes('.ico') || url.includes('.webp') || url.includes('.svg') || url.includes('.woff')) {
            originalEnd.apply(res, args);
            return;
        }

        const isBot = BOT_PATTERNS.test(ua) ? 1 : 0;

        db.execute(
            `INSERT INTO server_logs (ip, method, url, status_code, response_time_ms, content_length, user_agent, referrer, is_bot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ip, method, url, statusCode, responseTime, parseInt(contentLength) || 0, ua, referrer, isBot]
        ).catch(() => {});

        upsertVisitor(ip, ua, url);

        originalEnd.apply(res, args);
    };

    next();
}

module.exports = requestLogger;
