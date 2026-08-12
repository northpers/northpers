// ktp-scanner.js - KTP Scanner with back camera + frame overlay + edge detection + auto-capture
// Uses camera-core.js for base camera handling

import { CameraCore } from './camera-core.js';

class KTPScanner extends CameraCore {
  constructor(options = {}) {
    super();
    this.frameElement = null;
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this.isScanning = false;
    this.autoCaptureEnabled = true;
    this.captureCooldown = 2000; // ms
    this.lastCaptureTime = 0;
    this.edgeThreshold = 0.3;
    this.minKTPArea = 0.15; // minimum 15% of frame
    this.maxKTPArea = 0.85; // maximum 85% of frame
    this.stableFramesRequired = 3;
    this.stableFramesCount = 0;
    this.lastDetectedRect = null;
    this.onCaptureCallback = null;
    this.onStatusChangeCallback = null;
    this.debugMode = false;

    // KTP aspect ratio (85.6mm x 53.98mm) ≈ 1.585
    this.ktpAspectRatio = 1.585;
    this.aspectTolerance = 0.15;
  }

  init(videoElement, frameElement, options = {}) {
    this.frameElement = frameElement;
    Object.assign(this, options);

    // Create overlay canvas for edge detection visualization
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCtx = this.overlayCanvas.getContext('2d', { willReadFrequently: true });
    this.overlayCanvas.style.position = 'absolute';
    this.overlayCanvas.style.top = '0';
    this.overlayCanvas.style.left = '0';
    this.overlayCanvas.style.width = '100%';
    this.overlayCanvas.style.height = '100%';
    this.overlayCanvas.style.pointerEvents = 'none';
    this.overlayCanvas.style.zIndex = '10';

    // Insert overlay canvas after video element
    if (this.video && this.video.parentNode) {
      this.video.parentNode.insertBefore(this.overlayCanvas, this.video.nextSibling);
    }

    return super.init(this.video, 'environment');
  }

  async startScanning() {
    if (!this.isReady()) throw new Error('Camera not ready');
    this.isScanning = true;
    this.stableFramesCount = 0;
    this.lastDetectedRect = null;
    this.startFrameLoop(this.processFrame.bind(this), 15); // ~15 FPS for edge detection
    this.updateStatus('scanning');
  }

  stopScanning() {
    this.isScanning = false;
    this.stopFrameLoop();
    this.clearOverlay();
    this.updateStatus('idle');
  }

  processFrame(frame, ctx) {
    if (!this.isScanning) return;

    try {
      // Resize overlay canvas to match video
      this.resizeOverlay();

      // Convert frame to grayscale for edge detection
      const gray = this.toGrayscale(frame);

      // Detect edges using Canny-like approach
      const edges = this.detectEdges(gray);

      // Find KTP-like rectangles
      const rectangles = this.findRectangles(edges);

      // Filter by KTP aspect ratio and size
      const ktpRects = this.filterKTPRectangles(rectangles);

      // Draw detection overlay
      this.drawOverlay(ktpRects);

      // Check for stable detection
      if (ktpRects.length > 0) {
        const bestRect = this.getBestRect(ktpRects);
        if (this.isStableDetection(bestRect)) {
          this.stableFramesCount++;
          if (this.stableFramesRequired <= this.stableFramesCount && this.autoCaptureEnabled) {
            this.triggerAutoCapture();
          }
        } else {
          this.stableFramesCount = 0;
        }
        this.lastDetectedRect = bestRect;
      } else {
        this.stableFramesCount = 0;
        this.lastDetectedRect = null;
      }
    } catch (err) {
      console.error('Frame processing error:', err);
    }
  }

  resizeOverlay() {
    if (this.video && this.video.videoWidth > 0) {
      this.overlayCanvas.width = this.video.videoWidth;
      this.overlayCanvas.height = this.video.videoHeight;
      this.overlayCanvas.style.width = `${this.video.clientWidth}px`;
      this.overlayCanvas.style.height = `${this.video.clientHeight}px`;
    }
  }

  toGrayscale(frame) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = frame.width;
    tempCanvas.height = frame.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(frame, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    return { data, width: frame.width, height: frame.height };
  }

