const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const fs = require('fs');
const db = require('../config/db');
const { adminAuth } = require('./admin');

router.use(adminAuth);

function safe(cmd) {
    try { return execSync(cmd + ' 2>/dev/null', { encoding: 'utf8', timeout: 10000 }).trim(); } catch (e) { return ''; }
}

function logSecurity(adminUser, action, details, ip) {
    db.execute(
        'INSERT INTO admin_action_logs (admin_id, admin_username, action, target, details, ip) VALUES (0, ?, ?, ?, ?, ?)',
        [adminUser || 'system', action, 'security', details || '', ip || '']
    ).catch(() => {});
}

// =====================
// SECURITY OVERVIEW
// =====================
router.get('/overview', async (req, res) => {
    try {
        // API Abuse Detection - requests per IP in last hour
        const [topIPs] = await db.execute(`
            SELECT ip, COUNT(*) as requests, 
                   SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
                   SUM(CASE WHEN status_code = 401 OR status_code = 403 THEN 1 ELSE 0 END) as auth_fails,
                   MIN(created_at) as first_seen, MAX(created_at) as last_seen
            FROM server_logs 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
            GROUP BY ip 
            ORDER BY requests DESC 
            LIMIT 20
        `);

        // Requests per minute trend (last 30 min)
        const [rpmTrend] = await db.execute(`
            SELECT DATE_FORMAT(created_at, '%H:%i') as minute, COUNT(*) as requests,
                   SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
            FROM server_logs 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
            GROUP BY minute 
            ORDER BY minute ASC
        `);

        // Error rate by endpoint (last hour)
        const [errorEndpoints] = await db.execute(`
            SELECT url, method, status_code, COUNT(*) as hits
            FROM server_logs 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) AND status_code >= 400
            GROUP BY url, method, status_code
            ORDER BY hits DESC
            LIMIT 15
        `);

        // Failed auth attempts (401/403)
        const [authFails] = await db.execute(`
            SELECT ip, url, COUNT(*) as attempts, user_agent
            FROM server_logs 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) AND (status_code = 401 OR status_code = 403)
            GROUP BY ip, url
            ORDER BY attempts DESC
            LIMIT 20
        `);

        // Bot traffic detection
        const [botTraffic] = await db.execute(`
            SELECT ip, user_agent, COUNT(*) as hits
            FROM server_logs 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) AND is_bot = 1
            GROUP BY ip, user_agent
            ORDER BY hits DESC
            LIMIT 10
        `);

        // Total stats last hour
        const [stats] = await db.execute(`
            SELECT COUNT(*) as total_requests,
                   COUNT(DISTINCT ip) as unique_ips,
                   SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_errors,
                   SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END) as rate_limited,
                   AVG(response_time_ms) as avg_response_time
            FROM server_logs 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
        `);

        // Today stats
        const [todayStats] = await db.execute(`
            SELECT COUNT(*) as total_requests,
                   COUNT(DISTINCT ip) as unique_ips,
                   SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
            FROM server_logs 
            WHERE created_at > DATE_FORMAT(NOW(), '%Y-%m-%d')
        `);

        // Detect potential attacks (high request count from single IP)
        const attackThreshold = 100;
        const attacks = topIPs.filter(ip => ip.requests > attackThreshold);

        res.json({
            success: true,
            security: {
                summary: {
                    totalRequests: stats[0]?.total_requests || 0,
                    uniqueIPs: stats[0]?.unique_ips || 0,
                    serverErrors: stats[0]?.server_errors || 0,
                    rateLimited: stats[0]?.rate_limited || 0,
                    avgResponseTime: Math.round(stats[0]?.avg_response_time || 0),
                    todayRequests: todayStats[0]?.total_requests || 0,
                    todayUniqueIPs: todayStats[0]?.unique_ips || 0,
                    todayErrors: todayStats[0]?.errors || 0,
                    activeThreats: attacks.length
                },
                topIPs: topIPs,
                rpmTrend: rpmTrend,
                errorEndpoints: errorEndpoints,
                authFails: authFails,
                botTraffic: botTraffic,
                attacks: attacks
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// FIREWALL STATUS
// =====================
router.get('/firewall', async (req, res) => {
    try {
        // Detect available firewalls
        const hasUfw = fs.existsSync('/usr/sbin/ufw');
        const hasIptables = fs.existsSync('/usr/sbin/iptables');
        const hasFail2ban = fs.existsSync('/usr/bin/fail2ban-client');

        let firewallStatus = 'none';
        let ufwStatus = null;
        let iptablesRules = [];
        let fail2banStatus = null;
        let fail2banJails = [];

        // UFW
        if (hasUfw) {
            const ufwRaw = safe('ufw status verbose 2>/dev/null');
            const ufwActive = ufwRaw.includes('Status: active');
            firewallStatus = ufwActive ? 'ufw' : firewallStatus;
            const ufwRules = ufwRaw.split('\n').filter(l => l.match(/^\s*\d+/) || l.match(/ALLOW|DENY|REJECT|LOG/));
            ufwStatus = {
                installed: true,
                active: ufwActive,
                defaultIncoming: (ufwRaw.match(/Default: incoming (\w+)/) || [])[1] || 'unknown',
                defaultOutgoing: (ufwRaw.match(/Default: outgoing (\w+)/) || [])[1] || 'unknown',
                logging: (ufwRaw.match(/Logging: (\w+)/) || [])[1] || 'unknown',
                rules: ufwRules.map(r => r.trim())
            };
        }

        // iptables
        if (hasIptables) {
            const iptRaw = safe('iptables -L -n --line-numbers 2>/dev/null');
            const iptNat = safe('iptables -t nat -L -n 2>/dev/null');
            const ruleLines = iptRaw.split('\n').filter(l => l.match(/^\d+/));
            iptablesRules = ruleLines.map(r => r.trim());
            if (firewallStatus === 'none' && ruleLines.length > 3) firewallStatus = 'iptables';
        }

        // fail2ban
        if (hasFail2ban) {
            let f2bRunning = false;
            try {
                const f2bStatus = safe('fail2ban-client status 2>/dev/null');
                f2bRunning = f2bStatus.includes('Number of jail');
                if (f2bRunning) {
                    const jailMatch = f2bStatus.match(/Number of jail:\s*(\d+)/);
                    const jailList = safe('fail2ban-client status 2>/dev/null') || '';
                    const jails = [];
                    const jailNames = jailList.match(/Jail list:\s*(.+)/);
                    if (jailNames) {
                        jailNames[1].split(',').forEach(j => {
                            const jName = j.trim();
                            if (jName) {
                                const jInfo = safe('fail2ban-client status ' + jName + ' 2>/dev/null');
                                const banned = jInfo.match(/Currently banned:\s*(\d+)/);
                                const total = jInfo.match(/Total banned:\s*(\d+)/);
                                const failed = jInfo.match(/Currently failed:\s*(\d+)/);
                                jails.push({
                                    name: jName,
                                    currentlyBanned: parseInt(banned?.[1] || '0'),
                                    totalBanned: parseInt(total?.[1] || '0'),
                                    currentlyFailed: parseInt(failed?.[1] || '0')
                                });
                            }
                        });
                    }
                    fail2banJails = jails;
                }
            } catch (e) {}
            fail2banStatus = {
                installed: true,
                running: f2bRunning,
                jails: fail2banJails
            };
            if (f2bRunning && firewallStatus === 'none') firewallStatus = 'fail2ban';
        }

        // Check common ports exposed
        const listeningPorts = safe("ss -tlnp 2>/dev/null | tail -n +2");
        const exposedPorts = listeningPorts.split('\n').filter(l => l.includes('0.0.0.0') || l.includes(':::') || l.includes('[::]'));

        res.json({
            success: true,
            firewall: {
                activeFirewall: firewallStatus,
                ufw: ufwStatus,
                iptables: {
                    installed: hasIptables,
                    rulesCount: iptablesRules.length,
                    rules: iptablesRules.slice(0, 50)
                },
                fail2ban: fail2banStatus,
                exposedPorts: exposedPorts.map(p => p.trim()),
                recommendations: generateRecommendations(firewallStatus, ufwStatus, fail2banStatus, exposedPorts)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

function generateRecommendations(fw, ufw, f2b, exposed) {
    const recs = [];
    if (fw === 'none') {
        recs.push({ level: 'critical', message: 'No firewall active. Server is exposed to all traffic.' });
    }
    if (!f2b || !f2b.running) {
        recs.push({ level: 'warning', message: 'fail2ban is not running. No brute-force protection.' });
    }
    if (ufw && !ufw.active) {
        recs.push({ level: 'info', message: 'UFW is installed but not active. Run: ufw enable' });
    }
    if (exposed.some(p => p.includes(':22'))) {
        recs.push({ level: 'info', message: 'SSH port 22 is exposed. Consider using key-only auth.' });
    }
    if (exposed.some(p => p.includes(':3306'))) {
        recs.push({ level: 'warning', message: 'MySQL port 3306 is exposed externally.' });
    }
    if (exposed.some(p => p.includes(':6379'))) {
        recs.push({ level: 'warning', message: 'Redis port 6379 is exposed externally.' });
    }
    if (recs.length === 0) {
        recs.push({ level: 'ok', message: 'Security configuration looks good.' });
    }
    return recs;
}

// =====================
// FIREWALL ACTIONS
// =====================
router.post('/firewall/install-ufw', async (req, res) => {
    try {
        const installed = safe('which ufw 2>/dev/null');
        if (!installed) {
            const result = safe('apt-get install -y ufw 2>&1');
            logSecurity(req.user?.username, 'firewall_install_ufw', 'Installed UFW', req.ip);
            res.json({ success: true, message: 'UFW installed successfully', output: result });
        } else {
            res.json({ success: true, message: 'UFW is already installed' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/firewall/ufw/enable', async (req, res) => {
    try {
        safe('ufw --force enable 2>&1');
        logSecurity(req.user?.username, 'firewall_ufw_enable', 'UFW enabled', req.ip);
        res.json({ success: true, message: 'UFW enabled' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/firewall/ufw/disable', async (req, res) => {
    try {
        safe('ufw disable 2>&1');
        logSecurity(req.user?.username, 'firewall_ufw_disable', 'UFW disabled', req.ip);
        res.json({ success: true, message: 'UFW disabled' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/firewall/ufw/allow', async (req, res) => {
    try {
        const { port, proto, comment } = req.body;
        if (!port) return res.status(400).json({ success: false, message: 'Port required' });
        const p = proto || 'tcp';
        const c = comment ? ' comment "' + comment.replace(/"/g, '') + '"' : '';
        const result = safe('ufw allow ' + port + '/' + p + c + ' 2>&1');
        logSecurity(req.user?.username, 'firewall_ufw_allow', 'Allowed port ' + port + '/' + p, req.ip);
        res.json({ success: true, message: 'Port ' + port + '/' + p + ' allowed', output: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/firewall/ufw/deny', async (req, res) => {
    try {
        const { port, proto } = req.body;
        if (!port) return res.status(400).json({ success: false, message: 'Port required' });
        const result = safe('ufw deny ' + port + '/' + (proto || 'tcp') + ' 2>&1');
        logSecurity(req.user?.username, 'firewall_ufw_deny', 'Denied port ' + port, req.ip);
        res.json({ success: true, message: 'Port ' + port + ' denied', output: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/firewall/ufw/delete', async (req, res) => {
    try {
        const { rule } = req.body;
        if (!rule) return res.status(400).json({ success: false, message: 'Rule required' });
        const result = safe('ufw delete ' + rule + ' 2>&1');
        logSecurity(req.user?.username, 'firewall_ufw_delete', 'Deleted rule: ' + rule, req.ip);
        res.json({ success: true, message: 'Rule deleted', output: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/firewall/ufw/reset', async (req, res) => {
    try {
        safe('ufw --force reset 2>&1');
        logSecurity(req.user?.username, 'firewall_ufw_reset', 'UFW reset to defaults', req.ip);
        res.json({ success: true, message: 'UFW reset to defaults' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// FAIL2BAN ACTIONS
// =====================
router.post('/fail2ban/install', async (req, res) => {
    try {
        const installed = safe('which fail2ban-client 2>/dev/null');
        if (!installed) {
            safe('apt-get install -y fail2ban 2>&1');
            logSecurity(req.user?.username, 'fail2ban_install', 'Installed fail2ban', req.ip);
            res.json({ success: true, message: 'fail2ban installed' });
        } else {
            res.json({ success: true, message: 'fail2ban is already installed' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/fail2ban/start', async (req, res) => {
    try {
        const result = safe('systemctl start fail2ban 2>&1');
        logSecurity(req.user?.username, 'fail2ban_start', 'fail2ban started', req.ip);
        res.json({ success: true, message: 'fail2ban started', output: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/fail2ban/stop', async (req, res) => {
    try {
        const result = safe('systemctl stop fail2ban 2>&1');
        logSecurity(req.user?.username, 'fail2ban_stop', 'fail2ban stopped', req.ip);
        res.json({ success: true, message: 'fail2ban stopped', output: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/fail2ban/unban', async (req, res) => {
    try {
        const { jail, ip } = req.body;
        if (!jail || !ip) return res.status(400).json({ success: false, message: 'Jail and IP required' });
        const result = safe('fail2ban-client set ' + jail + ' unbanip ' + ip + ' 2>&1');
        logSecurity(req.user?.username, 'fail2ban_unban', 'Unbanned ' + ip + ' from ' + jail, req.ip);
        res.json({ success: true, message: 'IP ' + ip + ' unbanned from ' + jail, output: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/fail2ban/ban', async (req, res) => {
    try {
        const { jail, ip } = req.body;
        if (!jail || !ip) return res.status(400).json({ success: false, message: 'Jail and IP required' });
        const result = safe('fail2ban-client set ' + jail + ' banip ' + ip + ' 2>&1');
        logSecurity(req.user?.username, 'fail2ban_ban', 'Banned ' + ip + ' in ' + jail, req.ip);
        res.json({ success: true, message: 'IP ' + ip + ' banned in ' + jail, output: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// IP BLOCK (manual)
// =====================
router.post('/block-ip', async (req, res) => {
    try {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ success: false, message: 'IP required' });
        safe('iptables -A INPUT -s ' + ip + ' -j DROP 2>&1');
        logSecurity(req.user?.username, 'block_ip', 'Blocked IP: ' + ip, req.ip);
        res.json({ success: true, message: 'IP ' + ip + ' blocked via iptables' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/unblock-ip', async (req, res) => {
    try {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ success: false, message: 'IP required' });
        safe('iptables -D INPUT -s ' + ip + ' -j DROP 2>&1');
        logSecurity(req.user?.username, 'unblock_ip', 'Unblocked IP: ' + ip, req.ip);
        res.json({ success: true, message: 'IP ' + ip + ' unblocked' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/blocked-ips', async (req, res) => {
    try {
        const raw = safe('iptables -L INPUT -n 2>/dev/null');
        const blocked = raw.split('\n')
            .filter(l => l.includes('DROP'))
            .map(l => {
                const parts = l.split(/\s+/);
                return { ip: parts[3], rule: l.trim() };
            })
            .filter(b => b.ip && b.ip !== '0.0.0.0/0');
        res.json({ success: true, blocked: blocked });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// SECURITY AUDIT
// =====================
router.get('/audit', async (req, res) => {
    try {
        const checks = [];

        // Check .env permissions
        const envPerms = safe('stat -c %a /home/hostinesia/northline/.env 2>/dev/null');
        checks.push({ name: '.env file permissions', value: envPerms || 'N/A', pass: envPerms === '600' || envPerms === '640', severity: envPerms === '644' || envPerms === '777' ? 'high' : 'low' });

        // Check if running as root
        const user = safe('whoami');
        checks.push({ name: 'Running as', value: user, pass: user !== 'root', severity: user === 'root' ? 'high' : 'low' });

        // Check SSH config
        const sshPermitRoot = safe('grep -i "PermitRootLogin" /etc/ssh/sshd_config 2>/dev/null');
        checks.push({ name: 'SSH Root Login', value: sshPermitRoot || 'default (yes)', pass: !sshPermitRoot.includes('yes'), severity: 'medium' });

        const sshPassAuth = safe('grep -i "PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null');
        checks.push({ name: 'SSH Password Auth', value: sshPassAuth || 'default (yes)', pass: !sshPassAuth.includes('yes'), severity: 'medium' });

        // Check firewall
        const fwActive = safe('ufw status 2>/dev/null').includes('Status: active');
        checks.push({ name: 'Firewall active', value: fwActive ? 'UFW Active' : 'Inactive', pass: fwActive, severity: 'high' });

        // Check fail2ban
        const f2bRunning = safe('systemctl is-active fail2ban 2>/dev/null') === 'active';
        checks.push({ name: 'fail2ban running', value: f2bRunning ? 'Active' : 'Inactive', pass: f2bRunning, severity: 'medium' });

        // Check open ports
        const exposed = safe("ss -tlnp 2>/dev/null | grep -E '0\\.0\\.0\\.0|:::' | grep -v -E ':80|:443|:8080|:9000|:9001|:9002'").split('\n').filter(Boolean);
        checks.push({ name: 'Unexpected open ports', value: exposed.length + ' found', pass: exposed.length === 0, severity: exposed.length > 0 ? 'medium' : 'low', details: exposed });

        // Check nginx server_tokens
        const serverTokens = safe('grep -r "server_tokens" /etc/nginx/ 2>/dev/null');
        checks.push({ name: 'Nginx server tokens', value: serverTokens.includes('off') ? 'Hidden' : 'Visible', pass: serverTokens.includes('off'), severity: 'low' });

        // Check Node.js is not running as root
        const nodeUser = safe("ps -eo user,comm | grep node | head -1 | awk '{print $1}'");
        checks.push({ name: 'Node.js process user', value: nodeUser, pass: nodeUser !== 'root', severity: nodeUser === 'root' ? 'high' : 'low' });

        // Rate limit check
        const [rateLimit] = await db.execute(`
            SELECT COUNT(*) as hits FROM server_logs 
            WHERE status_code = 429 AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
        `);
        checks.push({ name: 'Rate limited requests (1h)', value: rateLimit[0].hits, pass: true, severity: 'info' });

        const score = checks.filter(c => c.pass).length;
        const total = checks.length;

        res.json({
            success: true,
            audit: {
                score: score,
                total: total,
                percentage: Math.round((score / total) * 100),
                checks: checks
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
