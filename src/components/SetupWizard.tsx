/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, Sliders, CheckCircle, Flame, ArrowRight, UserCheck, Accessibility, Sparkles } from 'lucide-react';
import { CalibrationData, Difficulty } from '../types';
import { cvInstance, TrackingFrameResult } from '../utils/cvEngine';
import { soundEffects } from '../utils/audio';

interface SetupWizardProps {
  onComplete: (calibration: CalibrationData, difficulty: Difficulty, goalkeeperColor: string) => void;
  initialCalibration: CalibrationData;
  isDarkMode: boolean;
}

export default function SetupWizard({ onComplete, initialCalibration }: SetupWizardProps) {
  const [step, setStep] = useState<'welcome' | 'calibrate' | 'settings'>('welcome');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camError, setCamError] = useState<string>('');
  const [isInitializingCam, setIsInitializingCam] = useState(false);
  
  // Calibration Options
  const [calibration, setCalibration] = useState<CalibrationData>(initialCalibration);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [keeperColor, setKeeperColor] = useState<string>('#ef4444'); // Red standard
  
  // Real-time tracking preview variables
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentMotionCount, setCurrentMotionCount] = useState(0);
  const [practiceKick, setPracticeKick] = useState<{ speed: number; direction: string } | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(false);

  // Animation Loop reference
  const animationFrameRef = useRef<number | null>(null);

  // Attempt to open the camera stream
  const enableCamera = async () => {
    setIsInitializingCam(true);
    setCamError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });
      setStream(mediaStream);
      setStep('calibrate');
      soundEffects.playWhistle();
    } catch (err: any) {
      console.error('Error starting camera:', err);
      setCamError(
         'Unable to initialize webcam feed. Ensure permissions are allowed or connect an external device. Touch / Mouse dragging will act as a secondary fallback controls in-game.'
      );
    } finally {
      setIsInitializingCam(false);
    }
  };

  // Close camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [stream]);

  // Hook up video and start processing loop when we reach calibration step
  useEffect(() => {
    if (step === 'calibrate' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.warn('Video play interrupted', e));
      cvInstance.setVideoElement(videoRef.current);
      cvInstance.reset();

      // Start rendering calibration visuals on overlaid canvas
      const processLoop = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && stream) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Process the frame inside the CV engine
            const cvResult: TrackingFrameResult | null = cvInstance.processFrame(calibration);

            if (cvResult) {
              setCurrentMotionCount(cvResult.motionCount);

              // 1. Clear and draw the mirrored camera frame as background
              ctx.save();
              if (!calibration.invertX) {
                // Mirror the frame horizontally to feel natural
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
              }
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              ctx.restore();

              // 2. Overlay a cool digital motion grid covering the entire camera frame
              const zx = 0;
              const zy = 0;
              const zw = canvas.width;
              const zh = canvas.height;

              // Draw Glowing Trackpad Frame
              ctx.strokeStyle = '#a3e635'; // Lime-400
              ctx.lineWidth = 2.5;
              ctx.setLineDash([8, 6]);
              ctx.strokeRect(zx + 4, zy + 4, zw - 8, zh - 8);
              ctx.setLineDash([]);

              // Corner brackets
              ctx.strokeStyle = '#a3e635';
              ctx.lineWidth = 4;
              // top-left corner
              ctx.beginPath(); ctx.moveTo(zx + 2, zy + 18); ctx.lineTo(zx + 2, zy + 2); ctx.lineTo(zx + 18, zy + 2); ctx.stroke();
              // top-right corner
              ctx.beginPath(); ctx.moveTo(zx + zw - 2, zy + 18); ctx.lineTo(zx + zw - 2, zy + 2); ctx.lineTo(zx + zw - 18, zy + 2); ctx.stroke();
              // bottom-left corner
              ctx.beginPath(); ctx.moveTo(zx + 2, zy + zh - 18); ctx.lineTo(zx + 2, zy + zh - 2); ctx.lineTo(zx + 18, zy + zh - 2); ctx.stroke();
              // bottom-right corner
              ctx.beginPath(); ctx.moveTo(zx + zw - 2, zy + zh - 18); ctx.lineTo(zx + zw - 2, zy + zh - 2); ctx.lineTo(zx + zw - 18, zy + zh - 2); ctx.stroke();

              // Draw Glowing Text Label over zone
              ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
              ctx.fillRect(zx + 8, zy + 8, 160, 20);
              ctx.font = 'black 9px "JetBrains Mono", monospace';
              ctx.fillStyle = '#a3e635';
              ctx.fillText('FULL CAM INTERACTIVE ZONE', zx + 14, zy + 21);

              // 3. Draw visual glowing motion pixels over canvas inside the trackpad (using an optimized stride of 4 to prevent lag)
              const map = cvResult.motionMap;
              if (map) {
                ctx.fillStyle = 'rgba(163, 230, 53, 0.55)'; // lime-400
                const stride = 4;
                for (let y = 0; y < zh; y += stride) {
                  for (let x = 0; x < zw; x += stride) {
                    if (map[y * canvas.width + x] > 0) {
                      ctx.fillRect(x, y, stride, stride);
                    }
                  }
                }
              }

              // 4. Draw Center of Motion crosshair if currently tracking
              if (cvResult.motionCount > 50) {
                ctx.beginPath();
                ctx.arc(cvResult.centerX, cvResult.centerY, 6, 0, 2 * Math.PI);
                ctx.fillStyle = '#a3e635';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
              }

              // 5. Handle and display Test Flick Detection
              if (cvResult.flickDetected && cvResult.flickVector) {
                const vector = cvResult.flickVector;
                const adjustedDx = (calibration.invertX ? 1 : -1) * vector.dx;
                const dirLabel = adjustedDx < -0.3 ? 'Left ⬅️' : adjustedDx > 0.3 ? 'Right ➡️' : 'Center ⬆️';
                const speedKmh = Math.min(130, Math.floor(vector.speed * 8500));
                
                soundEffects.playKick(0.7);
                setPracticeKick({
                  speed: speedKmh,
                  direction: dirLabel,
                });
                setIsCalibrated(true);
              }
            }
          }
        }
        animationFrameRef.current = requestAnimationFrame(processLoop);
      };

      animationFrameRef.current = requestAnimationFrame(processLoop);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [step, calibration, stream]);

  // Adjust specific calibration properties
  const updateCalibration = (field: keyof CalibrationData, value: any) => {
    setCalibration(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleStartGame = () => {
    onComplete(calibration, difficulty, keeperColor);
  };

  // Adjust setup trackpad box dimensions
  const resizeZone = (direction: 'up' | 'down' | 'grow' | 'shrink') => {
    setCalibration(prev => {
      const rect = { ...prev.activeZoneRect };
      if (direction === 'up' && rect.y > 5) rect.y -= 5;
      if (direction === 'down' && rect.y < 70) rect.y += 5;
      if (direction === 'grow' && rect.w < 80) {
        rect.w += 5; rect.h += 5;
        rect.x = Math.max(0, 50 - rect.w / 2);
      }
      if (direction === 'shrink' && rect.w > 20) {
        rect.w -= 5; rect.h -= 5;
        rect.x = Math.max(0, 50 - rect.w / 2);
      }
      return { ...prev, activeZoneRect: rect };
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-950 text-white">
      
      {/* Visual Header Banner */}
      <div className="bg-zinc-900 border-b border-white/10 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="bg-lime-400/10 text-lime-400 border border-lime-400/20 px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest uppercase">
            GOAL AI CALIBRATION CORE
          </span>
          <h2 className="text-xl font-black italic uppercase tracking-tighter text-white mt-1.5">ARENA ENTRY PROTOCOLS</h2>
        </div>

        {/* Wizard Step Markers */}
        <div className="flex items-center gap-2">
          {(['welcome', 'calibrate', 'settings'] as const).map((s, index) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                step === s 
                  ? 'bg-lime-400 text-black shadow-[0_0_15px_rgba(163,230,53,0.5)]' 
                  : index < ['welcome', 'calibrate', 'settings'].indexOf(step)
                    ? 'bg-zinc-800 text-lime-400 border border-lime-400/20'
                    : 'bg-zinc-900 text-zinc-600 border border-white/5'
              }`}>
                {(index + 1).toString().padStart(2, '0')}
              </div>
              {index < 2 && <div className={`w-4 h-0.5 ${
                index < ['welcome', 'calibrate', 'settings'].indexOf(step) ? 'bg-lime-400' : 'bg-zinc-800'
              }`} />}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: WELCOME SCREEN */}
      {step === 'welcome' && (
        <div className="p-8 sm:p-12 text-center">
          <div className="mx-auto w-20 h-20 bg-lime-400 rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(163,230,53,0.3)] mb-6">
            <Accessibility className="w-10 h-10 text-black" />
          </div>
          
          <h2 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter mb-4">HOW TO PLAY</h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto mb-8 uppercase tracking-wider leading-relaxed font-bold">
            Raise your hand in front of your camera. Move your hand to aim, and make a quick Thumbs-Up 👍 gesture to shoot penalty kicks!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-10 text-left">
            <div className="p-5 rounded-2xl bg-zinc-900 border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-xl">🙌</span>
                <h4 className="text-[10px] font-black text-lime-400 uppercase tracking-widest mt-2 mb-1">Hand Tracking</h4>
                <p className="text-xs text-zinc-400">Position your hand comfortably 1-3 feet in front of your camera lens.</p>
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-zinc-900 border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-xl">👍</span>
                <h4 className="text-[10px] font-black text-lime-400 uppercase tracking-widest mt-2 mb-1">Gesture Shoot</h4>
                <p className="text-xs text-zinc-400">Make a Thumbs-Up 👍 to trigger rapid kicks instantly.</p>
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-zinc-900 border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-xl">⚡</span>
                <h4 className="text-[10px] font-black text-lime-400 uppercase tracking-widest mt-2 mb-1">Accuracy Vectors</h4>
                <p className="text-xs text-zinc-400">Your hand position dynamically steers the shot target across the net.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={enableCamera}
              disabled={isInitializingCam}
              className="px-8 py-3.5 bg-lime-400 hover:bg-lime-300 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-black text-xs uppercase tracking-widest rounded-full transition-all shadow-[0_0_20px_rgba(163,230,53,0.3)] cursor-pointer"
            >
              {isInitializingCam ? 'ACTIVATING CAMERA...' : 'CONNECT WEBCAM & START'}
            </button>
            <button
              onClick={() => setStep('settings')}
              className="px-6 py-3.5 bg-transparent hover:bg-zinc-900 text-white/70 hover:text-white font-black text-xs uppercase tracking-widest rounded-full border border-white/10 transition-all cursor-pointer"
            >
              Skip to Mouse/Touch Controls
            </button>
          </div>

          {camError && (
            <div className="mt-6 p-4 border border-red-500/20 bg-red-500/10 text-red-400 rounded-xl max-w-lg mx-auto text-xs uppercase tracking-wider font-bold">
              {camError}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: CALIBRATION INTERACTIVE */}
      {step === 'calibrate' && (
        <div className="p-6 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left side: Live Feed Canvas overlay */}
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="bg-zinc-900 border border-white/5 rounded-2xl p-5 flex flex-col w-full">
                <h3 className="text-[10px] font-black text-lime-400 uppercase tracking-widest mb-4">Vision Calibration</h3>
                
                <div className="relative w-full aspect-video bg-black rounded-lg border border-white/10 flex items-center justify-center overflow-hidden">
                  <video
                    ref={el => {
                      videoRef.current = el;
                      if (el) {
                        cvInstance.setVideoElement(el);
                      }
                    }}
                    className="hidden"
                    playsInline
                    muted
                  />
                  <canvas
                    ref={canvasRef}
                    width={320}
                    height={240}
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  
                  {/* Digital scanning laser overlay bar */}
                  <div className="absolute inset-x-0 bg-gradient-to-b from-transparent via-lime-400/25 to-transparent h-1/3 pointer-events-none animate-pulse" />

                  {currentMotionCount === 0 && (
                    <div className="absolute bg-zinc-950/90 px-4 py-2 rounded-full border border-white/10 text-[9px] text-lime-400 font-mono tracking-widest uppercase font-black animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin" /> WAITING FOR VIDEO STREAM
                    </div>
                  )}
                </div>
              </div>

              {/* Box positioning controls */}
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => resizeZone('up')}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[9px] font-black uppercase tracking-widest rounded border border-white/10 cursor-pointer"
                >
                  ▲ UP
                </button>
                <button
                  onClick={() => resizeZone('down')}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[9px] font-black uppercase tracking-widest rounded border border-white/10 cursor-pointer"
                >
                  ▼ DOWN
                </button>
                <button
                  onClick={() => resizeZone('grow')}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[9px] font-black uppercase tracking-widest rounded border border-white/10 cursor-pointer"
                >
                  ＋ GROW
                </button>
                <button
                  onClick={() => resizeZone('shrink')}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[9px] font-black uppercase tracking-widest rounded border border-white/10 cursor-pointer"
                >
                  － SHRINK
                </button>
              </div>
            </div>

            {/* Right side: Tune Sliders & Feedback */}
            <div className="lg:col-span-5 flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] font-black text-lime-400 uppercase tracking-widest mb-3">
                  CALIBRATION SENSITIVITY
                </h3>
                <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                  Raise your hand in front of your webcam. Move your hand to aim, and make a Thumbs-Up 👍 gesture to trigger test shots.
                </p>

                {/* Sensitivity Slider */}
                <div className="mb-6">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-400">
                    <span>SENSITIVITY LEVEL</span>
                    <span className="text-lime-400 font-mono">{calibration.sensitivity}%</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="90"
                    value={calibration.sensitivity}
                    onChange={e => updateCalibration('sensitivity', parseInt(e.target.value))}
                    className="w-full accent-lime-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                  <div className="flex justify-between text-[8px] text-zinc-600 mt-1.5 font-mono uppercase tracking-wider font-black">
                    <span>Strict (Low)</span>
                    <span>High (Vocal)</span>
                  </div>
                </div>

                {/* Live Motion Activity Meter */}
                <div className="p-4 bg-black/40 border border-white/5 rounded-xl mb-6">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest mb-2 text-zinc-400">
                    <span>PIXEL MOTION INDEX</span>
                    <span className={currentMotionCount > 100 ? 'text-lime-400' : 'text-zinc-600'}>
                      {currentMotionCount} px
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-lime-400 transition-all duration-75"
                      style={{ width: `${Math.min(100, (currentMotionCount / 800) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Test Kick Feedback */}
                {practiceKick ? (
                  <div className="p-4 bg-lime-400/10 border border-lime-400/30 text-lime-400 rounded-xl flex items-center gap-3 animate-bounce">
                    <Flame className="w-6 h-6 text-orange-500 fill-current shrink-0" />
                    <div>
                      <h5 className="font-black text-[10px] uppercase tracking-widest">KICK REGISTERED!</h5>
                      <p className="text-[10px] text-zinc-300 mt-0.5">
                        ANGLE: <span className="font-black text-lime-400">{practiceKick.direction}</span> • POWER:{' '}
                        <span className="font-black text-white">{practiceKick.speed} KM/H</span>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-zinc-900 border border-dashed border-white/10 text-zinc-500 rounded-xl text-center text-[10px] font-black uppercase tracking-widest">
                    <Sparkles className="w-4 h-4 mx-auto mb-2 text-lime-400/40 animate-pulse" />
                    Awaiting calibration gesture...
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-4 mt-8 pt-4 border-t border-white/5">
                <button
                  onClick={() => setStep('welcome')}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-black uppercase tracking-widest rounded-full border border-white/5 cursor-pointer"
                >
                  ◀ BACK
                </button>
                <button
                  onClick={() => setStep('settings')}
                  disabled={!isCalibrated}
                  className="flex-1 px-4 py-2.5 bg-lime-400 hover:bg-lime-300 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border-white/5 text-black text-[10px] font-black uppercase tracking-widest rounded-full transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  CONTINUE <ArrowRight className="w-3.5 h-3.5 text-black" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: GAME PREFERENCES & JERSEY */}
      {step === 'settings' && (
        <div className="p-8 max-w-2xl mx-auto">
          <h3 className="text-[10px] font-black text-lime-400 uppercase tracking-widest mb-6">
            MATCH CUSTOMIZATION
          </h3>

          <div className="space-y-6">
            
            {/* Difficulty Level selector */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-3">
                AI GOALKEEPER DIFFICULTY
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['easy', 'medium', 'hard'] as const).map(diff => (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`p-4 rounded-xl border text-center transition-all cursor-pointer ${
                      difficulty === diff
                        ? 'border-lime-400 bg-lime-400/10 text-lime-400'
                        : 'border-white/5 bg-zinc-900 text-zinc-500 hover:text-white'
                    }`}
                  >
                    <span className="block font-black text-xs uppercase tracking-widest">{diff}</span>
                    <span className="text-[9px] text-zinc-600 block mt-1 font-bold">
                      {diff === 'easy' ? 'SLUGGISH DIVING' : diff === 'medium' ? 'STANDARD AI' : 'ELITE STRIKER CHALLENGE'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Goalkeeper Shirt Color */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-3">
                GOALKEEPER JERSEY COLOR
              </label>
              <div className="flex flex-wrap gap-4">
                {[
                  { label: 'SUNSET ORANGE', color: '#f97316' },
                  { label: 'NEON YELLOW', color: '#eab308' },
                  { label: 'HYPER PINK', color: '#ec4899' },
                  { label: 'SKY BLUE', color: '#06b6d4' },
                  { label: 'FOREST GREEN', color: '#10b981' },
                ].map(item => (
                  <button
                    key={item.color}
                    onClick={() => setKeeperColor(item.color)}
                    className={`w-9 h-9 rounded-full border-4 transition-transform flex items-center justify-center cursor-pointer ${
                      keeperColor === item.color ? 'border-white scale-110' : 'border-zinc-950 scale-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: item.color }}
                    title={item.label}
                  >
                    {keeperColor === item.color && (
                      <span className="text-white text-xs font-bold font-sans">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Accessibility Disclaimer */}
            <div className="p-4 bg-zinc-900 border border-white/5 rounded-xl flex items-start gap-3 text-xs text-zinc-400 leading-relaxed uppercase font-bold tracking-wider text-[9px]">
              <span className="text-base">♿</span>
              <div>
                <strong className="text-lime-400 block font-black mb-0.5">MOUSE/TOUCH CONTROLS DETECTED</strong>
                Webcam is optional. Click-and-drag directly on the soccer ball at the spot to aim and shoot in real-time.
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-10 pt-6 border-t border-white/5">
            <button
              onClick={() => {
                if (stream) setStep('calibrate');
                else setStep('welcome');
              }}
              className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-black uppercase tracking-widest rounded-full transition-colors cursor-pointer"
            >
              ◀ ADJUST CAMERA
            </button>
            <button
              onClick={handleStartGame}
              className="flex-1 px-4 py-3 bg-lime-400 hover:bg-lime-300 text-black text-[10px] font-black uppercase tracking-widest rounded-full transition-all shadow-[0_0_20px_rgba(163,230,53,0.35)] cursor-pointer"
            >
              ENTER ARENA ⚡
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
