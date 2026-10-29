const express = require('express');
const router = express.Router();
const db = require('../config/db');
const os = require('os');
const { execSync } = require('child_process');
const { adminAuth } = require('./admin');

router.use(adminAuth);

// =====================
// ACCESS LOGS
// =====================
router.get('/logs', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;
        const { method, status, search, from, to, is_bot } = req.query;

        let where = '1=1';
        const params = [];

        if (method) { where += ' AND method = ?'; params.push(method); }
        if (status) { where += ' AND status_code = ?'; params.push(parseInt(status)); }
        if (is_bot !== undefined && is_bot !== '') { where += ' AND is_bot = ?'; params.push(parseInt(is_bot)); }
        if (search) { where += ' AND (ip LIKE ? OR url LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        if (from) { where += ' AND created_at >= ?'; params.push(from); }
        if (to) { where += ' AND created_at <= ?'; params.push(to + ' 23:59:59'); }

        const [[{ total }]] = await db.execute(`SELECT COUNT(*) as total FROM server_logs WHERE ${where}`, params);
        const [rows] = await db.execute(
            `SELECT id, ip, method, url, status_code, response_time_ms, content_length, user_agent, referrer, is_bot, created_at
             FROM server_logs WHERE ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        res.json({ success: true, logs: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('Logs error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/logs/export', async (req, res) => {
    try {
        const { from, to, method, status } = req.query;
        let where = '1=1';
        const params = [];
        if (method) { where += ' AND method = ?'; params.push(method); }
        if (status) { where += ' AND status_code = ?'; params.push(parseInt(status)); }
        if (from) { where += ' AND created_at >= ?'; params.push(from); }
        if (to) { where += ' AND created_at <= ?'; params.push(to + ' 23:59:59'); }

        const [rows] = await db.execute(
            `SELECT ip, method, url, status_code, response_time_ms, content_length, user_agent, referrer, created_at
             FROM server_logs WHERE ${where} ORDER BY id DESC LIMIT 10000`,
            params
        );

        let csv = 'IP,Method,URL,Status,Response Time (ms),Content Length,User Agent,Referrer,Created At\n';
        rows.forEach(r => {
            csv += `"${r.ip}","${r.method}","${r.url}",${r.status_code},${r.response_time_ms},${r.content_length},"${(r.user_agent||'').replace(/"/g,'""')}","${(r.referrer||'').replace(/"/g,'""')}","${r.created_at}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=server-logs-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// TRAFFIC ANALYTICS
// =====================
router.get('/traffic/realtime', async (req, res) => {
    try {
        const [[result]] = await db.execute(`
            SELECT 
                COUNT(*) as total_requests,
                COUNT(DISTINCT ip) as unique_ips,
                ROUND(AVG(response_time_ms)) as avg_response_time
            FROM server_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) AND is_bot = 0
        `);

        const [hourly] = await db.execute(`
            SELECT 
                DATE_FORMAT(created_at, '%H:00') as hour_label,
                COUNT(*) as requests,
                COUNT(DISTINCT ip) as unique_visitors
            FROM server_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND is_bot = 0
            GROUP BY hour_label
            ORDER BY hour_label
        `);

        const [statusBreakdown] = await db.execute(`
            SELECT 
                CASE 
                    WHEN status_code BETWEEN 200 AND 299 THEN '2xx'
                    WHEN status_code BETWEEN 300 AND 399 THEN '3xx'
                    WHEN status_code BETWEEN 400 AND 499 THEN '4xx'
                    ELSE '5xx'
                END as status_group,
                COUNT(*) as count
            FROM server_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) AND is_bot = 0
            GROUP BY status_group
        `);

        res.json({ success: true, realtime: result, hourly, statusBreakdown });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/traffic/summary', async (req, res) => {
    try {
        const [[today]] = await db.execute(`
            SELECT COUNT(DISTINCT ip) as visitors, COUNT(*) as requests, ROUND(AVG(response_time_ms)) as avg_rt
            FROM server_logs WHERE DATE(created_at) = CURDATE() AND is_bot = 0
        `);
        const [[yesterday]] = await db.execute(`
            SELECT COUNT(DISTINCT ip) as visitors, COUNT(*) as requests, ROUND(AVG(response_time_ms)) as avg_rt
            FROM server_logs WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND is_bot = 0
        `);
        const [[week]] = await db.execute(`
            SELECT COUNT(DISTINCT ip) as visitors, COUNT(*) as requests, ROUND(AVG(response_time_ms)) as avg_rt
            FROM server_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND is_bot = 0
        `);
        const [[month]] = await db.execute(`
            SELECT COUNT(DISTINCT ip) as visitors, COUNT(*) as requests, ROUND(AVG(response_time_ms)) as avg_rt
            FROM server_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND is_bot = 0
        `);

        const [[errors]] = await db.execute(`
            SELECT COUNT(*) as count FROM server_logs 
            WHERE DATE(created_at) = CURDATE() AND status_code >= 400 AND is_bot = 0
        `);

        res.json({ success: true, today, yesterday, week, month, errorsToday: errors.count });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/traffic/chart', async (req, res) => {
    try {
        const range = req.query.range || '7d';
        let interval, groupBy;
        switch (range) {
            case '24h': interval = '24 HOUR'; groupBy = "DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00')"; break;
            case '7d': interval = '7 DAY'; groupBy = 'DATE(created_at)'; break;
            case '30d': interval = '30 DAY'; groupBy = 'DATE(created_at)'; break;
            default: interval = '7 DAY'; groupBy = 'DATE(created_at)';
        }

        const [rows] = await db.execute(`
            SELECT ${groupBy} as label,
                COUNT(DISTINCT ip) as unique_visitors,
                COUNT(*) as total_requests,
                ROUND(AVG(response_time_ms)) as avg_response_time
            FROM server_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${interval}) AND is_bot = 0
            GROUP BY label
            ORDER BY label
        `);

        res.json({ success: true, chart: rows, range });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/traffic/pages', async (req, res) => {
    try {
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        const [rows] = await db.execute(`
            SELECT url, COUNT(*) as views, COUNT(DISTINCT ip) as unique_visitors, ROUND(AVG(response_time_ms)) as avg_rt
            FROM server_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND is_bot = 0
              AND url NOT LIKE '%.css%' AND url NOT LIKE '%.js%' AND url NOT LIKE '%.png%'
              AND url NOT LIKE '%.jpg%' AND url NOT LIKE '%.ico%' AND url NOT LIKE '%.webp%'
              AND url NOT LIKE '%.svg%' AND url NOT LIKE '%.woff%'
            GROUP BY url ORDER BY views DESC LIMIT ${limit}
        `);
        res.json({ success: true, pages: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/traffic/referrers', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT referrer, COUNT(*) as visits
            FROM server_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND referrer != '' AND referrer IS NOT NULL AND is_bot = 0
            GROUP BY referrer ORDER BY visits DESC LIMIT 10
        `);
        res.json({ success: true, referrers: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/traffic/browsers', async (req, res) => {
    try {
        const [browsers] = await db.execute(`
            SELECT browser, COUNT(*) as count FROM visitor_sessions
            WHERE last_visit >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND is_bot = 0
            GROUP BY browser ORDER BY count DESC LIMIT 10
        `);
        const [osList] = await db.execute(`
            SELECT os, COUNT(*) as count FROM visitor_sessions
            WHERE last_visit >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND is_bot = 0
            GROUP BY os ORDER BY count DESC LIMIT 10
        `);
        const [devices] = await db.execute(`
            SELECT device_type, COUNT(*) as count FROM visitor_sessions
            WHERE last_visit >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND is_bot = 0
            GROUP BY device_type ORDER BY count DESC
        `);
        res.json({ success: true, browsers, os: osList, devices });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// VISITORS
// =====================
router.get('/visitors', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;
        const { from, to, search } = req.query;

        let where = 'is_bot = 0';
        const params = [];
        if (from) { where += ' AND last_visit >= ?'; params.push(from); }
        if (to) { where += ' AND last_visit <= ?'; params.push(to + ' 23:59:59'); }
        if (search) { where += ' AND (ip LIKE ? OR fingerprint LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

        const [[{ total }]] = await db.execute(`SELECT COUNT(*) as total FROM visitor_sessions WHERE ${where}`, params);
        const [rows] = await db.execute(
            `SELECT id, fingerprint, ip, browser, os, device_type, first_visit, last_visit, total_pageviews
             FROM visitor_sessions WHERE ${where} ORDER BY last_visit DESC LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        res.json({ success: true, visitors: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/visitors/:fingerprint', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const [[visitor]] = await db.execute('SELECT * FROM visitor_sessions WHERE fingerprint = ?', [fingerprint]);
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });

        const [pages] = await db.execute(`
            SELECT url, response_time_ms, created_at FROM server_logs
            WHERE ip = ? AND is_bot = 0
            ORDER BY created_at DESC LIMIT 50
        `, [visitor.ip]);

        res.json({ success: true, visitor, pages });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// SERVER STATUS
// =====================
router.get('/server/status', async (req, res) => {
    try {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const uptime = os.uptime();

        let cpuUsage = 0;
        try {
            const loadAvg = os.loadavg();
            cpuUsage = Math.min(100, Math.round((loadAvg[0] / cpus.length) * 100));
        } catch (e) {}

        let diskInfo = { total: 0, used: 0, percent: 0 };
        try {
            const df = execSync('df -B1 / | tail -1', { encoding: 'utf8' }).trim();
            const parts = df.split(/\s+/);
            diskInfo.total = parseInt(parts[1]) || 0;
            diskInfo.used = parseInt(parts[2]) || 0;
            diskInfo.percent = diskInfo.total > 0 ? Math.round((diskInfo.used / diskInfo.total) * 100) : 0;
        } catch (e) {}

        let pm2Processes = [];
        try {
            const pm2List = execSync('pm2 jlist 2>/dev/null || echo "[]"', { encoding: 'utf8' });
            pm2Processes = JSON.parse(pm2List).map(p => ({
                name: p.name,
                pid: p.pid,
                status: p.pm2_env?.status || 'unknown',
                uptime: p.pm2_env?.pm_uptime || 0,
                cpu: p.monit?.cpu || 0,
                memory: p.monit?.memory || 0,
                restarts: p.pm2_env?.restart_time || 0
            }));
        } catch (e) {}

        let nginxStatus = 'unknown';
        try {
            const nginxCheck = execSync('systemctl is-active nginx 2>/dev/null', { encoding: 'utf8' }).trim();
            nginxStatus = nginxCheck;
        } catch (e) {
            nginxStatus = 'inactive';
        }

        const [[{ activeConnections }]] = await db.execute(`
            SELECT COUNT(DISTINCT ip) as activeConnections FROM server_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND is_bot = 0
        `);

        const [[{ reqPerSec }]] = await db.execute(`
            SELECT ROUND(COUNT(*) / 300, 1) as reqPerSec FROM server_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND is_bot = 0
        `);

        res.json({
            success: true,
            server: {
                cpu: { cores: cpus.length, usage: cpuUsage, model: cpus[0]?.model || 'Unknown' },
                memory: { total: totalMem, free: freeMem, used: totalMem - freeMem, percent: Math.round(((totalMem - freeMem) / totalMem) * 100) },
                disk: diskInfo,
                uptime,
                nginxStatus,
                activeConnections: activeConnections || 0,
                reqPerSec: reqPerSec || 0,
                pm2: pm2Processes
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// LOGS CLEANUP
// =====================
router.delete('/logs/cleanup', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const [[{ before }]] = await db.execute('SELECT COUNT(*) as before FROM server_logs');
        await db.execute(`DELETE FROM server_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
        await db.execute(`DELETE FROM visitor_sessions WHERE last_visit < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
        const [[{ after }]] = await db.execute('SELECT COUNT(*) as after FROM server_logs');
        res.json({ success: true, deleted: before - after, message: `Cleaned up logs older than ${days} days` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
