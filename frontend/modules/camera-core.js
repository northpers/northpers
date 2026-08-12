// camera-core.js - Base camera handling module
// Handles getUserMedia, stream management, canvas capture

class CameraCore {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.facingMode = 'environment'; // 'environment' = back, 'user' = front
    this.constraints = {
      video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    };
    this.isActive = false;
    this.onFrameCallback = null;
    this.animationFrameId = null;
  }

  async init(videoElement, facingMode = 'environment') {
    this.facingMode = facingMode;
    this.video = videoElement;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.constraints = {
      video: {
        facingMode: { exact: facingMode },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
      this.video.srcObject = this.stream;
      await this.video.play();
      this.isActive = true;
      this.resizeCanvas();
      return true;
    } catch (err) {
      console.error('Camera init error:', err);
      throw new Error(`Gagal mengakses kamera: ${err.message}`);
    }
  }

  resizeCanvas() {
    if (this.video && this.video.videoWidth > 0) {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
    }
  }

  captureFrame() {
    if (!this.isActive || !this.video || this.video.readyState < 2) return null;
    this.resizeCanvas();
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    return this.canvas;
  }

  getFrameDataURL(type = 'image/jpeg', quality = 0.9) {
    const canvas = this.captureFrame();
    if (!canvas) return null;
    return canvas.toDataURL(type, quality);
  }

  getFrameBlob(type = 'image/jpeg', quality = 0.9) {
    return new Promise((resolve) => {
      const canvas = this.captureFrame();
      if (!canvas) return resolve(null);
      canvas.toBlob(resolve, type, quality);
    });
  }

  startFrameLoop(callback, fps = 30) {
    this.onFrameCallback = callback;
    const interval = 1000 / fps;
    let lastTime = 0;

    const loop = (now) => {
      if (!this.isActive) return;
      if (now - lastTime >= interval) {
        lastTime = now;
        const frame = this.captureFrame();
        if (frame && this.onFrameCallback) {
          this.onFrameCallback(frame, this.ctx);
        }
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stopFrameLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.onFrameCallback = null;
  }

  async switchCamera(facingMode) {
    this.stop();
    return this.init(this.video, facingMode);
  }

  stop() {
    this.stopFrameLoop();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.isActive = false;
  }

  getVideoSettings() {
    const track = this.stream?.getVideoTracks()[0];
    return track ? track.getSettings() : null;
  }

  isReady() {
    return this.isActive && this.video?.readyState >= 2;
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CameraCore;
}