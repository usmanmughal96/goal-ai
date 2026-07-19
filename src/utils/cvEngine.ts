/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CalibrationData } from '../types';

export interface TrackingFrameResult {
  motionCount: number;
  centerX: number;
  centerY: number;
  motionMap: Uint8ClampedArray; // alpha mask for visualization
  flickDetected: boolean;
  flickVector?: {
    dx: number; // horizontal change (-1 to 1)
    dy: number; // vertical change (-1 to 1)
    speed: number; // raw gesture speed
    duration: number; // ms
  };
  isMediaPipe?: boolean; // flag to indicate high-precision tracking
}

export class WebcamCVEngine {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private prevFrameData: ImageData | null = null;
  
  // MediaPipe Hands integration
  private handsInstance: any = null;
  private latestLandmarks: any[] | null = null;
  private isProcessingMediaPipe: boolean = false;
  private lastMediaPipeTime: number = 0;
  private lastSendTime: number = 0;

  // Gesture tracking state
  private points: Array<{ x: number; y: number; t: number }> = [];
  private trackingActive: boolean = false;
  private lastMotionTime: number = 0;
  private cooldownUntil: number = 0;

  constructor() {
    this.canvasElement = document.createElement('canvas');
    this.canvasElement.width = 320;
    this.canvasElement.height = 240;
    this.ctx = this.canvasElement.getContext('2d', { willReadFrequently: true });

    // Initialize MediaPipe Hands if available from window
    try {
      if (typeof window !== 'undefined') {
        const checkInterval = setInterval(() => {
          if ((window as any).Hands) {
            clearInterval(checkInterval);
            this.initMediaPipe();
          }
        }, 500);
        // Also clean up if too long or already loaded
        setTimeout(() => clearInterval(checkInterval), 15000);
      }
    } catch (e) {
      console.warn("Failed setting up MediaPipe check:", e);
    }
  }

  private initMediaPipe() {
    try {
      const HandsClass = (window as any).Hands;
      this.handsInstance = new HandsClass({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      this.handsInstance.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.handsInstance.onResults((results: any) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          this.latestLandmarks = results.multiHandLandmarks[0];
          this.lastMediaPipeTime = Date.now();
        } else {
          this.latestLandmarks = null;
        }
        this.isProcessingMediaPipe = false;
      });
      console.log("MediaPipe Hands initialized successfully.");

      // WARM UP MediaPipe immediately with a dummy canvas to force WebAssembly compilation,
      // CDN fetching, and WebGL shader compilation in the background.
      // This completely prevents the game thread from stuttering or getting "stucky" when the camera is first opened!
      setTimeout(() => {
        try {
          const warmupCanvas = document.createElement('canvas');
          warmupCanvas.width = 100;
          warmupCanvas.height = 100;
          const warmupCtx = warmupCanvas.getContext('2d');
          if (warmupCtx) {
            warmupCtx.fillStyle = '#000000';
            warmupCtx.fillRect(0, 0, 100, 100);
            this.isProcessingMediaPipe = true;
            this.handsInstance.send({ image: warmupCanvas })
              .then(() => {
                console.log("MediaPipe Hands background warmup completed successfully.");
                this.isProcessingMediaPipe = false;
              })
              .catch((err: any) => {
                console.warn("MediaPipe Hands warmup error (expected if loading/network speed varies):", err);
                this.isProcessingMediaPipe = false;
              });
          }
        } catch (e) {
          console.warn("Failed to complete MediaPipe background warmup:", e);
          this.isProcessingMediaPipe = false;
        }
      }, 800);

    } catch (e) {
      console.error("Failed to initialize MediaPipe Hands:", e);
    }
  }

  setVideoElement(video: HTMLVideoElement) {
    this.videoElement = video;
  }

  isModelReady(): boolean {
    return this.handsInstance !== null;
  }

  reset() {
    this.prevFrameData = null;
    this.points = [];
    this.trackingActive = false;
    this.lastMotionTime = 0;
    this.cooldownUntil = 0;
    this.latestLandmarks = null;
  }

