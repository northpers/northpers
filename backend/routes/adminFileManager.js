const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { adminAuth } = require('./admin');

router.use(adminAuth);

const BASE_DIR = '/home/hostinesia/northline';
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const ALLOWED_TEXT_EXT = ['.js', '.json', '.css', '.html', '.htm', '.ts', '.jsx', '.tsx', '.md', '.txt', '.env', '.yml', '.yaml', '.xml', '.sql', '.sh', '.py', '.php', '.conf', '.cfg', '.log', '.csv', '.svg', '.gitignore', '.npmrc', '.editorconfig', '.eslintrc', '.prettierrc', '.bak', '.config'];

function safePath(reqPath) {
    const resolved = path.resolve(BASE_DIR, reqPath || '.');
    if (!resolved.startsWith(BASE_DIR)) return null;
    return resolved;
}

function getFileInfo(filePath, baseDir) {
    try {
        const stat = fs.statSync(filePath);
        const rel = path.relative(baseDir, filePath);
        const ext = path.extname(filePath).toLowerCase();
        const isDir = stat.isDirectory();
        let type = 'file';
        if (isDir) type = 'folder';
        else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'].includes(ext)) type = 'image';
        else if (['.mp4', '.webm', '.avi', '.mkv'].includes(ext)) type = 'video';
        else if (['.mp3', '.wav', '.ogg', '.flac'].includes(ext)) type = 'audio';
        else if (['.pdf'].includes(ext)) type = 'pdf';
        else if (['.zip', '.tar', '.gz', '.rar', '.7z'].includes(ext)) type = 'archive';

        return {
            name: path.basename(filePath),
            path: rel,
            type: type,
            size: isDir ? 0 : stat.size,
            modified: stat.mtime.toISOString(),
            created: stat.birthtime.toISOString(),
            permissions: (stat.mode & 0o777).toString(8),
            isDirectory: isDir,
            isEditable: !isDir && ALLOWED_TEXT_EXT.includes(ext),
            isImage: type === 'image'
        };
    } catch (e) {
        return null;
    }
}

router.get('/list', async (req, res) => {
    try {
        const dirPath = safePath(req.query.path || '.');
        if (!dirPath) return res.status(400).json({ success: false, message: 'Invalid path' });

        if (!fs.existsSync(dirPath)) {
            return res.status(404).json({ success: false, message: 'Directory not found' });
        }

        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) {
            return res.status(400).json({ success: false, message: 'Not a directory' });
        }

        const items = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const info = getFileInfo(fullPath, BASE_DIR);
            if (info) items.push(info);
        }

        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        const relPath = path.relative(BASE_DIR, dirPath);
        const breadcrumb = relPath ? relPath.split(path.sep) : [];

        res.json({
            success: true,
            path: relPath || '/',
            breadcrumb: breadcrumb,
            items: items,
            totalItems: items.length,
            totalSize: items.reduce((sum, i) => sum + (i.isDirectory ? 0 : i.size), 0)
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/read', async (req, res) => {
    try {
        const filePath = safePath(req.query.path);
        if (!filePath) return res.status(400).json({ success: false, message: 'Invalid path' });

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            return res.status(400).json({ success: false, message: 'Cannot read directory' });
        }

        if (stat.size > 2 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: 'File too large to read (' + (stat.size / 1024 / 1024).toFixed(1) + 'MB)' });
        }

        const ext = path.extname(filePath).toLowerCase();
        if (!ALLOWED_TEXT_EXT.includes(ext)) {
            return res.status(400).json({ success: false, message: 'Binary file, cannot display' });
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const info = getFileInfo(filePath, BASE_DIR);

        res.json({
            success: true,
            file: info,
            content: content
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/write', async (req, res) => {
    try {
        const { filePath, content } = req.body;
        const resolved = safePath(filePath);
        if (!resolved) return res.status(400).json({ success: false, message: 'Invalid path' });

        fs.writeFileSync(resolved, content, 'utf8');
        res.json({ success: true, message: 'File saved successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/mkdir', async (req, res) => {
    try {
        const { dirPath } = req.body;
        const resolved = safePath(dirPath);
        if (!resolved) return res.status(400).json({ success: false, message: 'Invalid path' });

        if (fs.existsSync(resolved)) {
            return res.status(400).json({ success: false, message: 'Directory already exists' });
        }

        fs.mkdirSync(resolved, { recursive: true });
        res.json({ success: true, message: 'Directory created successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/delete', async (req, res) => {
    try {
        const { itemPath } = req.body;
        const resolved = safePath(itemPath);
        if (!resolved) return res.status(400).json({ success: false, message: 'Invalid path' });

        if (!fs.existsSync(resolved)) {
            return res.status(404).json({ success: false, message: 'File or directory not found' });
        }

        if (resolved === BASE_DIR) {
            return res.status(400).json({ success: false, message: 'Cannot delete root directory' });
        }

        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
            fs.rmSync(resolved, { recursive: true, force: true });
        } else {
            fs.unlinkSync(resolved);
        }

        res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/rename', async (req, res) => {
    try {
        const { oldPath, newPath } = req.body;
        const resolvedOld = safePath(oldPath);
        const resolvedNew = safePath(newPath);
        if (!resolvedOld || !resolvedNew) return res.status(400).json({ success: false, message: 'Invalid path' });

        if (!fs.existsSync(resolvedOld)) {
            return res.status(404).json({ success: false, message: 'Source not found' });
        }

        if (fs.existsSync(resolvedNew)) {
            return res.status(400).json({ success: false, message: 'Destination already exists' });
        }

        fs.renameSync(resolvedOld, resolvedNew);
        res.json({ success: true, message: 'Renamed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/download', async (req, res) => {
    try {
        const filePath = safePath(req.query.path);
        if (!filePath) return res.status(400).json({ success: false, message: 'Invalid path' });

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            return res.status(400).json({ success: false, message: 'Cannot download directory' });
        }

        const fileName = path.basename(filePath);
        res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
        res.setHeader('Content-Length', stat.size);
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/preview', async (req, res) => {
    try {
        const filePath = safePath(req.query.path);
        if (!filePath) return res.status(400).json({ success: false, message: 'Invalid path' });

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const stat = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase();

        const mimeTypes = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon', '.pdf': 'application/pdf',
            '.mp4': 'video/mp4', '.webm': 'video/webm',
            '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
        };

        const mime = mimeTypes[ext];
        if (!mime) return res.status(400).json({ success: false, message: 'Cannot preview this file type' });

        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', stat.size);
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/chmod', async (req, res) => {
    try {
        const { itemPath, mode } = req.body;
        const resolved = safePath(itemPath);
        if (!resolved) return res.status(400).json({ success: false, message: 'Invalid path' });

        if (!fs.existsSync(resolved)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        fs.chmodSync(resolved, parseInt(mode, 8));
        res.json({ success: true, message: 'Permissions updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/tree', async (req, res) => {
    try {
        const dirPath = safePath(req.query.path || '.');
        if (!dirPath) return res.status(400).json({ success: false, message: 'Invalid path' });

        function buildTree(dirPath, depth) {
            if (depth > 3) return [];
            const items = [];
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
                    if (entry.name === 'node_modules') continue;
                    const fullPath = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        items.push({
                            name: entry.name,
                            path: path.relative(BASE_DIR, fullPath),
                            type: 'folder',
                            children: buildTree(fullPath, depth + 1)
                        });
                    }
                }
            } catch (e) {}
            return items;
        }

        const tree = buildTree(dirPath, 0);
        res.json({ success: true, tree: tree });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
