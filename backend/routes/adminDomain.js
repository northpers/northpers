const express = require('express');
const router = express.Router();
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { adminAuth } = require('./admin');

router.use(adminAuth);

const NGINX_CONFIG_PATH = '/etc/nginx/sites-available/northline';
const NGINX_CONFIG_FALLBACK = '/etc/nginx/sites-available/default';

function runCmd(cmd) {
    try {
        return { success: true, output: execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim() };
    } catch (err) {
        return { success: false, output: err.stdout?.trim() || err.message };
    }
}

function logAdminAction(adminId, adminUsername, action, target, details, ip) {
    db.execute(
        'INSERT INTO admin_action_logs (admin_id, admin_username, action, target, details, ip) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, adminUsername, action, target, details || '', ip || '']
    ).catch(() => {});
}

// =====================
// DOMAIN STATUS
// =====================
router.get('/status', async (req, res) => {
    try {
        let nginxStatus = 'unknown';
        try { nginxStatus = execSync('systemctl is-active nginx 2>/dev/null', { encoding: 'utf8' }).trim(); } catch (e) { nginxStatus = 'inactive'; }

        let nginxVersion = '';
        try { nginxVersion = execSync('nginx -v 2>&1', { encoding: 'utf8' }).trim(); } catch (e) {}

        let tunnelStatus = 'unknown';
        try { tunnelStatus = execSync('systemctl is-active cloudflared 2>/dev/null', { encoding: 'utf8' }).trim(); } catch (e) { tunnelStatus = 'inactive'; }

        let tunnelVersion = '';
        try { tunnelVersion = execSync('cloudflared --version 2>&1', { encoding: 'utf8' }).trim(); } catch (e) {}

        let nginxPid = '';
        try { nginxPid = execSync('cat /run/nginx.pid 2>/dev/null', { encoding: 'utf8' }).trim(); } catch (e) {}

        let nginxWorkers = 0;
        try {
            const psOut = execSync('pgrep -c "nginx: worker" 2>/dev/null || echo 0', { encoding: 'utf8' }).trim();
            nginxWorkers = parseInt(psOut) || 0;
        } catch (e) {}

        let configExists = false;
        try { configExists = fs.existsSync(NGINX_CONFIG_PATH); } catch (e) {}

        let configContent = '';
        try { configContent = fs.readFileSync(configExists ? NGINX_CONFIG_PATH : NGINX_CONFIG_FALLBACK, 'utf8'); } catch (e) {}

        const domains = [];
        const domainRegex = /server_name\s+([^;]+);/g;
        let match;
        while ((match = domainRegex.exec(configContent)) !== null) {
            match[1].split(/\s+/).forEach(d => {
                if (d && d !== '_' && !domains.includes(d)) domains.push(d);
            });
        }

        const portRegex = /listen\s+([^\s;]+)/g;
        const ports = [];
        while ((match = portRegex.exec(configContent)) !== null) {
            const p = match[1].replace(/\[|]/g, '').split(':').pop();
            if (p && !ports.includes(p)) ports.push(p);
        }

        let upstreamServers = [];
        const upstreamRegex = /server\s+([^\s;]+(?:max_fails=\d+\s+fail_timeout=\d+s)?);/g;
        while ((match = upstreamRegex.exec(configContent)) !== null) {
            upstreamServers.push(match[1].trim());
        }

        let sslInfo = null;
        try {
            const certPath = '/etc/nginx/ssl/cert.pem';
            if (fs.existsSync(certPath)) {
                const certOut = execSync(`openssl x509 -in ${certPath} -noout -issuer -dates -subject 2>/dev/null`, { encoding: 'utf8' });
                sslInfo = { managed: true, source: 'Local SSL', info: certOut.trim() };
            } else {
                sslInfo = { managed: true, source: 'Cloudflare (Proxy)', info: 'SSL terminated at Cloudflare edge. Certificate managed by Cloudflare.' };
            }
        } catch (e) {
            sslInfo = { managed: true, source: 'Cloudflare (Proxy)', info: 'SSL terminated at Cloudflare edge.' };
        }

        const pm2Processes = [];
        try {
            const pm2List = JSON.parse(execSync('pm2 jlist 2>/dev/null || echo "[]"', { encoding: 'utf8' }));
            pm2List.forEach(p => {
                pm2Processes.push({
                    name: p.name, pid: p.pid,
                    status: p.pm2_env?.status || 'unknown',
                    uptime: p.pm2_env?.pm_uptime || 0,
                    cpu: p.monit?.cpu || 0,
                    memory: p.monit?.memory || 0,
                    restarts: p.pm2_env?.restart_time || 0,
                    port: p.pm2_env?.args?.[0] || ''
                });
            });
        } catch (e) {}

        let nginxErrorLog = '';
        try {
            const logPath = '/var/log/nginx/northline_error.log';
            if (fs.existsSync(logPath)) {
                const logContent = execSync(`tail -20 ${logPath}`, { encoding: 'utf8' });
                nginxErrorLog = logContent.trim();
            }
        } catch (e) {}

        res.json({
            success: true,
            domain: {
                nginx: {
                    status: nginxStatus,
                    version: nginxVersion,
                    pid: nginxPid,
                    workers: nginxWorkers,
                    configExists
                },
                tunnel: {
                    status: tunnelStatus,
                    version: tunnelVersion
                },
                domains,
                ports,
                upstreamServers,
                ssl: sslInfo,
                pm2: pm2Processes,
                nginxErrorLog
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// NGINX CONFIG
// =====================
router.get('/nginx-config', async (req, res) => {
    try {
        const configPath = fs.existsSync(NGINX_CONFIG_PATH) ? NGINX_CONFIG_PATH : NGINX_CONFIG_FALLBACK;
        const content = fs.readFileSync(configPath, 'utf8');
        res.json({ success: true, config: content, path: configPath });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// NGINX CONTROL
// =====================
router.post('/nginx/test', async (req, res) => {
    try {
        const result = runCmd('nginx -t 2>&1');
        logAdminAction(req.user.id, req.user.username, 'nginx_test', 'nginx', result.output, req.ip);
        res.json({ success: result.success, message: result.output });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/nginx/restart', async (req, res) => {
    try {
        const testResult = runCmd('nginx -t 2>&1');
        if (!testResult.success) {
            return res.status(400).json({ success: false, message: 'Config test failed: ' + testResult.output });
        }
        const result = runCmd('systemctl restart nginx 2>&1');
        logAdminAction(req.user.id, req.user.username, 'nginx_restart', 'nginx', result.output, req.ip);
        res.json({ success: result.success, message: result.success ? 'Nginx restarted successfully' : result.output });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/nginx/stop', async (req, res) => {
    try {
        const result = runCmd('systemctl stop nginx 2>&1');
        logAdminAction(req.user.id, req.user.username, 'nginx_stop', 'nginx', result.output, req.ip);
        res.json({ success: result.success, message: result.success ? 'Nginx stopped' : result.output });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/nginx/start', async (req, res) => {
    try {
        const result = runCmd('systemctl start nginx 2>&1');
        logAdminAction(req.user.id, req.user.username, 'nginx_start', 'nginx', result.output, req.ip);
        res.json({ success: result.success, message: result.success ? 'Nginx started' : result.output });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/nginx/reload', async (req, res) => {
    try {
        const testResult = runCmd('nginx -t 2>&1');
        if (!testResult.success) {
            return res.status(400).json({ success: false, message: 'Config test failed: ' + testResult.output });
        }
        const result = runCmd('systemctl reload nginx 2>&1');
        logAdminAction(req.user.id, req.user.username, 'nginx_reload', 'nginx', result.output, req.ip);
        res.json({ success: result.success, message: result.success ? 'Nginx reloaded successfully' : result.output });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// PM2 CONTROL
// =====================
router.post('/pm2/restart', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Process name required' });
        const result = runCmd(`pm2 restart ${name} 2>&1`);
        logAdminAction(req.user.id, req.user.username, 'pm2_restart', name, '', req.ip);
        res.json({ success: result.success, message: result.success ? `${name} restarted` : result.output });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/pm2/stop', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Process name required' });
        const result = runCmd(`pm2 stop ${name} 2>&1`);
        logAdminAction(req.user.id, req.user.username, 'pm2_stop', name, '', req.ip);
        res.json({ success: result.success, message: result.success ? `${name} stopped` : result.output });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/pm2/restart-all', async (req, res) => {
    try {
        const result = runCmd('pm2 restart all 2>&1');
        logAdminAction(req.user.id, req.user.username, 'pm2_restart_all', 'all', '', req.ip);
        res.json({ success: result.success, message: result.success ? 'All PM2 processes restarted' : result.output });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// NGINX ACCESS LOG (tail)
// =====================
router.get('/nginx/access-log', async (req, res) => {
    try {
        const lines = Math.min(200, parseInt(req.query.lines) || 100);
        const result = runCmd(`tail -${lines} /var/log/nginx/northline_access.log 2>/dev/null`);
        res.json({ success: true, log: result.output || 'No access log found' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/nginx/error-log', async (req, res) => {
    try {
        const lines = Math.min(200, parseInt(req.query.lines) || 100);
        const result = runCmd(`tail -${lines} /var/log/nginx/northline_error.log 2>/dev/null`);
        res.json({ success: true, log: result.output || 'No error log found' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// ADMIN ACTION LOGS
// =====================
router.get('/action-logs', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const [[{ total }]] = await db.execute('SELECT COUNT(*) as total FROM admin_action_logs');
        const [rows] = await db.execute(
            `SELECT * FROM admin_action_logs ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`
        );
        res.json({ success: true, logs: rows, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