  /**
   * Generates a cool glowing crosshair/target ring around the tracked hand coordinate
   * to provide beautiful visual feedback during calibration and PIP previews.
   */
  private generateMockMotionMap(rx: number, ry: number): Uint8ClampedArray {
    const width = 320;
    const height = 240;
    const map = new Uint8ClampedArray(width * height);
    
    const cx = Math.floor(rx * width);
    const cy = Math.floor(ry * height);
    
    // Draw a digital radar ring & crosshair for extremely professional visuals
    for (let dy = -12; dy <= 12; dy++) {
      for (let dx = -12; dx <= 12; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const distSq = dx * dx + dy * dy;
          // Outer circle and center core dot
          if ((distSq > 60 && distSq < 85) || distSq < 12 || (Math.abs(dx) < 2 && Math.abs(dy) < 12) || (Math.abs(dy) < 2 && Math.abs(dx) < 12)) {
            map[y * width + x] = 255;
          }
        }
      }
    }
    return map;
  }

  /**
   * Processes the current webcam frame using MediaPipe hand tracking if loaded,
   * falling back elegantly to optical flow pixel differences if needed.
   */
  processFrame(calibration: CalibrationData): TrackingFrameResult | null {
    if (!this.videoElement || !this.ctx || !this.canvasElement) return null;
    if (this.videoElement.readyState < 2 || this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) return null; // HAVE_CURRENT_DATA and valid dimensions

    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    // Trigger MediaPipe processing asynchronously at a smooth, CPU-friendly throttled rate (max ~8 FPS)
    // Running at 8-10 FPS provides perfect tracking results while leaving the CPU completely free,
    // avoiding any game lag. The client UI's Exponential Moving Average handles smooth 60 FPS interpolation!
    const nowMs = Date.now();
    if (this.handsInstance && !this.isProcessingMediaPipe && (nowMs - this.lastSendTime > 120)) {
      this.isProcessingMediaPipe = true;
      this.lastSendTime = nowMs;
      this.handsInstance.send({ image: this.videoElement }).catch((err: any) => {
        console.warn("MediaPipe Hands prediction error:", err);
        this.isProcessingMediaPipe = false;
      });
    }

    // 1. HIGH-PRECISION MEDIAPIPE TRACKING ROUTINE
    // If MediaPipe is active, we bypass the heavy optical flow algorithm entirely.
    // This dramatically reduces CPU/GPU load and prevents any accidental "weird action" false positives.
    if (this.handsInstance) {
      if (this.latestLandmarks && (Date.now() - this.lastMediaPipeTime < 1000)) {
        const landmarks = this.latestLandmarks;
        
        // Track the middle finger MCP (landmark 9) instead of the index finger tip (8).
        // The middle MCP is the dead center of the knuckle area and remains completely
        // stationary relative to the hand when you close your fist or make a thumbs up.
        // This makes the aiming tracker follow your hand beautifully and smoothly without jumping around!
        const rawX = landmarks[9].x;
        const rawY = landmarks[9].y;

        // Map the 0..1 hand coordinate comfortably to 0..1 goal target space
        // Padding is added so that comfortable hand movements cover the entire goal width and height
        const rx = Math.max(0, Math.min(1, (rawX - 0.15) / 0.7));
        const ry = Math.max(0, Math.min(1, (rawY - 0.15) / 0.7));

        // Calculate finger folding states
        // Fingers are index (8), middle (12), ring (16), pinky (20).
        // A finger is folded if its tip Y is below its PIP joint or its MCP joint.
        const indexFolded = landmarks[8].y > landmarks[6].y || landmarks[8].y > landmarks[5].y;
        const middleFolded = landmarks[12].y > landmarks[10].y || landmarks[12].y > landmarks[9].y;
        const ringFolded = landmarks[16].y > landmarks[14].y || landmarks[16].y > landmarks[13].y;
        const pinkyFolded = landmarks[20].y > landmarks[18].y || landmarks[20].y > landmarks[17].y;

        const foldCount = (indexFolded ? 1 : 0) + (middleFolded ? 1 : 0) + (ringFolded ? 1 : 0) + (pinkyFolded ? 1 : 0);

        // A. High-Precision, Ultra-Robust Thumbs Up gesture:
        // 1. Thumb tip (4) is above thumb joints (3, 2).
        // 2. Thumb tip Y (4) is well above middle MCP (9).
        // 3. At least 3 other fingers are folded.
        const isThumbsUp = (
          landmarks[4].y < landmarks[3].y && 
          landmarks[4].y < landmarks[9].y - 0.05 &&
          foldCount >= 3
        );

        // Check shoot triggers - STRIKTLY ONLY Thumbs Up triggers a kick as per User Request!
        let flickDetected = false;
        let flickVector = undefined;
        const now = Date.now();

        if (isThumbsUp && now > this.cooldownUntil) {
          flickDetected = true;
          flickVector = {
            dx: 0,
            dy: -1,
            speed: 0.004, // Perfectly tuned goal-kick velocity
            duration: 150
          };
          this.cooldownUntil = now + 1500; // 1.5s shot cooldown
        }

        return {
          motionCount: 150, // mock high value to activate goal tracking state
          centerX: rx * width,
          centerY: ry * height,
          motionMap: this.generateMockMotionMap(rx, ry),
          flickDetected,
          flickVector,
          isMediaPipe: true
        };
      } else {
        // MediaPipe is active but no hand is currently visible in the frame
        return {
          motionCount: 0,
          centerX: width / 2,
          centerY: height / 2,
          motionMap: new Uint8ClampedArray(width * height),
          flickDetected: false,
          isMediaPipe: true
        };
      }
    }

    // 2. BACKWARD-COMPATIBLE OPTICAL FLOW FALLBACK ROUTINE
    // (Ensures the app ALWAYS works offline or on older browsers)
    this.ctx.drawImage(this.videoElement, 0, 0, width, height);
    const currFrameData = this.ctx.getImageData(0, 0, width, height);
    
    if (!this.prevFrameData) {
      this.prevFrameData = currFrameData;
      return {
        motionCount: 0,
        centerX: width / 2,
        centerY: height / 2,
        motionMap: new Uint8ClampedArray(width * height),
        flickDetected: false,
      };
    }

    const zoneX = 0;
    const zoneY = 0;
    const zoneW = width;
    const zoneH = height;

    const currData = currFrameData.data;
    const prevData = this.prevFrameData.data;
    const motionMap = new Uint8ClampedArray(width * height);
    
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    
    const diffThreshold = Math.max(12, 75 - calibration.sensitivity);

    for (let y = zoneY; y < zoneY + zoneH; y++) {
      for (let x = zoneX; x < zoneX + zoneW; x++) {
        const idx = (y * width + x) * 4;
        const rDiff = Math.abs(currData[idx] - prevData[idx]);
        const gDiff = Math.abs(currData[idx + 1] - prevData[idx + 1]);
        const bDiff = Math.abs(currData[idx + 2] - prevData[idx + 2]);
        const intensityDiff = (rDiff + gDiff + bDiff) / 3;

        if (intensityDiff > diffThreshold) {
          motionMap[y * width + x] = 255;
          sumX += x;
          sumY += y;
          count++;
        }
      }
    }

    this.prevFrameData = currFrameData;

    let centerX = 0;
    let centerY = 0;
    let flickDetected = false;
    let flickVector: TrackingFrameResult['flickVector'] = undefined;
    const nowTime = performance.now();

    if (count > 0) {
      centerX = sumX / count;
      centerY = sumY / count;
      
      const relativeX = (centerX - zoneX) / zoneW;
      const relativeY = (centerY - zoneY) / zoneH;

      if (nowTime > this.cooldownUntil) {
        const minMotionTrigger = Math.max(30, (zoneW * zoneH) * 0.02);
        if (count > minMotionTrigger) {
          if (!this.trackingActive) {
            this.trackingActive = true;
            this.points = [];
          }
          this.points.push({ x: relativeX, y: relativeY, t: nowTime });
          this.lastMotionTime = nowTime;
          if (this.points.length > 25) {
            this.points.shift();
          }
        }
      }
    } else {
      const motionQuietTimeout = 120;
      if (this.trackingActive && nowTime - this.lastMotionTime > motionQuietTimeout) {
        const result = this.analyzePoints();
        if (result) {
          flickDetected = true;
          flickVector = result;
          this.cooldownUntil = nowTime + 1200;
        }
        this.trackingActive = false;
        this.points = [];
      }
    }

    // Keep active points from timing out if we dwell inside
    if (this.trackingActive && this.points.length >= 4) {
      const len = this.points.length;
      for (let i = Math.max(0, len - 10); i < len - 2; i++) {
        const start = this.points[i];
        const end = this.points[len - 1];
        const duration = end.t - start.t;

        if (duration < 350 && duration > 50) {
          const result = this.analyzePointsFrom(i, len - 1);
          if (result) {
            flickDetected = true;
            flickVector = result;
            this.cooldownUntil = nowTime + 1200;
            this.trackingActive = false;
            this.points = [];
            break;
          }
        }
      }
    }

    return {
      motionCount: count,
      centerX,
      centerY,
      motionMap,
      flickDetected,
      flickVector,
      isMediaPipe: false
    };
  }

  private analyzePoints(): TrackingFrameResult['flickVector'] | null {
    return this.analyzePointsFrom(0, this.points.length - 1);
  }

  private analyzePointsFrom(startIndex: number, endIndex: number): TrackingFrameResult['flickVector'] | null {
    if (endIndex - startIndex < 2) return null;
    const start = this.points[startIndex];
    const end = this.points[endIndex];
    const duration = end.t - start.t;

    if (duration < 50 || duration > 450) return null;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = distance / duration;

    // 1. Thumbs Up representation: Fast vertical upward movement
    const isThumbsUp = (
      dy < -0.065 &&
      Math.abs(dy) > Math.abs(dx) * 1.15 &&
      speed >= 0.0016 &&
      duration <= 350
    );

    if (!isThumbsUp) {
      return null;
    }

    return {
      dx: dx,
      dy: -dy,
      speed,
      duration,
    };
  }
}
export const cvInstance = new WebcamCVEngine();
