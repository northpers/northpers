const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { adminAuth } = require('./admin');

router.use(adminAuth);

const NGINX_CONFIG = '/etc/nginx/sites-available/northline';
const CLOUDFLARED_CONFIG = '/home/hostinesia/.cloudflared/config.yml';
const BACKUP_DIR = '/home/hostinesia/northline/backups/nginx';
const SCRIPTS_DIR = '/home/hostinesia/northline/backups/scripts';

function safe(cmd) {
    try { return execSync(cmd + ' 2>/dev/null', { encoding: 'utf8', timeout: 15000 }).trim(); } catch (e) { return ''; }
}

function runCmd(cmd) {
    try {
        return { success: true, output: execSync(cmd + ' 2>/dev/null', { encoding: 'utf8', timeout: 15000 }).trim() };
    } catch (err) {
        return { success: false, output: err.stdout?.trim() || err.message };
    }
}

function logAdmin(adminId, adminUsername, action, details, ip) {
    db.execute(
        'INSERT INTO admin_action_logs (admin_id, admin_username, action, target, details, ip) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId || 0, adminUsername || 'system', action, 'domain-manager', details || '', ip || '']
    ).catch(() => {});
}

function readConfig(filePath) {
    try { return fs.readFileSync(filePath, 'utf8'); } catch (e) {
        try { return execSync('cat ' + JSON.stringify(filePath) + ' 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim(); } catch (e2) { return ''; }
    }
}

function backupConfig(filePath) {
    try {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const content = readConfig(filePath);
        if (!content) return false;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const name = path.basename(filePath) + '.' + ts + '.bak';
        fs.writeFileSync(path.join(BACKUP_DIR, name), content);
        return true;
    } catch (e) { return false; }
}

async function generateSyncScript() {
    const [domains] = await db.execute('SELECT * FROM admin_domains ORDER BY is_primary DESC');

    const nginxContent = readConfig(NGINX_CONFIG);
    const cfContent = readConfig(CLOUDFLARED_CONFIG);

    let nginxScript = '';
    let cfScript = '';

    // Generate nginx config
    if (nginxContent) {
        const serverNameRegex = /server_name\s+([^;]+);/;
        const match = nginxContent.match(serverNameRegex);
        if (match) {
            const managedDomains = domains.map(d => d.domain);
            const fixedNames = ['nl.hostinesia.my.id', 'localhost', '127.0.0.1'];
            const allNames = fixedNames.concat(managedDomains);
            const uniqueNames = [...new Set(allNames)];
            const newNginx = nginxContent.replace(serverNameRegex, 'server_name ' + uniqueNames.join(' ') + ';');

            if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
            const nginxTmp = path.join(SCRIPTS_DIR, 'nginx-sync-' + Date.now() + '.conf');
            fs.writeFileSync(nginxTmp, newNginx);
            nginxScript = `# Backup current config\ncp ${NGINX_CONFIG} ${NGINX_CONFIG}.bak.$(date +%s)\n# Write new config\ncp "${nginxTmp}" ${NGINX_CONFIG}\n# Test & reload\nnginx -t && systemctl reload nginx && echo "Nginx synced OK" || echo "Nginx test FAILED - check config"`;
        }
    }

    // Generate cloudflared config
    if (cfContent) {
        let cfLines = cfContent.trim().split('\n');
        // Remove hostname+service pairs and ingress headers
        const newCfLines = [];
        let skipNext = false;
        for (let i = 0; i < cfLines.length; i++) {
            if (skipNext) { skipNext = false; continue; }
            const trimmed = cfLines[i].trim();
            if (trimmed.startsWith('- hostname:')) {
                skipNext = true; // Also skip the service line below
                continue;
            }
            if (trimmed.startsWith('service:')) continue; // service lines
            if (trimmed.startsWith('ingress')) continue; // old ingress header (any form)
            if (trimmed.startsWith('- service:')) continue; // catch-all
            newCfLines.push(cfLines[i]);
        }

        // Clean up multiple blank lines
        const cleaned = [];
        let prevBlank = false;
        for (const line of newCfLines) {
            const isBlank = line.trim() === '';
            if (isBlank && prevBlank) continue;
            cleaned.push(line);
            prevBlank = isBlank;
        }

        // Add managed domains
        cleaned.push('');
        cleaned.push('ingress:');
        domains.forEach(d => {
            cleaned.push('  - hostname: ' + d.domain);
            cleaned.push('    service: http://[::1]:' + d.port);
        });
        cleaned.push('  - service: http_status:404');

        const cfTmp = path.join(SCRIPTS_DIR, 'cloudflared-sync-' + Date.now() + '.yml');
        fs.writeFileSync(cfTmp, cleaned.join('\n') + '\n');
        cfScript = `# Backup current config\ncp ${CLOUDFLARED_CONFIG} ${CLOUDFLARED_CONFIG}.bak.$(date +%s)\n# Write new config\ncp "${cfTmp}" ${CLOUDFLARED_CONFIG}\n# Restart\nsystemctl restart cloudflared && echo "Cloudflared synced OK" || echo "Cloudflared restart FAILED"`;
    }

    const fullScript = `#!/bin/bash
# Northline Domain Sync Script
# Generated at: ${new Date().toISOString()}
# Run with: sudo bash ${SCRIPTS_DIR}/domain-sync-latest.sh

set -e

echo "=== Northline Domain Sync ==="
echo ""

${nginxScript ? nginxScript + '\n' : '# Nginx: no changes needed\n'}
${cfScript ? cfScript + '\n' : '# Cloudflared: no changes needed\n'}

echo ""
echo "=== Sync Complete ==="
echo "Managed domains: ${domains.length}"
${domains.map(d => 'echo "  - ' + d.domain + ' → port ' + d.port + '"').join('\n')}
`;

    const scriptPath = path.join(SCRIPTS_DIR, 'domain-sync-latest.sh');
    if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    fs.writeFileSync(scriptPath, fullScript);

    return { scriptPath, scriptContent: fullScript, domains: domains.map(d => ({ domain: d.domain, port: d.port })) };
}

// =====================
// LIST ALL DOMAINS
// =====================
router.get('/list', async (req, res) => {
    try {
        const [domains] = await db.execute('SELECT * FROM admin_domains ORDER BY is_primary DESC, created_at ASC');

        let nginxDomains = [];
        const nginxContent = readConfig(NGINX_CONFIG);
        if (nginxContent) {
            const match = nginxContent.match(/server_name\s+([^;]+);/g);
            if (match) {
                match.forEach(function(line) {
                    const names = line.replace(/server_name\s+/, '').replace(/;/, '').trim().split(/\s+/);
                    names.forEach(function(n) {
                        if (n !== '_' && n !== 'localhost' && n !== '127.0.0.1') nginxDomains.push(n);
                    });
                });
            }
        }

        let cloudflaredDomains = [];
        const cfConfig = readConfig(CLOUDFLARED_CONFIG);
        if (cfConfig) {
            const cfMatches = cfConfig.match(/hostname:\s+(.+)/g);
            if (cfMatches) {
                cfMatches.forEach(function(line) {
                    const host = line.replace(/hostname:\s+/, '').trim();
                    if (host) cloudflaredDomains.push(host);
                });
            }
        }

        const synced = domains.map(function(d) {
            return {
                id: d.id,
                domain: d.domain,
                port: d.port,
                target_service: d.target_service,
                ssl_mode: d.ssl_mode,
                status: d.status,
                is_primary: d.is_primary,
                notes: d.notes,
                in_nginx: nginxDomains.includes(d.domain),
                in_cloudflared: cloudflaredDomains.includes(d.domain),
                created_at: d.created_at,
                updated_at: d.updated_at
            };
        });

        res.json({ success: true, domains: synced, nginxDomains, cloudflaredDomains });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// ADD NEW DOMAIN
// =====================
router.post('/add', async (req, res) => {
    const { domain, port, target_service, ssl_mode, notes } = req.body;
    if (!domain || !domain.trim()) {
        return res.status(400).json({ success: false, message: 'Domain is required' });
    }

    const cleanDomain = domain.trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9\-]*\.)+[a-z]{2,}$/.test(cleanDomain)) {
        return res.status(400).json({ success: false, message: 'Invalid domain format' });
    }

    const targetPort = parseInt(port) || 8080;
    const service = target_service || 'northline';
    const ssl = ssl_mode || 'cloudflare';

    try {
        const [existing] = await db.execute('SELECT id FROM admin_domains WHERE domain = ?', [cleanDomain]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Domain already exists in database' });
        }

        const steps = [];
        const errors = [];

        // Check DNS
        steps.push('Checking DNS resolution...');
        const dnsResult = safe('dig +short ' + cleanDomain);
        const hasDns = dnsResult.length > 0;
        steps.push('DNS: ' + (hasDns ? 'Resolves to ' + dnsResult : 'Not resolving yet'));

        // Check current configs
        steps.push('Reading current configs...');
        const nginxContent = readConfig(NGINX_CONFIG);
        const cfContent = readConfig(CLOUDFLARED_CONFIG);

        let inNginx = false;
        let inCf = false;

        if (nginxContent) {
            const snMatch = nginxContent.match(/server_name\s+([^;]+);/);
            if (snMatch && snMatch[1].split(/\s+/).includes(cleanDomain)) {
                inNginx = true;
                steps.push('Domain already in nginx config');
            } else {
                steps.push('Domain NOT in nginx config — needs sync');
            }
        } else {
            errors.push('Cannot read nginx config');
        }

        if (cfContent) {
            if (cfContent.includes(cleanDomain)) {
                inCf = true;
                steps.push('Domain already in cloudflared config');
            } else {
                steps.push('Domain NOT in cloudflared config — needs sync');
            }
        } else {
            errors.push('Cannot read cloudflared config');
        }

        // Insert into DB
        const status = errors.length > 0 ? 'error' : (hasDns ? 'active' : 'pending');
        await db.execute(
            'INSERT INTO admin_domains (domain, port, target_service, ssl_mode, status, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [cleanDomain, targetPort, service, ssl, status, notes || '']
        );

        // Generate sync script
        const sync = await generateSyncScript();

        if (!inNginx || !inCf) {
            steps.push('');
            steps.push('Domain saved to database. Config sync needed.');
            steps.push('Run: sudo bash ' + sync.scriptPath);
            steps.push('Or click "Apply Config" in the Domain Manager UI.');
        } else {
            steps.push('Domain already synced to configs.');
        }

        logAdmin(req.user?.id, req.user?.username, 'domain_add',
            'Added domain: ' + cleanDomain + ' (port: ' + targetPort + ')',
            req.ip
        );

        res.json({
            success: true,
            message: 'Domain added to database' + ((!inNginx || !inCf) ? '. Config sync needed.' : ''),
            domain: cleanDomain,
            status: status,
            hasDns: hasDns,
            dnsResult: dnsResult.substring(0, 100),
            inNginx: inNginx,
            inCloudflared: inCf,
            steps: steps,
            errors: errors,
            syncScript: (!inNginx || !inCf) ? sync.scriptContent : null
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// UPDATE DOMAIN
// =====================
router.put('/update/:id', async (req, res) => {
    const { id } = req.params;
    const { port, target_service, ssl_mode, status, is_primary, notes } = req.body;

    try {
        const [existing] = await db.execute('SELECT * FROM admin_domains WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Domain not found' });
        }

        const domain = existing[0];
        const newPort = parseInt(port) || domain.port;
        const newService = target_service || domain.target_service;
        const newSsl = ssl_mode || domain.ssl_mode;
        const newStatus = status || domain.status;
        const newIsPrimary = is_primary !== undefined ? (is_primary ? 1 : 0) : domain.is_primary;

        await db.execute(
            'UPDATE admin_domains SET port=?, target_service=?, ssl_mode=?, status=?, is_primary=?, notes=? WHERE id=?',
            [newPort, newService, newSsl, newStatus, newIsPrimary, notes || '', id]
        );

        if (newIsPrimary) {
            await db.execute('UPDATE admin_domains SET is_primary=0 WHERE id != ?', [id]);
        }

        // Generate sync script if port changed
        if (newPort !== domain.port) {
            await generateSyncScript();
        }

        logAdmin(req.user?.id, req.user?.username, 'domain_update',
            'Updated domain: ' + domain.domain + ' (port: ' + newPort + ', status: ' + newStatus + ')',
            req.ip
        );

        res.json({ success: true, message: 'Domain updated' + (newPort !== domain.port ? '. Config sync needed.' : '') });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// DELETE DOMAIN
// =====================
router.delete('/delete/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [existing] = await db.execute('SELECT * FROM admin_domains WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Domain not found' });
        }

        const domain = existing[0];
        await db.execute('DELETE FROM admin_domains WHERE id = ?', [id]);

        // Generate sync script
        const sync = await generateSyncScript();

        logAdmin(req.user?.id, req.user?.username, 'domain_delete',
            'Deleted domain: ' + domain.domain,
            req.ip
        );

        res.json({
            success: true,
            message: 'Domain deleted. Config sync needed.',
            syncScript: sync.scriptContent
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// SYNC ALL DOMAINS
// =====================
router.post('/sync-all', async (req, res) => {
    try {
        const sync = await generateSyncScript();

        logAdmin(req.user?.id, req.user?.username, 'domain_sync_all',
            'Generated sync script for ' + sync.domains.length + ' domains',
            req.ip
        );

        res.json({
            success: true,
            message: 'Sync script generated. Run it with sudo to apply.',
            scriptPath: sync.scriptPath,
            scriptContent: sync.scriptContent,
            domains: sync.domains
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// APPLY SYNC (runs the script)
// =====================
router.post('/apply-sync', async (req, res) => {
    try {
        const scriptPath = path.join(SCRIPTS_DIR, 'domain-sync-latest.sh');
        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ success: false, message: 'No sync script found. Click "Sync All" first.' });
        }

        // Find latest config files
        const nginxFiles = fs.readdirSync(SCRIPTS_DIR).filter(f => f.startsWith('nginx-sync-')).sort().reverse();
        const cfFiles = fs.readdirSync(SCRIPTS_DIR).filter(f => f.startsWith('cloudflared-sync-')).sort().reverse();
        if (nginxFiles.length === 0 || cfFiles.length === 0) {
            return res.status(404).json({ success: false, message: 'No config files found. Click "Sync All" first.' });
        }

        const nginxSrc = path.join(SCRIPTS_DIR, nginxFiles[0]);
        const cfSrc = path.join(SCRIPTS_DIR, cfFiles[0]);
        const output = [];
        let allOk = true;

        // Apply nginx config (uses sudoers entry)
        const nginxCp = runCmd('sudo cp ' + JSON.stringify(nginxSrc) + ' /etc/nginx/sites-available/northline');
        output.push('Nginx copy: ' + (nginxCp.success ? 'OK' : nginxCp.output));
        if (!nginxCp.success) allOk = false;

        const nginxTest = runCmd('sudo nginx -t 2>&1');
        output.push('Nginx test: ' + (nginxTest.success ? 'OK' : nginxTest.output));
        if (!nginxTest.success) allOk = false;

        if (nginxTest.success) {
            const nginxReload = runCmd('sudo systemctl reload nginx');
            output.push('Nginx reload: ' + (nginxReload.success ? 'OK' : nginxReload.output));
        }

        // Apply cloudflared config
        const cfCp = runCmd('sudo cp ' + JSON.stringify(cfSrc) + ' /home/hostinesia/.cloudflared/config.yml');
        output.push('Cloudflared copy: ' + (cfCp.success ? 'OK' : cfCp.output));
        if (!cfCp.success) allOk = false;

        const cfRestart = runCmd('sudo systemctl restart cloudflared');
        output.push('Cloudflared restart: ' + (cfRestart.success ? 'OK' : cfRestart.output));

        // Update last_synced_at
        await db.execute('UPDATE admin_domains SET last_synced_at = NOW()');

        logAdmin(req.user?.id, req.user?.username, 'domain_apply_sync', 'Applied sync', req.ip);

        res.json({ success: allOk, message: allOk ? 'Sync applied successfully' : 'Sync partially applied', output: output.join('\n') });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// GET SYNC SCRIPT
// =====================
router.get('/sync-script', async (req, res) => {
    try {
        const sync = await generateSyncScript();
        res.json({
            success: true,
            scriptPath: sync.scriptPath,
            scriptContent: sync.scriptContent,
            domains: sync.domains
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// TEST DOMAIN
// =====================
router.post('/test/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [existing] = await db.execute('SELECT * FROM admin_domains WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Domain not found' });
        }

        const domain = existing[0];
        const results = {};

        results.dns = safe('dig +short ' + domain.domain);
        results.hasDns = results.dns.length > 0;

        const httpResult = safe('curl -sS -o /dev/null -w "%{http_code} %{time_total}" --max-time 5 http://127.0.0.1:' + domain.port);
        const httpParts = httpResult.split(' ');
        results.httpStatus = parseInt(httpParts[0]) || 0;
        results.httpTime = parseFloat(httpParts[1]) || 0;
        results.reachable = results.httpStatus > 0;

        results.portOpen = safe('ss -tlnp | grep :' + domain.port + ' | head -1');

        logAdmin(req.user?.id, req.user?.username, 'domain_test',
            'Tested domain: ' + domain.domain,
            req.ip
        );

        res.json({ success: true, domain: domain.domain, results });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =====================
// DNS CHECK
// =====================
router.get('/dns-check/:domain', async (req, res) => {
    const { domain } = req.params;
    if (!domain) {
        return res.status(400).json({ success: false, message: 'Domain is required' });
    }

    try {
        const dns = safe('dig +short ' + domain);
        const serverIp = safe('curl -sS --max-time 5 ifconfig.me');

        res.json({
            success: true,
            domain,
            dnsResult: dns,
            hasDns: dns.length > 0,
            serverIp,
            matches: dns.includes(serverIp)
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
