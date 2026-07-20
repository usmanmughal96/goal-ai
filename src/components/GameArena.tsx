/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Volume2, VolumeX, RotateCcw, Award, Play, AlertCircle, Home, Zap, Flame } from 'lucide-react';
import { CalibrationData, Difficulty, KickResult, KickResultType } from '../types';
import { cvInstance, TrackingFrameResult } from '../utils/cvEngine';
import { soundEffects } from '../utils/audio';
import { generateCommentary, ShotOutcome } from '../utils/geminiCommentary';

interface GameArenaProps {
  calibration: CalibrationData;
  difficulty: Difficulty;
  goalkeeperColor: string;
  isDarkMode: boolean;
  onGameOver: (finalScore: number, finalStreak: number) => void;
  onHome: () => void;
  webcamStream: MediaStream | null;
}

// Goal dimensions in virtual coordinates
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

const GOAL_LEFT = 220;
const GOAL_RIGHT = 580;
const GOAL_TOP = 140;
const GOAL_BOTTOM = 350;

export default function GameArena({
  calibration,
  difficulty,
  goalkeeperColor,
  isDarkMode,
  onGameOver,
  onHome,
  webcamStream,
}: GameArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // Audio state
  const [muted, setMuted] = useState(false);
  
  // Game States
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [gameMessage, setGameMessage] = useState<string>('Raise a Thumbs-Up 👍 to Shoot!');
  const [messageType, setMessageType] = useState<'info' | 'goal' | 'saved' | 'missed' | 'post'>('info');
  const [isKicking, setIsKicking] = useState(false);
  const [isTrackingReady, setIsTrackingReady] = useState(false);
  const isTrackingReadyRef = useRef(false);

  // Gemini AI commentary
  const [commentary, setCommentary] = useState<string>('');
  
  // High-performance finger-tracking and motion refs (no re-renders!)
  const motionCountRef = useRef(0);
  const fingerXRef = useRef<number | null>(null);
  const fingerYRef = useRef<number | null>(null);
  const fingerActiveRef = useRef<boolean>(false);
  const fingerAimPointRef = useRef<{ x: number; y: number } | null>(null);

  // Smooth filtering to prevent jitter and blinking when hand is held still
  const smoothedAimXRef = useRef<number | null>(null);
  const smoothedAimYRef = useRef<number | null>(null);
  const noMotionFramesRef = useRef<number>(0);
  const lastValidAimPointRef = useRef<{ x: number; y: number }>({ x: CANVAS_WIDTH / 2, y: 235 });

  // Stable refs for PIP preview to prevent video flickering/blinking
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipMotionSpanRef = useRef<HTMLSpanElement | null>(null);
  const pipStatusDotRef = useRef<HTMLDivElement | null>(null);

  // Ball physics & Goalkeeper state reference
  const simRef = useRef({
    // Ball State
    bx: CANVAS_WIDTH / 2,
    by: 420,
    bz: 0, // 0 is front, 1 is goal-plane
    vx: 0,
    vy: 0,
    vz: 0,
    ballSpin: 0,
    ballAngle: 0,
    
    // Goalkeeper State
    kx: CANVAS_WIDTH / 2,
    ky: GOAL_BOTTOM - 25,
    kTargetX: CANVAS_WIDTH / 2,
    kTargetY: GOAL_BOTTOM - 25,
    kDiving: false,
    kDiveType: 'stand' as 'stand' | 'dive-left' | 'dive-right' | 'jump-left' | 'jump-right',
    kScaleX: 1,
    kScaleY: 1,
    
    // Net Ripple distortion state
    netWiggle: 0,
    netImpactX: CANVAS_WIDTH / 2,
    netImpactY: GOAL_TOP,
    
    // Whistle state
    roundPending: true,
  });

  // World Cup 2026 ball image
  const ballImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = '/ball-wc2026.png';
    img.onload = () => { ballImageRef.current = img; };
  }, []);

  // Mouse fallback tracking coordinates
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Initialize and handle Audio Context
  useEffect(() => {
    soundEffects.setMute(muted);
    if (!muted) {
      soundEffects.startAmbiance();
    }
    return () => {
      soundEffects.stopAmbiance();
    };
  }, [muted]);

  // Hook up hidden video element to the stream
  useEffect(() => {
    const video = hiddenVideoRef.current;
    if (video && webcamStream) {
      if (video.srcObject !== webcamStream) {
        video.srcObject = webcamStream;
        video.play().catch(e => console.warn('Hidden video stream error', e));
      }
      cvInstance.setVideoElement(video);
      cvInstance.reset();
    }

    const pipVideo = pipVideoRef.current;
    if (pipVideo && webcamStream) {
      if (pipVideo.srcObject !== webcamStream) {
        pipVideo.srcObject = webcamStream;
        pipVideo.play().catch(e => console.warn('PIP video stream error', e));
      }
    }
    
    // Sound on kickoff whistle
    soundEffects.playWhistle();
  }, [webcamStream]);

  // Synchronize webcam tracking readiness
  useEffect(() => {
    if (!webcamStream) {
      setIsTrackingReady(true);
      isTrackingReadyRef.current = true;
    } else {
      setIsTrackingReady(false);
      isTrackingReadyRef.current = false;
    }
  }, [webcamStream]);

  // Main Render Loop: 60 FPS Canvas Game Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const sim = simRef.current;

    const render = () => {
      // Process Webcam frames in background with zero-re-render refs
      const video = hiddenVideoRef.current;
      if (video && webcamStream && !isKicking && sim.roundPending) {
        // Dynamic check for tracking readiness
        if (!isTrackingReadyRef.current) {
          const isReadyNow = cvInstance.isModelReady() && video.readyState >= 2 && video.videoWidth > 0;
          if (isReadyNow) {
            isTrackingReadyRef.current = true;
            setIsTrackingReady(true);
          }
        }

        const cvResult = cvInstance.processFrame(calibration);
        if (cvResult) {
          motionCountRef.current = cvResult.motionCount;

          // Direct DOM updates for PIP metrics (smooth, non-blinking!)
          if (pipMotionSpanRef.current) {
            pipMotionSpanRef.current.textContent = `${cvResult.motionCount} PX`;
          }
          if (pipStatusDotRef.current) {
            if (cvResult.motionCount > 50) {
              pipStatusDotRef.current.className = "absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-lime-400 shadow-[0_0_8px_#a3e635] animate-pulse";
            } else {
              pipStatusDotRef.current.className = "absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-zinc-600";
            }
          }
          
          if (cvResult.motionCount > 8) {
            noMotionFramesRef.current = 0; // reset grace count when motion is active
            
            // Map the center of motion x and y to 0..1 values inside the entire 320x240 camera frame
            const relativeX = cvResult.centerX / 320;
            const relativeY = cvResult.centerY / 240;
            
            const rx = Math.max(0, Math.min(1, relativeX));
            const ry = Math.max(0, Math.min(1, relativeY));
            
            // Invert rx since webcam is mirrored horizontally
            const invertedRx = calibration.invertX ? rx : 1 - rx;
            
            // Project these values to the Goal mouth targeting area (fully cover the goal space)
            const aimX = GOAL_LEFT + invertedRx * (GOAL_RIGHT - GOAL_LEFT);
            const aimY = GOAL_TOP + ry * (GOAL_BOTTOM - GOAL_TOP);
            
            // Apply Exponential Moving Average for buttery smooth aim (anti-jitter)
            if (smoothedAimXRef.current === null) {
              smoothedAimXRef.current = aimX;
              smoothedAimYRef.current = aimY;
            } else {
              const emaFactor = 0.16; // highly responsive but completely dampens any minor hand shake!
              smoothedAimXRef.current = smoothedAimXRef.current * (1 - emaFactor) + aimX * emaFactor;
              smoothedAimYRef.current = smoothedAimYRef.current * (1 - emaFactor) + aimY * emaFactor;
            }

            fingerActiveRef.current = true;
            fingerXRef.current = invertedRx * CANVAS_WIDTH;
            fingerYRef.current = ry * CANVAS_HEIGHT;
            fingerAimPointRef.current = { x: smoothedAimXRef.current, y: smoothedAimYRef.current };
            lastValidAimPointRef.current = { x: smoothedAimXRef.current, y: smoothedAimYRef.current };

            if (cvResult.flickDetected && cvResult.flickVector) {
              // Map speed to physical game velocity
              const mappedSpeed = Math.min(24, Math.max(8, cvResult.flickVector.speed * 4200));
              
              // Shoot DIRECTLY towards the target they have been aiming at with their hand!
              const targetX = lastValidAimPointRef.current.x;
              const targetY = lastValidAimPointRef.current.y;
              
              triggerKick(targetX, targetY, mappedSpeed);
              
              fingerActiveRef.current = false;
              fingerAimPointRef.current = null;
              smoothedAimXRef.current = null;
              smoothedAimYRef.current = null;
            }
          } else {
            // Decay grace frames when there is no active motion to prevent blinking
            noMotionFramesRef.current += 1;
            if (noMotionFramesRef.current > 75) { // 1.25s at 60fps
              fingerActiveRef.current = false;
              fingerAimPointRef.current = null;
              smoothedAimXRef.current = null;
              smoothedAimYRef.current = null;
            }
          }
        }
      } else {
        fingerActiveRef.current = false;
        fingerAimPointRef.current = null;
        smoothedAimXRef.current = null;
        smoothedAimYRef.current = null;
      }

      // Physics logic
      if (isKicking) {
        // Increment depth position
        sim.bz += sim.vz;
        sim.bx += sim.vx;
        sim.by -= sim.vy; // Subtract because canvas Y goes down

        // Apply slight gravity to ball flight
        sim.vy -= 0.15;
        sim.ballAngle += sim.ballSpin;

        // Animate goalie dive synchronously based on depth progression
        if (sim.bz > 0.4 && !sim.kDiving) {
          triggerGoalkeeperDive();
        }

        // Smooth goalie movement towards targets
        sim.kx += (sim.kTargetX - sim.kx) * 0.18;
        sim.ky += (sim.kTargetY - sim.ky) * 0.18;

        // Check Goalmouth contact at critical depth (z >= 1.0)
        if (sim.bz >= 1.0) {
          resolveShotOutcome();
        }
      } else {
        // Preparation state: idle goalie wiggles slightly side to side
        if (sim.roundPending) {
          const time = Date.now() * 0.004;
          const shuffleRange = difficulty === 'hard' ? 45 : 30;
          sim.kTargetX = CANVAS_WIDTH / 2 + Math.sin(time) * shuffleRange;
          sim.kx += (sim.kTargetX - sim.kx) * 0.05;
          
          // Keeper bounce animation
          sim.ky = (GOAL_BOTTOM - 25) + Math.abs(Math.sin(time * 2)) * 6;
          
          // Arm wave
          sim.kDiveType = 'stand';
        }
      }

      // Decaying Net Ripple wiggle
      sim.netWiggle *= 0.94;

      // START DRAWING ARENA GRAPHICS
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1. SKY GRADIENT
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 180);
      if (isDarkMode) {
        skyGrad.addColorStop(0, '#020617'); // Pitch dark late-night sky
        skyGrad.addColorStop(1, '#0f172a');
      } else {
        skyGrad.addColorStop(0, '#7dd3fc'); // Gorgeous sunny day cyan
        skyGrad.addColorStop(1, '#bae6fd');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, 180);

      // Late night stadium light glow overlays
      if (isDarkMode) {
        drawStadiumFloodlights(ctx);
      }

      // 2. THE SPECTATOR STANDS (Rows of colored pixel fans!)
      drawStadiumCrowd(ctx);

      // 3. PITCH / GRASS (Bands of deep/light emerald green)
      const pitchGrad = ctx.createLinearGradient(0, 180, 0, CANVAS_HEIGHT);
      pitchGrad.addColorStop(0, '#15803d');
      pitchGrad.addColorStop(1, '#16a34a');
      ctx.fillStyle = pitchGrad;
      ctx.fillRect(0, 180, CANVAS_WIDTH, CANVAS_HEIGHT - 180);

      // Horizontal lawn stripes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      for (let y = 180; y < CANVAS_HEIGHT; y += 40) {
        ctx.fillRect(0, y, CANVAS_WIDTH, 20);
      }

      // Grass outlines & penalty box lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Goal line
      ctx.moveTo(100, GOAL_BOTTOM);
      ctx.lineTo(700, GOAL_BOTTOM);
      // Penalty Box lines
      ctx.moveTo(120, GOAL_BOTTOM);
      ctx.lineTo(160, 260);
      ctx.lineTo(640, 260);
      ctx.lineTo(680, GOAL_BOTTOM);
      // Penalty spot
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH / 2, 420, 6, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fill();

      // 4. GOAL POST NETTING (Elastic deformation grid lines)
      drawGoalNet(ctx, sim.netWiggle, sim.netImpactX, sim.netImpactY);

      // 5. THE GOAL FRAMING
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 12;
      ctx.strokeRect(GOAL_LEFT, GOAL_TOP, GOAL_RIGHT - GOAL_LEFT, GOAL_BOTTOM - GOAL_TOP);
      // clear shadows for rest
      ctx.shadowBlur = 0;

      // 6. DRAW GOALKEEPER (Character vectors)
      drawGoalkeeperCharacter(ctx, sim.kx, sim.ky, goalkeeperColor, sim.kDiveType);

      // 7. DRAW BALL SHADOW ON GRASS
      // Ball height above grass is CANVAS_HEIGHT_START - ball.y
      const grassY = 420 - (sim.bz * 110); // project grass floor depth line
      const shadowX = sim.bx;
      const shadowY = grassY;
      const shadowScale = Math.max(0.2, 1 - sim.bz * 0.6);
      
      ctx.beginPath();
      ctx.ellipse(shadowX, shadowY, 22 * shadowScale, 8 * shadowScale, 0, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fill();

      // 8. DRAW SOCCER BALL WITH 3D RADIUS & ROTATION (WC 2026 Adidas Trionda)
      const ballRadius = Math.max(7, 26 * (1 - sim.bz * 0.65));
      ctx.save();
      ctx.translate(sim.bx, sim.by);
      ctx.rotate(sim.ballAngle);

      if (ballImageRef.current) {
        // Clip to circle so the image stays round
        ctx.beginPath();
        ctx.arc(0, 0, ballRadius, 0, 2 * Math.PI);
        ctx.clip();
        ctx.drawImage(ballImageRef.current, -ballRadius, -ballRadius, ballRadius * 2, ballRadius * 2);
      } else {
        // Fallback to plain white ball while image loads
        ctx.beginPath();
        ctx.arc(0, 0, ballRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      // 9. MOUSE / TOUCH DRAG VECTOR OVERLAY (Fallback input)
      if (dragStart && dragCurrent && !isKicking && sim.roundPending) {
        // Draw elegant glowing line from the ball to current drag cursor
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#06b6d4'; // Cyan neon
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        ctx.lineTo(dragCurrent.x, dragCurrent.y);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        // Drag Target box crosshair projected onto goal area
        const dx = dragCurrent.x - dragStart.x;
        const dy = dragCurrent.y - dragStart.y;
        const tx = CANVAS_WIDTH / 2 + dx * 1.5;
        const ty = 420 + dy * 1.5;
        const cappedY = Math.max(GOAL_TOP - 20, Math.min(GOAL_BOTTOM + 20, ty));
        const cappedX = Math.max(GOAL_LEFT - 40, Math.min(GOAL_RIGHT + 40, tx));

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#06b6d4';
        
        ctx.beginPath();
        ctx.arc(cappedX, cappedY, 12, 0, 2 * Math.PI);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw crosshair center dot
        ctx.beginPath();
        ctx.arc(cappedX, cappedY, 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();

        ctx.restore();

        // Draw dynamic drag angle telemetry
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(CANVAS_WIDTH / 2 - 80, 440, 160, 22);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1;
        ctx.strokeRect(CANVAS_WIDTH / 2 - 80, 440, 160, 22);

        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillStyle = '#06b6d4';
        ctx.textAlign = 'center';
        
        const dragAngleDeg = Math.round((cappedX - CANVAS_WIDTH / 2) * 0.15);
        ctx.fillText(`MANUAL VECTOR: ${dragAngleDeg}° | RELEASE TO KICK`, CANVAS_WIDTH / 2, 454);
      }

      // 10. WEBCAM FINGER AIM AND VECTOR HUD (Proper game experience)
      if (fingerActiveRef.current && fingerAimPointRef.current && !isKicking && sim.roundPending) {
        const aim = fingerAimPointRef.current;
        const cappedAimX = Math.max(GOAL_LEFT - 40, Math.min(GOAL_RIGHT + 40, aim.x));
        const cappedAimY = Math.max(GOAL_TOP - 25, Math.min(GOAL_BOTTOM + 25, aim.y));
        
        // Glow effect
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#a3e635'; // Lime green glow
        
        // Draw Targeting Laser/Line from ball (400, 420) to Goal Plane Target
        ctx.beginPath();
        ctx.moveTo(CANVAS_WIDTH / 2, 420);
        ctx.lineTo(cappedAimX, cappedAimY);
        ctx.strokeStyle = 'rgba(163, 230, 53, 0.75)';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw glowing circular target crosshair on the goal
        ctx.beginPath();
        ctx.arc(cappedAimX, cappedAimY, 14, 0, 2 * Math.PI);
        ctx.strokeStyle = '#a3e635';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cappedAimX, cappedAimY, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#a3e635';
        ctx.fill();

        // Target crosshair brackets
        ctx.beginPath();
        ctx.moveTo(cappedAimX - 22, cappedAimY); ctx.lineTo(cappedAimX - 12, cappedAimY);
        ctx.moveTo(cappedAimX + 12, cappedAimY); ctx.lineTo(cappedAimX + 22, cappedAimY);
        ctx.moveTo(cappedAimX, cappedAimY - 22); ctx.lineTo(cappedAimX, cappedAimY - 12);
        ctx.moveTo(cappedAimX, cappedAimY + 12); ctx.lineTo(cappedAimX, cappedAimY + 22);
        ctx.strokeStyle = '#a3e635';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();

        // Draw dynamic telemetry HUD info next to the ball
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(CANVAS_WIDTH / 2 - 80, 440, 160, 22);
        ctx.strokeStyle = '#a3e635';
        ctx.lineWidth = 1;
        ctx.strokeRect(CANVAS_WIDTH / 2 - 80, 440, 160, 22);

        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillStyle = '#a3e635';
        ctx.textAlign = 'center';
        
        const angleDeg = Math.round((cappedAimX - CANVAS_WIDTH / 2) * 0.15);
        ctx.fillText(`AIMING VECTOR: ${angleDeg}° | THUMBS-UP 👍 TO KICK`, CANVAS_WIDTH / 2, 454);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isKicking, isDarkMode, calibration, goalkeeperColor, difficulty, webcamStream, dragStart, dragCurrent]);

  // -------------------------------------------------------------
  // HELPER CANVAS DRAW METHODS
  // -------------------------------------------------------------

  const drawStadiumFloodlights = (ctx: CanvasRenderingContext2D) => {
    // Left floodlight standard
    ctx.fillStyle = '#334155';
    ctx.fillRect(30, 40, 10, 140);
    ctx.beginPath();
    ctx.arc(35, 40, 18, 0, Math.PI, true);
    ctx.fillStyle = '#475569';
    ctx.fill();

    // Glowing flare beams
    const beamGradLeft = ctx.createRadialGradient(35, 40, 2, 35, 120, 140);
    beamGradLeft.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    beamGradLeft.addColorStop(0.3, 'rgba(129, 140, 248, 0.15)');
    beamGradLeft.addColorStop(1, 'rgba(129, 140, 248, 0)');
    ctx.fillStyle = beamGradLeft;
    ctx.beginPath();
    ctx.moveTo(35, 40);
    ctx.lineTo(0, 180);
    ctx.lineTo(120, 180);
    ctx.closePath();
    ctx.fill();

    // Right floodlight standard
    ctx.fillStyle = '#334155';
    ctx.fillRect(760, 40, 10, 140);
    ctx.beginPath();
    ctx.arc(765, 40, 18, 0, Math.PI, true);
    ctx.fillStyle = '#475569';
    ctx.fill();

    const beamGradRight = ctx.createRadialGradient(765, 40, 2, 765, 120, 140);
    beamGradRight.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    beamGradRight.addColorStop(0.3, 'rgba(129, 140, 248, 0.15)');
    beamGradRight.addColorStop(1, 'rgba(129, 140, 248, 0)');
    ctx.fillStyle = beamGradRight;
    ctx.beginPath();
    ctx.moveTo(765, 40);
    ctx.lineTo(800, 180);
    ctx.lineTo(680, 180);
    ctx.closePath();
    ctx.fill();
  };

  const drawStadiumCrowd = (ctx: CanvasRenderingContext2D) => {
    // Background stands blocks
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(60, 110, CANVAS_WIDTH - 120, 70);

    // Colored specks representing screaming fans!
    // We use a pseudo-random checkerboard with time-based flickering flashbulbs!
    const timeSec = Math.floor(Date.now() / 400);
    for (let x = 65; x < CANVAS_WIDTH - 65; x += 6) {
      for (let y = 115; y < 175; y += 7) {
        const seed = (x * 17 + y * 23);
        const flash = (seed % 19 === 0) && (timeSec % 3 === seed % 3);

        if (flash) {
          ctx.fillStyle = '#ffffff'; // Camera flashbulb!
        } else {
          // Mixed team shirt colors: Red, Blue, White, Yellow, Green
          const colorMod = seed % 5;
          ctx.fillStyle = colorMod === 0 ? '#ef4444' : colorMod === 1 ? '#3b82f6' : colorMod === 2 ? '#ffffff' : colorMod === 3 ? '#eab308' : '#10b981';
        }
        ctx.fillRect(x, y, 4, 4);
      }
    }
  };

  const drawGoalNet = (ctx: CanvasRenderingContext2D, wiggle: number, hitX: number, hitY: number) => {
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.28)';
    ctx.lineWidth = 1;

    const rows = 12;
    const cols = 22;

    // Draw grid meshes
    for (let r = 0; r <= rows; r++) {
      const ny = GOAL_TOP + (r / rows) * (GOAL_BOTTOM - GOAL_TOP);
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const nx = GOAL_LEFT + (c / cols) * (GOAL_RIGHT - GOAL_LEFT);

        // Compute elastic ripple displacement based on distance from hit point
        const dist = Math.sqrt(Math.pow(nx - hitX, 2) + Math.pow(ny - hitY, 2));
        const factor = Math.max(0, 150 - dist) / 150;
        const dx = Math.sin(dist * 0.1 - Date.now() * 0.05) * wiggle * factor;
        const dy = Math.cos(dist * 0.1 - Date.now() * 0.05) * wiggle * factor;

        if (c === 0) {
          ctx.moveTo(nx + dx, ny + dy);
        } else {
          ctx.lineTo(nx + dx, ny + dy);
        }
      }
      ctx.stroke();
    }

    for (let c = 0; c <= cols; c++) {
      const nx = GOAL_LEFT + (c / cols) * (GOAL_RIGHT - GOAL_LEFT);
      ctx.beginPath();
      for (let r = 0; r <= rows; r++) {
        const ny = GOAL_TOP + (r / rows) * (GOAL_BOTTOM - GOAL_TOP);

        const dist = Math.sqrt(Math.pow(nx - hitX, 2) + Math.pow(ny - hitY, 2));
        const factor = Math.max(0, 150 - dist) / 150;
        const dx = Math.sin(dist * 0.1 - Date.now() * 0.05) * wiggle * factor;
        const dy = Math.cos(dist * 0.1 - Date.now() * 0.05) * wiggle * factor;

        if (r === 0) {
          ctx.moveTo(nx + dx, ny + dy);
        } else {
          ctx.lineTo(nx + dx, ny + dy);
        }
      }
      ctx.stroke();
    }
  };

  const drawGoalkeeperCharacter = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    shirtColor: string,
    diveType: typeof simRef.current.kDiveType
  ) => {
    ctx.save();
    ctx.translate(x, y);

    // Apply scaling and rotation vectors to stretch character body based on dives
    if (diveType === 'dive-left') {
      ctx.rotate(-Math.PI / 4.5);
      ctx.scale(1.2, 0.8);
    } else if (diveType === 'dive-right') {
      ctx.rotate(Math.PI / 4.5);
      ctx.scale(1.2, 0.8);
    } else if (diveType === 'jump-left') {
      ctx.rotate(-Math.PI / 6);
      ctx.scale(1.1, 0.9);
    } else if (diveType === 'jump-right') {
      ctx.rotate(Math.PI / 6);
      ctx.scale(1.1, 0.9);
    }

    // 1. LEGS & SHOES
    ctx.fillStyle = '#1e293b'; // black socks/boots
    // left leg
    ctx.fillRect(-15, 0, 6, 25);
    // right leg
    ctx.fillRect(9, 0, 6, 25);

    // boots
    ctx.fillStyle = '#eab308'; // neon boots
    ctx.fillRect(-18, 22, 9, 5);
    ctx.fillRect(9, 22, 9, 5);

    // 2. TORSO / JERSEY
    ctx.fillStyle = shirtColor;
    ctx.fillRect(-20, -25, 40, 26); // chest shirt

    // Shirt number/badge details
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('1', -2, -12);

    // 3. ARMS & GLOVES
    ctx.fillStyle = '#f87171'; // skin sleeves
    ctx.strokeStyle = shirtColor;
    ctx.lineWidth = 6;

    if (diveType === 'stand') {
      // Waving goalkeeper hands
      const wave = Math.sin(Date.now() * 0.012) * 12;
      // left arm
      ctx.beginPath();
      ctx.moveTo(-20, -20);
      ctx.lineTo(-42, -35 + wave);
      ctx.stroke();

      // right arm
      ctx.beginPath();
      ctx.moveTo(20, -20);
      ctx.lineTo(42, -35 - wave);
      ctx.stroke();

      // Giant goalie gloves!
      ctx.fillStyle = '#ffffff'; // Neon white gloves
      ctx.beginPath();
      ctx.arc(-42, -35 + wave, 7, 0, 2 * Math.PI);
      ctx.arc(42, -35 - wave, 7, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      // Diving arms extended fully up/wide!
      ctx.beginPath();
      ctx.moveTo(-20, -20);
      ctx.lineTo(-50, -45);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(20, -20);
      ctx.lineTo(50, -45);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-50, -45, 8, 0, 2 * Math.PI);
      ctx.arc(50, -45, 8, 0, 2 * Math.PI);
      ctx.fill();
    }

    // 4. HEAD / CAP
    ctx.fillStyle = '#f87171'; // face skin
    ctx.beginPath();
    ctx.arc(0, -34, 10, 0, 2 * Math.PI);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(-4, -36, 2, 3);
    ctx.fillRect(2, -36, 2, 3);

    // Smile/Focus line
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -32, 3, 0, Math.PI);
    ctx.stroke();

    ctx.restore();
  };

  // -------------------------------------------------------------
  // GAME PHYSICS TRIGGERS & AI STRATEGIES
  // -------------------------------------------------------------

  const triggerKick = (targetX: number, targetY: number, forwardSpeed: number) => {
    if (isKicking || !simRef.current.roundPending) return;

    const sim = simRef.current;
    sim.roundPending = false;
    setIsKicking(true);

    // Initialize physics vectors
    sim.bx = CANVAS_WIDTH / 2;
    sim.by = 420;
    sim.bz = 0;
    
    // Speed maps directly to forward depth progression velocity (z increases)
    sim.vz = forwardSpeed / 420; // depth delta per frame
    
    // Calculate exact vx and vy so that bx = targetX and by = targetY when bz reaches 1.0!
    const N = 1.0 / sim.vz;
    sim.vx = (targetX - sim.bx) / N;
    // Gravity equation: vy = (by_start - targetY) / N + gravity_accel * (N - 1) / 2 (where gravity_accel is 0.15)
    sim.vy = (sim.by - targetY) / N + 0.15 * (N - 1) / 2;
    
    // Add realistic ball spin based on targetX offset
    sim.ballSpin = (targetX - CANVAS_WIDTH / 2) * 0.005;

    soundEffects.playKick(Math.min(1.0, forwardSpeed / 18));
  };

  const triggerGoalkeeperDive = () => {
    const sim = simRef.current;
    sim.kDiving = true;

    // Precise remaining frames to flight interception at goal plane (z = 1.0)
    const N_remaining = (1.0 - sim.bz) / sim.vz;
    const targetX = sim.bx + sim.vx * N_remaining;
    const targetY = sim.by - (sim.vy * N_remaining - 0.15 * N_remaining * (N_remaining - 1) / 2);

    let accuracyRoll = Math.random();
    let predictSuccess = false;

    if (difficulty === 'easy') {
      predictSuccess = accuracyRoll < 0.35; // Easy goalie misses 65% of shots
    } else if (difficulty === 'medium') {
      predictSuccess = accuracyRoll < 0.65; // Medium goalie misses 35%
    } else {
      predictSuccess = accuracyRoll < 0.85; // Pro goalie only misses 15%
    }

    if (predictSuccess) {
      // Dive perfectly towards anticipated flight intercept
      sim.kTargetX = Math.max(GOAL_LEFT - 30, Math.min(GOAL_RIGHT + 30, targetX));
      sim.kTargetY = Math.max(GOAL_TOP - 20, Math.min(GOAL_BOTTOM - 10, targetY));
    } else {
      // Dive to opposite side, stand still, or dive late!
      const wrongWay = Math.random() > 0.5;
      if (wrongWay) {
        sim.kTargetX = targetX > CANVAS_WIDTH / 2 ? GOAL_LEFT + 40 : GOAL_RIGHT - 40;
      } else {
        // stand completely frozen or miss wide!
        sim.kTargetX = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 80;
      }
      sim.kTargetY = GOAL_BOTTOM - 25;
    }

    // Assign rotation styles
    if (sim.kTargetX < CANVAS_WIDTH / 2 - 30) {
      sim.kDiveType = sim.kTargetY < GOAL_BOTTOM - 60 ? 'jump-left' : 'dive-left';
    } else if (sim.kTargetX > CANVAS_WIDTH / 2 + 30) {
      sim.kDiveType = sim.kTargetY < GOAL_BOTTOM - 60 ? 'jump-right' : 'dive-right';
    } else {
      sim.kDiveType = 'stand';
    }
  };

  const resolveShotOutcome = () => {
    const sim = simRef.current;
    setIsKicking(false);

    const bx = sim.bx;
    const by = sim.by;

    // Calculate Goalie gloves boundaries at intercept plane
    const gloveDistance = Math.sqrt(Math.pow(bx - sim.kx, 2) + Math.pow(by - sim.ky, 2));
    
    // Save reach parameters based on difficulty levels
    const catchRadius = difficulty === 'hard' ? 70 : difficulty === 'medium' ? 55 : 42;
    const isSaved = gloveDistance < catchRadius;

    let type: KickResultType = 'goal';
    let message = 'GOAAAL! Sensational finish!';
    const speedKmh = Math.floor(sim.vz * 420 * 5.2);

    // Is it outside goalposts?
    const insideHorizontal = bx >= GOAL_LEFT && bx <= GOAL_RIGHT;
    const insideVertical = by >= GOAL_TOP && by <= GOAL_BOTTOM;

    // Hit the wood check (extremely tight tolerance to goalposts edge)
    const hitPostX = Math.abs(bx - GOAL_LEFT) < 12 || Math.abs(bx - GOAL_RIGHT) < 12;
    const hitBarY = Math.abs(by - GOAL_TOP) < 12;

    if (insideHorizontal && insideVertical) {
      if (isSaved) {
        type = 'saved';
        message = 'SAVED! Spectacular diving stop by the goalkeeper!';
      } else {
        type = 'goal';
        message = 'GOAL! Unstoppable strike right into the net!';
      }
    } else if ((hitPostX && by >= GOAL_TOP && by <= GOAL_BOTTOM + 5) || (hitBarY && bx >= GOAL_LEFT - 5 && bx <= GOAL_RIGHT + 5)) {
      type = 'post';
      message = 'CLANG! Unbelievable, it rattles off the post!';
    } else {
      type = 'missed';
      message = 'OUT! Over the bar into the stadium row!';
    }

    // Trigger audio and state transitions
    applyOutcome(type, message, speedKmh);
  };

  const applyOutcome = (type: KickResultType, msg: string, speedKmh: number) => {
    const sim = simRef.current;
    setAttempts(p => p + 1);
    setCommentary(''); // clear previous commentary

    // Kick off Gemini commentary async — won't block gameplay
    generateCommentary(type as ShotOutcome, score, streak, difficulty)
      .then(line => { if (line) setCommentary(line); })
      .catch(() => {});

    if (type === 'goal') {
      soundEffects.playNetSwish();
      setTimeout(() => {
        soundEffects.playGoalCheer();
      }, 100);

      const multiplier = Math.max(1, Math.floor(streak / 2) + 1);
      const basePoints = difficulty === 'hard' ? 250 : difficulty === 'medium' ? 150 : 100;
      const pointsScored = basePoints * multiplier;

      setScore(p => p + pointsScored);
      setStreak(s => {
        const next = s + 1;
        if (next > maxStreak) setMaxStreak(next);
        return next;
      });

      setMessageType('goal');
      setGameMessage(`⚽ GOAL! +${pointsScored} pts (Multiplier x${multiplier})`);
      sim.netWiggle = 18; // Ripple grid
    } else {
      // Fail scenarios
      if (type === 'post') {
        soundEffects.playPostClang();
        setMessageType('post');
      } else if (type === 'saved') {
        soundEffects.playKick(0.5); // thump
        soundEffects.playMissGroan();
        setMessageType('saved');
      } else {
        soundEffects.playMissGroan();
        setMessageType('missed');
      }

      setStreak(0); // break combo
      setGameMessage(msg);
      sim.netWiggle = 0;
    }

    // Trigger round recovery cooldown
    setTimeout(() => {
      resetRound();
    }, 2800);
  };

  const resetRound = () => {
    const sim = simRef.current;
    sim.bx = CANVAS_WIDTH / 2;
    sim.by = 420;
    sim.bz = 0;
    sim.vx = 0;
    sim.vy = 0;
    sim.vz = 0;
    sim.ballAngle = 0;
    sim.ballSpin = 0;

    sim.kx = CANVAS_WIDTH / 2;
    sim.ky = GOAL_BOTTOM - 25;
    sim.kTargetX = CANVAS_WIDTH / 2;
    sim.kTargetY = GOAL_BOTTOM - 25;
    sim.kDiving = false;
    sim.kDiveType = 'stand';

    setMessageType('info');
    setGameMessage('Raise a Thumbs-Up 👍 to score the next penalty!');
    setCommentary('');
    sim.roundPending = true;

    // Ref Whistle for next shootout
    soundEffects.playWhistle();
  };

  // Fallback Drag Kicking methods with coordinate scaling
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!simRef.current.roundPending) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Only start drag if clicking near ball on penalty spot
    const distToBall = Math.sqrt(Math.pow(x - CANVAS_WIDTH / 2, 2) + Math.pow(y - 420, 2));
    if (distToBall < 55) {
      setDragStart({ x: CANVAS_WIDTH / 2, y: 420 });
      setDragCurrent({ x: CANVAS_WIDTH / 2, y: 420 });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setDragCurrent({ x, y });
  };

  const handleCanvasMouseUp = () => {
    if (!dragStart || !dragCurrent) return;

    // Compute swipe vector direction
    const dx = dragCurrent.x - dragStart.x;
    const dy = dragCurrent.y - dragStart.y;

    setDragStart(null);
    setDragCurrent(null);

    // Apply swipe forces to compute target on goal plane
    if (dy < -20) { // Dragged upwards
      const targetX = Math.max(120, Math.min(680, (CANVAS_WIDTH / 2) + dx * 1.5));
      const targetY = Math.max(80, Math.min(420, 420 + dy * 1.3));

      triggerKick(targetX, targetY, 15);
    }
  };

  // Touch handlers for touchscreen and mobile "drag with hand"
  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!simRef.current.roundPending) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (e.touches.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    const distToBall = Math.sqrt(Math.pow(x - CANVAS_WIDTH / 2, 2) + Math.pow(y - 420, 2));
    if (distToBall < 55) {
      setDragStart({ x: CANVAS_WIDTH / 2, y: 420 });
      setDragCurrent({ x: CANVAS_WIDTH / 2, y: 420 });
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (e.touches.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    setDragCurrent({ x, y });
  };

  const handleCanvasTouchEnd = () => {
    handleCanvasMouseUp();
  };

  const handleEndGame = () => {
    onGameOver(score, maxStreak);
  };

  return (
    <div className="w-full flex flex-col items-center">
      
      {/* Game Header scoreboards */}
      <div className="w-full max-w-4xl flex items-center justify-between gap-2 mb-2 sm:mb-5 px-3 py-2.5 sm:p-5 rounded-xl sm:rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl">
        
        {/* Left: Score + Attempts + Streak */}
        <div className="flex items-center gap-2 sm:gap-6 min-w-0">
          <div>
            <div className="text-[8px] sm:text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Score</div>
            <div className="text-xl sm:text-3xl font-black text-lime-400 font-mono leading-none mt-0.5">{score}</div>
          </div>
          <div className="h-6 w-px bg-white/10 hidden sm:block" />
          <div>
            <div className="text-[8px] sm:text-[9px] text-zinc-500 font-bold uppercase tracking-widest hidden sm:block">Penalty Kicks</div>
            <div className="text-sm sm:text-lg font-black font-mono text-white leading-none mt-0.5 sm:mt-1">
              {attempts}<span className="text-[9px] sm:text-[10px] text-zinc-500 uppercase font-bold tracking-wider ml-1">kicks</span>
            </div>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 bg-lime-400/10 border border-lime-400/30 text-lime-400 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest animate-pulse">
              <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current text-orange-500" />
              <span className="hidden sm:inline">STREAK: </span>{streak}X
            </div>
          )}
        </div>

        {/* Right: Sound Controls & Game Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            onClick={() => setMuted(!muted)}
            className={`p-2 sm:p-2.5 rounded-full border transition-all cursor-pointer ${
              muted 
                ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                : 'bg-zinc-850 hover:bg-zinc-800 border-white/10 text-white/80 hover:text-white'
            }`}
            title={muted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => {
              if (confirm('Abandon current match and return to Lobby?')) {
                onHome();
              }
            }}
            className="p-2 sm:p-2.5 bg-zinc-850 hover:bg-zinc-800 border border-white/10 text-white/80 hover:text-white rounded-full transition-all cursor-pointer"
            title="Lobby Exit"
          >
            <Home className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleEndGame}
            className="px-3 sm:px-6 py-2 sm:py-2.5 bg-lime-400 hover:bg-lime-300 text-black text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-full shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all cursor-pointer"
          >
            <span className="hidden sm:inline">Finish Match</span>
            <span className="sm:hidden">End</span>
          </button>
        </div>
      </div>

      {/* Main Stadium interactive panel */}
      <div className="relative w-full max-w-4xl bg-zinc-950 rounded-3xl overflow-hidden shadow-2xl border border-white/10 aspect-[8/5]">
        
        {/* Silent hidden video feed to power computer vision background tracking */}
        {webcamStream && (
          <video
            autoPlay
            playsInline
            muted
            ref={el => {
              hiddenVideoRef.current = el;
              if (el) {
                cvInstance.setVideoElement(el);
                if (webcamStream && el.srcObject !== webcamStream) {
                  el.srcObject = webcamStream;
                  el.play().catch(err => console.warn('Hidden video auto-play failed:', err));
                }
              }
            }}
            className="hidden"
          />
        )}

        {/* Visual PIP camera feed so users know their fingers are center aligned! */}
        {webcamStream && (
          <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-xl sm:rounded-2xl overflow-hidden p-1 w-24 sm:w-32 md:w-44 shadow-2xl z-10">
            <div className="relative aspect-[4/3] w-full bg-black rounded-xl overflow-hidden">
              {/* Stable PIP Video */}
              <video
                playsInline
                muted
                autoPlay
                ref={el => {
                  pipVideoRef.current = el;
                  if (el && webcamStream && el.srcObject !== webcamStream) {
                    el.srcObject = webcamStream;
                    el.play().catch(err => console.warn('PIP video auto-play failed:', err));
                  }
                }}
                className="w-full h-full object-cover scale-x-[-1]"
              />
              
              {/* Direct-DOM Status Dot (high performance, no re-renders!) */}
              <div 
                ref={pipStatusDotRef}
                className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-zinc-600" 
              />
              
              {/* Instructions banner */}
              <div className="absolute bottom-2 right-2 bg-black/85 px-2 py-0.5 rounded text-[8px] font-mono text-lime-400 uppercase tracking-wider font-bold">
                WEBCAM AIM PIP
              </div>
            </div>
            
            {/* Direct-DOM Pixel count status (high performance, no re-renders!) */}
            <div className="flex justify-between items-center text-[8px] font-mono uppercase font-bold text-zinc-400 px-1.5 mt-1.5">
              <span>SENSITIVITY</span>
              <span ref={pipMotionSpanRef} className="text-lime-400 font-bold font-mono">0 PX</span>
            </div>
          </div>
        )}

        {/* Canvas Simulation */}
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={handleCanvasTouchEnd}
          className="w-full h-full object-cover select-none cursor-crosshair"
        />

        {/* Performance HUD (latency, fps) overlay from Design HTML */}
        <div className="absolute top-2 sm:top-6 left-2 sm:left-6 flex gap-1.5 sm:gap-3 pointer-events-none select-none flex-wrap max-w-[calc(100%-56px)] sm:max-w-none">
          <div className="hidden sm:flex bg-black/70 backdrop-blur px-4 py-1.5 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70">
            LATENCY: <span className="text-lime-400 font-mono ml-1">14MS</span>
          </div>
          <div className="hidden sm:flex bg-black/70 backdrop-blur px-4 py-1.5 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70">
            FPS: <span className="text-lime-400 font-mono ml-1">60</span>
          </div>
          <div className="bg-black/70 backdrop-blur px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-white/10 text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/70">
            LVL: <span className="text-lime-400 font-mono uppercase">{difficulty}</span>
          </div>
          {webcamStream && (
            <div className="bg-black/70 backdrop-blur px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-lime-400/30 text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-lime-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
              <span className="hidden sm:inline">WEBCAM TRACKING: ACTIVE</span>
              <span className="sm:hidden">CAM ✓</span>
            </div>
          )}
        </div>

        {/* HIGH CONTRAST ANNOUNCEMENT HUD OVERLAYS (Design HTML Goals) */}
        {messageType === 'goal' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none bg-lime-400/5 backdrop-blur-xs">
            <div className="text-[52px] sm:text-[90px] md:text-[120px] lg:text-[150px] font-black italic leading-none text-white uppercase tracking-tighter drop-shadow-[0_15px_40px_rgba(163,230,53,0.5)] animate-pulse">
              GOAL!
            </div>
            <div className="mt-[-8px] sm:mt-[-15px] bg-white text-black px-3 sm:px-5 py-0.5 sm:py-1 text-[9px] sm:text-xs font-black uppercase tracking-widest">
              COMBO x{streak}
            </div>
            {commentary && (
              <div className="mt-3 sm:mt-4 flex items-center gap-2 bg-black/70 border border-lime-400/30 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full max-w-[90%] sm:max-w-sm text-center">
                <span className="text-lime-400 text-[10px] shrink-0">✦</span>
                <p className="text-[10px] sm:text-[11px] text-lime-300 font-semibold italic">{commentary}</p>
                <span className="text-[8px] text-lime-400/50 font-mono uppercase tracking-widest ml-1 shrink-0">AI</span>
              </div>
            )}
          </div>
        )}

        {messageType === 'saved' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none bg-red-500/5 backdrop-blur-xs">
            <div className="text-[44px] sm:text-[76px] md:text-[100px] lg:text-[130px] font-black italic leading-none text-red-500 uppercase tracking-tighter drop-shadow-[0_15px_40px_rgba(239,68,68,0.4)]">
              SAVED!
            </div>
            <div className="mt-[-6px] sm:mt-[-10px] bg-black text-white px-3 sm:px-5 py-0.5 sm:py-1 text-[8px] sm:text-[9px] font-black uppercase tracking-widest border border-white/20">
              GOALKEEPER BLOCK
            </div>
            {commentary && (
              <div className="mt-3 sm:mt-4 flex items-center gap-2 bg-black/70 border border-red-400/30 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full max-w-[90%] sm:max-w-sm text-center">
                <span className="text-red-400 text-[10px] shrink-0">✦</span>
                <p className="text-[10px] sm:text-[11px] text-red-300 font-semibold italic">{commentary}</p>
                <span className="text-[8px] text-red-400/50 font-mono uppercase tracking-widest ml-1 shrink-0">AI</span>
              </div>
            )}
          </div>
        )}

        {messageType === 'post' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none bg-orange-500/5 backdrop-blur-xs">
            <div className="text-[44px] sm:text-[76px] md:text-[100px] lg:text-[130px] font-black italic leading-none text-orange-400 uppercase tracking-tighter drop-shadow-[0_15px_40px_rgba(249,115,22,0.4)]">
              POST!
            </div>
            <div className="mt-[-6px] sm:mt-[-10px] bg-black text-white px-3 sm:px-5 py-0.5 sm:py-1 text-[8px] sm:text-[9px] font-black uppercase tracking-widest border border-white/20">
              WOODWORK RATTLE
            </div>
            {commentary && (
              <div className="mt-3 sm:mt-4 flex items-center gap-2 bg-black/70 border border-orange-400/30 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full max-w-[90%] sm:max-w-sm text-center">
                <span className="text-orange-400 text-[10px] shrink-0">✦</span>
                <p className="text-[10px] sm:text-[11px] text-orange-300 font-semibold italic">{commentary}</p>
                <span className="text-[8px] text-orange-400/50 font-mono uppercase tracking-widest ml-1 shrink-0">AI</span>
              </div>
            )}
          </div>
        )}

        {messageType === 'missed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none bg-black/40">
            <div className="text-[44px] sm:text-[76px] md:text-[100px] lg:text-[130px] font-black italic leading-none text-zinc-500 uppercase tracking-tighter drop-shadow-[0_15px_40px_rgba(255,255,255,0.1)]">
              MISSED!
            </div>
            <div className="mt-[-6px] sm:mt-[-10px] bg-black text-white px-3 sm:px-5 py-0.5 sm:py-1 text-[8px] sm:text-[9px] font-black uppercase tracking-widest border border-white/20">
              OFF TARGET WIDE
            </div>
            {commentary && (
              <div className="mt-3 sm:mt-4 flex items-center gap-2 bg-black/70 border border-white/20 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full max-w-[90%] sm:max-w-sm text-center">
                <span className="text-zinc-400 text-[10px] shrink-0">✦</span>
                <p className="text-[10px] sm:text-[11px] text-zinc-300 font-semibold italic">{commentary}</p>
                <span className="text-[8px] text-zinc-400/50 font-mono uppercase tracking-widest ml-1 shrink-0">AI</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom prompt instructions panel */}
        {messageType === 'info' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-900/95 border border-white/10 px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 pointer-events-none max-w-sm w-11/12 text-center justify-center">
            <Zap className="w-3.5 h-3.5 text-lime-400 animate-bounce fill-current shrink-0" />
            <p className="text-[9px] text-white font-black uppercase tracking-widest">{gameMessage}</p>
          </div>
        )}

        {/* WEBCAM INITIALIZING / WARMUP LOADER */}
        {webcamStream && !isTrackingReady && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-md text-center p-6">
            <div className="relative flex items-center justify-center mb-6">
              {/* Outer pulsing ring */}
              <div className="absolute w-24 h-24 border-4 border-lime-400/20 rounded-full animate-ping duration-1000" />
              {/* Inner spinning loader */}
              <div className="w-16 h-16 border-t-4 border-r-4 border-lime-400 rounded-full animate-spin shadow-[0_0_15px_rgba(163,230,53,0.4)]" />
              <Camera className="absolute w-6 h-6 text-lime-400 animate-pulse" />
            </div>
            
            <span className="bg-lime-400/10 text-lime-400 border border-lime-400/20 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-3 animate-pulse">
              GOAL AI TRACKING SYSTEM
            </span>
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-white mb-2">
              INITIALIZING GESTURE ENGINE
            </h3>
            <p className="text-[10px] text-zinc-400 max-w-sm uppercase tracking-wider font-bold leading-relaxed">
              Warming up tracking algorithms to prevent in-game lag. Please stand in front of your camera!
            </p>
          </div>
        )}
      </div>

      {/* Touch disclaimer */}
      <p className="text-[8px] sm:text-[9px] text-zinc-500 mt-2 sm:mt-3 text-center max-w-md font-bold uppercase tracking-wider leading-relaxed px-4">
        💡 WEBCAM OPTIONAL • DRAG THE BALL TO KICK OR USE HAND GESTURES IN FRONT OF THE CAMERA.
      </p>
    </div>
  );
}
