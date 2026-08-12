const fs = require("fs");
const path = require("path");

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const SAFE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"];

const IMAGE_SIGNATURES = [
  { ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
  { ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ".gif", magic: [0x47, 0x49, 0x46, 0x38] },
  { ext: ".webp", magic: [0x52, 0x49, 0x46, 0x46] },
  { ext: ".pdf", magic: [0x25, 0x50, 0x44, 0x46] },
];

function safeExtensionFromMime(mimetype) {
  return MIME_TO_EXT[mimetype] || null;
}

function safeImageFilename(originalName, mimetype) {
  const base = path.basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 60) || "file";
  return base + (safeExtensionFromMime(mimetype) || ".jpg");
}

function detectImageExtFromFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(16);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    if (bytes < 12) return null;
    return detectImageExt(buf);
  } catch (err) {
    return null;
  } finally {
    if (fd) fs.closeSync(fd);
  }
}

function detectImageExt(buffer) {
  if (!buffer || buffer.length < 12) return null;
  for (const sig of IMAGE_SIGNATURES) {
    let match = true;
    for (let i = 0; i < sig.magic.length; i++) {
      if (buffer[i] !== sig.magic[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.ext;
  }
  return null;
}

module.exports = {
  MIME_TO_EXT,
  SAFE_EXTENSIONS,
  safeExtensionFromMime,
  safeImageFilename,
  detectImageExt,
  detectImageExtFromFile,
};
