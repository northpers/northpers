const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { adminAuth } = require('./admin');

router.use(adminAuth);

function safe(cmd) {
    try { return execSync(cmd + ' 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim(); } catch (e) { return ''; }
}

router.get('/info', async (req, res) => {
    try {
        const serverDir = '/home/hostinesia/northline';

        // OS
        const osInfo = {
            platform: os.platform(),
            distro: os.release(),
            arch: os.arch(),
            hostname: os.hostname(),
            kernel: safe('uname -r'),
            uptime: os.uptime(),
            totalMem: os.totalmem(),
            freeMem: os.freemem(),
            cpus: os.cpus()
        };
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            const prettyName = osRelease.match(/PRETTY_NAME="([^"]+)"/);
            const versionId = osRelease.match(/VERSION_ID="([^"]+)"/);
            const codename = osRelease.match(/VERSION_CODENAME="([^"]+)"/);
            if (prettyName) osInfo.distroPretty = prettyName[1];
            if (versionId) osInfo.versionId = versionId[1];
            if (codename) osInfo.codename = codename[1];
        } catch (e) {}

        // Node.js & NPM
        const nodeVersion = process.version;
        const npmVersion = safe('npm --version');
        const yarnVersion = safe('yarn --version');
        const gccVersion = safe('gcc --version | head -1');
        const pythonVersion = safe('python3 --version');

        // MySQL / MariaDB
        let mysqlVersion = '';
        let mysqlStatus = '';
        try {
            const rawMysql = safe("mysql --version 2>&1");
            const mMatch = rawMysql.match(/([\d]+\.[\d]+\.[\d]+[-+][^\s,]+)/);
            mysqlVersion = mMatch ? mMatch[1] : (rawMysql.match(/([\d]+\.[\d]+\.[\d]+)/) || [])[1] || '';
        } catch (e) {}
        try { mysqlStatus = safe('systemctl is-active mysql 2>/dev/null') || safe('systemctl is-active mariadb 2>/dev/null'); } catch (e) {}
        const mysqlPort = safe("ss -tlnp 2>/dev/null | grep ':3306' | head -1");

        // Nginx
        const rawNginx = safe('nginx -v 2>&1');
        const nginxVersion = rawNginx.replace('nginx version: ', '');
        let nginxStatus = '';
        try { nginxStatus = safe('systemctl is-active nginx 2>/dev/null'); } catch (e) {}
        const nginxPid = safe('cat /run/nginx.pid 2>/dev/null');
        const nginxWorkerCount = safe('pgrep -c "nginx: worker" 2>/dev/null || echo 0');

        // Cloudflared
        const rawCf = safe('cloudflared --version 2>&1');
        const cloudflaredVersion = rawCf.replace('cloudflared version ', '').split(' ')[0];
        let cloudflaredStatus = '';
        try { cloudflaredStatus = safe('systemctl is-active cloudflared 2>/dev/null'); } catch (e) {}
        const cloudflaredPid = safe('pgrep cloudflared 2>/dev/null');

        // Redis
        const redisVersion = safe('redis-cli INFO server 2>/dev/null | grep redis_version');
        let redisStatus = '';
        try { redisStatus = safe('systemctl is-active redis-server 2>/dev/null') || safe('systemctl is-active redis 2>/dev/null'); } catch (e) {}

        // Docker
        let dockerInfo = null;
        const dockerVersion = safe('docker --version');
        if (dockerVersion) {
            let dockerStatus = '';
            try { dockerStatus = safe('systemctl is-active docker 2>/dev/null'); } catch (e) {}
            const dockerContainers = safe('docker ps -a --format "{{.Names}}|{{.Image}}|{{.Status}}" 2>/dev/null');
            const dockerImages = safe('docker images --format "{{.Repository}}:{{.Tag}}|{{.Size}}" 2>/dev/null');
            const dockerComposeVersion = safe('docker-compose --version 2>/dev/null') || safe('docker compose version 2>/dev/null');
            dockerInfo = {
                version: dockerVersion.replace('Docker version ', '').split(',')[0],
                status: dockerStatus,
                containers: dockerContainers ? dockerContainers.split('\n').filter(Boolean).map(line => {
                    const [name, image, status] = line.split('|');
                    return { name, image, status };
                }) : [],
                images: dockerImages ? dockerImages.split('\n').filter(Boolean).map(line => {
                    const [repo, size] = line.split('|');
                    return { repo, size };
                }) : [],
                composeVersion: dockerComposeVersion ? dockerComposeVersion.replace(/^(Docker Compose version |Docker Compose v|docker-compose version )/, '').split(',')[0] : null
            };
        }

        // PM2
        const pm2Version = safe('pm2 -v');
        let pm2List = [];
        try {
            pm2List = JSON.parse(safe('pm2 jlist 2>/dev/null || echo "[]"'));
        } catch (e) {}

        // Git
        const rawGit = safe('git --version');
        const gitVersion = rawGit.replace('git version ', '');
        let gitInfo = {};
        try {
            const remote = safe('git -C ' + serverDir + ' remote get-url origin 2>/dev/null');
            const branch = safe('git -C ' + serverDir + ' branch --show-current 2>/dev/null');
            const lastCommit = safe('git -C ' + serverDir + ' log -1 --format="%h|%s|%cr" 2>/dev/null');
            if (lastCommit) {
                const [hash, msg, time] = lastCommit.split('|');
                gitInfo = { remote, branch, lastHash: hash, lastMessage: msg, lastTime: time };
            } else {
                gitInfo = { remote, branch };
            }
        } catch (e) {}

        // Project dependencies
        let projectDeps = {};
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'backend', 'package.json'), 'utf8'));
            projectDeps = {
                name: pkg.name,
                version: pkg.version,
                description: pkg.description || '',
                dependencies: Object.entries(pkg.dependencies || {}).map(([k, v]) => ({ name: k, version: v })),
                devDependencies: Object.entries(pkg.devDependencies || {}).map(([k, v]) => ({ name: k, version: v }))
            };
        } catch (e) {}

        // Frontend tech
        const frontendTech = [];
        try {
            const html = fs.readFileSync(path.join(serverDir, 'frontend', 'AppNorthAdmin.html'), 'utf8');
            if (html.includes('tailwind')) frontendTech.push({ name: 'Tailwind CSS', version: '3.x' });
            if (html.includes('chart.js') || html.includes('Chart(')) frontendTech.push({ name: 'Chart.js', version: '4.x' });
            if (html.includes('socket.io')) frontendTech.push({ name: 'Socket.IO Client', version: '4.x' });
        } catch (e) {}

        // Ports in use
        const portLines = safe("ss -tlnp 2>/dev/null | tail -n +2");
        const ports = portLines.split('\n').filter(Boolean).map(line => {
            const parts = line.split(/\s+/);
            const addr = parts[3] || '';
            const port = addr.split(':').pop();
            const proc = line.match(/users:\(\("([^"]+)"/);
            return { port, process: proc ? proc[1] : '-', addr };
        }).filter(p => p.port && !isNaN(p.port));
        const uniquePorts = [];
        const seenPorts = new Set();
        ports.forEach(p => { if (!seenPorts.has(p.port)) { seenPorts.add(p.port); uniquePorts.push(p); } });

        // Disk
        const diskLine = safe("df -h / | tail -1");
        const diskParts = diskLine.split(/\s+/);
        const disk = diskParts.length >= 6 ? { fs: diskParts[0], size: diskParts[1], used: diskParts[2], avail: diskParts[3], pct: diskParts[4], mount: diskParts[5] } : null;

        // Network
        const publicIp = safe('curl -s --max-time 3 ifconfig.me 2>/dev/null');
        const privateIp = safe("hostname -I 2>/dev/null | awk '{print $1}'");

        // Systemd services
        const services = [];
        ['nginx', 'mysql', 'mariadb', 'redis-server', 'redis', 'cloudflared', 'docker'].forEach(svc => {
            const status = safe('systemctl is-active ' + svc + ' 2>/dev/null');
            if (status) services.push({ name: svc, status });
        });

        // Load average
        const loadAvg = os.loadavg();

        res.json({
            success: true,
            tech: {
                os: osInfo,
                runtime: {
                    node: { version: nodeVersion, label: 'Node.js' },
                    npm: { version: npmVersion, label: 'npm' },
                    yarn: yarnVersion ? { version: yarnVersion, label: 'Yarn' } : null,
                    gcc: gccVersion ? { version: gccVersion, label: 'GCC' } : null,
                    python: pythonVersion ? { version: pythonVersion, label: 'Python' } : null,
                    pm2: { version: pm2Version, label: 'PM2', processes: pm2List.map(p => ({
                        name: p.name, pid: p.pid, status: p.pm2_env?.status,
                        cpu: p.monit?.cpu, memory: p.monit?.memory,
                        uptime: p.pm2_env?.pm_uptime, restarts: p.pm2_env?.restart_time || 0
                    })) }
                },
                database: {
                    mysql: { version: mysqlVersion, status: mysqlStatus, port: mysqlPort ? '3306' : '' },
                    redis: redisVersion ? { version: redisVersion.split(':')[1]?.trim() || '', status: redisStatus } : null
                },
                web: {
                    nginx: { version: nginxVersion, status: nginxStatus, pid: nginxPid, workers: parseInt(nginxWorkerCount) || 0 },
                    cloudflared: { version: cloudflaredVersion, status: cloudflaredStatus, pid: cloudflaredPid }
                },
                docker: dockerInfo,
                git: { version: gitVersion, ...gitInfo },
                project: projectDeps,
                frontendTech: frontendTech,
                ports: uniquePorts,
                disk: disk,
                network: { publicIp, privateIp },
                loadAvg: loadAvg,
                services: services
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