  detectEdges(gray) {
    const { data, width, height } = gray;
    const edges = new Uint8Array(width * height);
    const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < gray.height - 1; y++) {
      for (let x = 1; x < gray.width - 1; x++) {
        let gx = 0, gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const val = gray.data[idx * 4];
            gx += val * kernelX[(ky + 1) * 3 + (kx + 1)];
            gy += val * kernelY[(ky + 1) * 3 + (kx + 1)];
          }
        }
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = magnitude > this.edgeThreshold * 255 ? 255 : 0;
      }
    }
    return { data: edges, width: gray.width, height: gray.height };
  }

  findRectangles(edges) {
    // Simplified contour approximation - find contours and approximate to polygons
    const contours = this.findContours(edges);
    const rectangles = [];

    for (const contour of contours) {
      if (contour.length < 4) continue;
      const rect = this.approximateRect(contour);
      if (rect) rectangles.push(rect);
    }
    return rectangles;
  }

  findContours(edges) {
    // Simplified contour finding - use marching squares or similar
    // For production, use OpenCV.js findContours
    const contours = [];
    const visited = new Set();
    const { data, width, height } = edges;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (data[idx] > 0 && !visited.has(idx)) {
          const contour = this.traceContour(edges, x, y, visited);
          if (contour.length > 10) contours.push(contour);
        }
      }
    }
    return contours;
  }

  traceContour(edges, startX, startY, visited) {
    const contour = [];
    const { data, width, height } = edges;
    let x = startX, y = startY;
    let dir = 0; // 0=right, 1=down, 2=left, 3=up
    const dirs = [[1,0], [0,1], [-1,0], [0,-1]];

    do {
      const idx = y * width + x;
      if (visited.has(idx)) break;
      visited.add(idx);
      contour.push({ x, y });

      // Find next edge pixel (simplified Moore neighborhood tracing)
      let found = false;
      for (let i = 0; i < 8; i++) {
        const ndir = (dir + i) % 8;
        const ndirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
        const nx = x + ndirs[ndir][0];
        const ny = y + ndirs[ndir][1];
        const nidx = ny * width + nx;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && data[nidx] > 0 && !visited.has(nidx)) {
          x = nx; y = ny; dir = (ndir + 4) % 8; found = true; break;
        }
      }
      if (!found) break;
    } while (x !== startX || y !== startY);

    return contour;
  }

  approximateRect(contour) {
    // Simplified: find min/max bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of contour) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 20 || h < 20) return null;
    return { x: minX, y: minY, w, h, area: w * h, aspect: w / h };
  }

  filterKTPRectangles(rectangles) {
    const frameArea = this.overlayCanvas.width * this.overlayCanvas.height;
    return rectangles.filter(r => {
      const aspectOk = Math.abs(r.aspect - this.ktpAspectRatio) < this.aspectTolerance;
      const areaRatio = r.area / (this.overlayCanvas.width * this.overlayCanvas.height);
      const areaOk = areaRatio >= this.minKTPArea && areaRatio <= this.maxKTPArea;
      return aspectOk && areaOk;
    });
  }

  getBestRect(rectangles) {
    if (!rectangles.length) return null;
    // Prefer largest rectangle closest to center
    const centerX = this.overlayCanvas.width / 2;
    const centerY = this.overlayCanvas.height / 2;
    return rectangles.reduce((best, r) => {
      const dist = Math.hypot(r.x + r.w/2 - centerX, r.y + r.h/2 - centerY);
      const bestDist = Math.hypot(best.x + best.w/2 - centerX, best.y + best.h/2 - centerY);
      return (dist < bestDist && r.area > best.area * 0.8) ? r : best;
    });
  }

  isStableDetection(rect) {
    if (!this.lastDetectedRect) return false;
    const dx = Math.abs(rect.x - this.lastDetectedRect.x) / this.overlayCanvas.width;
    const dy = Math.abs(rect.y - this.lastDetectedRect.y) / this.overlayCanvas.height;
    const dw = Math.abs(rect.w - this.lastDetectedRect.w) / this.overlayCanvas.width;
    const dh = Math.abs(rect.h - this.lastDetectedRect.h) / this.overlayCanvas.height;
    return dx < 0.02 && dy < 0.02 && dw < 0.02 && dh < 0.02;
  }

  drawOverlay(rectangles) {
    const ctx = this.overlayCtx;
    const { width, height } = this.overlayCanvas;
    ctx.clearRect(0, 0, width, height);

    // Draw frame guide
    const guideW = width * 0.7;
    const guideH = guideW / this.ktpAspectRatio;
    const gx = (width - guideW) / 2;
    const gy = (height - guideH) / 2;

    // Semi-transparent overlay outside guide
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);
    ctx.clearRect(gx, gy, guideW, guideH);

    // Corner markers
    const cornerSize = 30;
    const cornerColor = '#00FF00';
    ctx.strokeStyle = cornerColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const corners = [
      [gx, gy], [gx + guideW, gy],
      [gx, gy + guideH], [gx + guideW, gy + guideH]
    ];

    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx - cornerSize, cy);
      ctx.lineTo(cx + cornerSize, cy);
      ctx.moveTo(cx, cy - cornerSize);
      ctx.lineTo(cx, cy + cornerSize);
      ctx.stroke();
    }

    // Draw detected rectangles
    for (const rect of arguments[0] || []) {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  clearOverlay() {
    this.overlayCtx?.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  }

  triggerAutoCapture() {
    const now = Date.now();
    if (now - this.lastCaptureTime < this.captureCooldown) return;
    this.lastCaptureTime = Date.now();

    const blob = this.getFrameBlob('image/jpeg', 0.95);
    blob.then(blob => {
      if (blob && this.onCaptureCallback) {
        this.onCaptureCallback(blob, 'ktp_front');
      }
    });
  }

  async getFrameBlob(type = 'image/jpeg', quality = 0.95) {
    return new Promise(resolve => {
      const canvas = this.captureFrame();
      if (!canvas) return resolve(null);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.95);
    });
  }

  updateStatus(status) {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status);
    }
  }

  onCapture(callback) {
    this.onCaptureCallback = callback;
  }

  onStatusChange(callback) {
    this.onStatusChangeCallback = callback;
  }

  clearOverlay() {
    this.overlayCtx?.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  }

  stop() {
    this.stopScanning();
    super.stop();
    if (this.overlayCanvas && this.overlayCanvas.parentNode) {
      this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
    }
  }
}

export { KTPScanner };