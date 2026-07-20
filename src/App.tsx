/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Trophy, ShieldAlert, Sparkles, Zap, Sun, Moon, Volume2, VolumeX, Flame, Medal, Github, Play, ArrowRight, UserCheck } from 'lucide-react';
import { CalibrationData, Difficulty } from './types';
import { soundEffects } from './utils/audio';

// Subcomponents
import SetupWizard from './components/SetupWizard';
import GameArena from './components/GameArena';
import Leaderboard from './components/Leaderboard';
import SocialShare from './components/SocialShare';

const DEFAULT_CALIBRATION: CalibrationData = {
  sensitivity: 45, // mid point sensitivity
  invertX: false,
  activeZoneRect: {
    x: 25, // Centered horizontally
    y: 50, // Bottom half trackpad position
    w: 50,
    h: 45,
  },
};

export default function App() {
  const [phase, setPhase] = useState<'welcome' | 'setup' | 'playing' | 'summary'>('playing');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [muted, setMuted] = useState(false);

  // Calibration and Settings
  const [calibration, setCalibration] = useState<CalibrationData>(DEFAULT_CALIBRATION);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [goalkeeperColor, setGoalkeeperColor] = useState<string>('#ef4444');
  
  // Shared Active Webcam Stream
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);

  // Match Summary Data
  const [matchResult, setMatchResult] = useState<{ score: number; maxStreak: number } | null>(null);

  // Automatically request webcam permission on load for direct arena entry
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
      .then(stream => {
        setWebcamStream(stream);
      })
      .catch(err => {
        console.warn('Webcam permission skipped or denied, loading with touch/mouse controls', err);
      });
  }, []);

  // Sound effects controller
  useEffect(() => {
    soundEffects.setMute(muted);
  }, [muted]);

  // Clean up webcam streams on exit
  const stopWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    }
  };

  const handleStartSetup = () => {
    setPhase('playing');
    setMatchResult(null);
    soundEffects.playWhistle();
  };

  const handleSetupComplete = (
    calib: CalibrationData,
    diff: Difficulty,
    keeperColor: string
  ) => {
    setCalibration(calib);
    setDifficulty(diff);
    setGoalkeeperColor(keeperColor);
    setPhase('playing');
    soundEffects.playWhistle();
  };

  const handleGameOver = (finalScore: number, finalStreak: number) => {
    setMatchResult({ score: finalScore, maxStreak: finalStreak });
    setPhase('summary');
    soundEffects.playWhistle();
  };

  const handleReturnHome = () => {
    setPhase('playing');
    setMatchResult(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col justify-between selection:bg-lime-400 selection:text-black">
      
      {/* HEADER NAVIGATION */}
      <header className="relative flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 bg-zinc-950 sticky top-0 z-40">
        {/* Left Side (Empty to maintain centered layout) */}
        <div className="w-8 sm:w-10"></div>
        
        {/* Centered Game Name */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <span className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter block leading-none">GOAL AI</span>
          <span className="text-[8px] sm:text-[9px] text-lime-400 font-mono tracking-widest uppercase font-bold">WEBCAM GESTURE EDITION</span>
        </div>
        
        {/* Right Side: Sound Icon Only */}
        <div className="flex items-center">
          <button
            onClick={() => setMuted(!muted)}
            className="p-1.5 sm:p-2 border border-white/10 rounded-lg bg-zinc-900 text-white/70 hover:text-white hover:border-lime-400/50 transition-all cursor-pointer"
            title={muted ? 'Unmute game' : 'Mute game'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* CORE CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 py-3 sm:px-4 sm:py-4 md:px-6 md:py-8">
        
        {/* PHASE A: WELCOME LOBBY SCREEN */}
        {phase === 'welcome' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT COLUMN: HERO PANEL & GAME INTRO */}
            <div className="lg:col-span-7 space-y-8 py-4">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-lime-400/10 border border-lime-400/30 text-lime-400 rounded-full text-[9px] font-black tracking-widest uppercase animate-pulse">
                  <Sparkles className="w-3 h-3" /> COMPUTER VISION PENALTY SIMULATOR
                </span>
                
                <h2 className="text-5xl sm:text-7xl font-black italic uppercase tracking-tighter leading-none">
                  SCORE <span className="text-lime-400">WORLD-CLASS</span> WEBCAM KICKS
                </h2>
                
                <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                  Step onto the penalty spot. Power striker mechanics directly in your browser using real-time hand gesture tracking. Connect your camera, position your hand inside the camera view, and make a thumbs-up gesture to kick spectacular goals past the goalkeeper.
                </p>
              </div>

              {/* Enter Stadium CTA button */}
              <div>
                <button
                  onClick={handleStartSetup}
                  className="px-10 py-5 bg-lime-400 hover:bg-lime-300 text-black font-black text-xs uppercase tracking-widest rounded-full transition-all shadow-[0_0_30px_rgba(163,230,53,0.35)] hover:shadow-[0_0_40px_rgba(163,230,53,0.5)] flex items-center gap-3 group active:scale-95 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current text-black" /> CONNECT CAMERA & CALIBRATE
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 text-black" />
                </button>
              </div>

              {/* Instructions Panel */}
              <div className="bg-zinc-900 border border-white/5 rounded-2xl p-6 space-y-4">
                <h3 className="text-[10px] font-black text-lime-400 uppercase tracking-widest">Webcam Striking System</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="flex gap-3">
                    <span className="text-xl">✋</span>
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-white mb-0.5">Hand Sight</h4>
                      <p className="text-xs text-zinc-400">Position your hand inside the camera viewbox to aim.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-xl">⚡</span>
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-white mb-0.5">High-Speed Motion</h4>
                      <p className="text-xs text-zinc-400">Flick or move your hand rapidly to trigger high-velocity shot power.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-xl">🎯</span>
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-white mb-0.5">Dynamic Accuracy</h4>
                      <p className="text-xs text-zinc-400">The ball vectors strictly align with your physical movement angles.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-xl">🔊</span>
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-white mb-0.5">Stadium Synth</h4>
                      <p className="text-xs text-zinc-400">Enjoy procedural sound synthesis for crowd buzz, whistling, and post thuds.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: LEADERBOARDS */}
            <div className="lg:col-span-5">
              <Leaderboard currentDifficulty="medium" />
            </div>
          </div>
        )}

        {/* PHASE B: CALIBRATION SETUP PROCESS */}
        {phase === 'setup' && (
          <SetupWizard
            onComplete={handleSetupComplete}
            initialCalibration={calibration}
            isDarkMode={true}
          />
        )}

        {/* PHASE C: ACTIVE IN-GAME ARENA */}
        {phase === 'playing' && (
          <GameArena
            calibration={calibration}
            difficulty={difficulty}
            goalkeeperColor={goalkeeperColor}
            isDarkMode={true}
            onGameOver={handleGameOver}
            onHome={handleReturnHome}
            webcamStream={webcamStream}
          />
        )}

        {/* PHASE D: GAME COMPLETED / RESULTS SUMMARY */}
        {phase === 'summary' && matchResult && (
          <div className="max-w-4xl mx-auto space-y-8 py-4">
            <div className="text-center space-y-3">
              <div className="inline-block p-4 bg-lime-400/10 border border-lime-400/30 rounded-full text-lime-400 animate-bounce">
                <Trophy className="w-8 h-8 text-lime-400" />
              </div>
              <h2 className="text-4xl sm:text-6xl font-black italic uppercase tracking-tighter mt-4">FULL TIME RESULTS</h2>
              <p className="text-[10px] text-lime-400 font-mono font-black tracking-widest uppercase">MATCH RATING: LEGENDARY SELECTION</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              
              {/* Left Side: Score Board details */}
              <div className="md:col-span-7 space-y-6">
                
                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-4 p-6 bg-zinc-900 border border-white/5 rounded-2xl">
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Total Score</span>
                    <div className="text-4xl font-black font-mono text-lime-400">{matchResult.score} PTS</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Max Streak</span>
                    <div className="text-4xl font-black font-mono text-white flex items-center gap-1.5">
                      <Flame className="w-7 h-7 text-orange-500 fill-current" /> {matchResult.maxStreak}
                    </div>
                  </div>
                </div>

                {/* Social sharing card */}
                <div className="bg-zinc-900 border border-white/5 rounded-2xl p-6">
                  <SocialShare
                    score={matchResult.score}
                    streak={matchResult.maxStreak}
                    difficulty={difficulty}
                    jerseyColor={goalkeeperColor}
                  />
                </div>

                {/* Return/Rematch CTA */}
                <div className="flex gap-4">
                  <button
                    onClick={handleReturnHome}
                    className="flex-1 px-5 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-black uppercase tracking-widest rounded-full transition-all cursor-pointer"
                  >
                    ◀ Back to Lobby
                  </button>
                  <button
                    onClick={handleStartSetup}
                    className="flex-1 px-5 py-3.5 bg-lime-400 hover:bg-lime-300 text-black text-xs font-black uppercase tracking-widest rounded-full transition-all shadow-[0_0_15px_rgba(163,230,53,0.3)] cursor-pointer"
                  >
                    Play Rematch ⚡
                  </button>
                </div>
              </div>

              {/* Right Side: Leaderboard record insertion */}
              <div className="md:col-span-5">
                <Leaderboard
                  currentDifficulty={difficulty}
                  newScoreEntry={{ score: matchResult.score, streak: matchResult.maxStreak }}
                  onClose={handleReturnHome}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-4 sm:py-6 px-4 sm:px-6 text-center text-xs text-zinc-500 bg-zinc-950">
        <p className="max-w-md mx-auto uppercase tracking-wider text-[8px] sm:text-[9px] leading-relaxed font-bold">
          GOAL AI Webcam Football is an experimental arcade motion simulator powered by Google AI Studio. 
          Rendered locally at 60 FPS in full-screen desktop precision.
        </p>
        <p className="mt-2 text-[10px] font-black text-lime-400 uppercase tracking-widest">
          Made by M Usman Mughal
        </p>
      </footer>
    </div>
  );
}
