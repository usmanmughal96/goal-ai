/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Share2, Check, Download, Copy, MessageCircle, Twitter } from 'lucide-react';
import { Difficulty } from '../types';

interface SocialShareProps {
  score: number;
  streak: number;
  difficulty: Difficulty;
  jerseyColor: string;
}

export default function SocialShare({ score, streak, difficulty, jerseyColor }: SocialShareProps) {
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const shareText = `⚽ FIFA FINGER PENALTY LEAGUE ⚽\n\nI just scored a world-class goal with webcam tracking! 🖐️🥅\n🔥 Streak: ${streak} goals\n🎯 Score: ${score} pts\n⚡ Difficulty: ${difficulty.toUpperCase()} MODE\n\nTry it yourself with your webcam and fingers! #FIFAbuild #AIStudio`;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Clipboard copy failed');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      console.warn('Clipboard copy failed');
    }
  };

  const shareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const shareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  // Triggers client-side download of a beautiful SVG poster card!
  const downloadStatsCard = () => {
    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" rx="20" fill="#0f172a"/>
        <defs>
          <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="100%" stop-color="#4f46e5" />
          </linearGradient>
          <linearGradient id="goldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#d97706" />
          </linearGradient>
        </defs>
        
        <!-- Field line arcs -->
        <path d="M 0 350 Q 300 150 600 350" fill="none" stroke="#1e293b" stroke-width="4" stroke-dasharray="8 4"/>
        <circle cx="300" cy="350" r="12" fill="#334155" />

        <!-- Stadium Goal lines in the bg -->
        <rect x="150" y="80" width="300" height="150" fill="none" stroke="#334155" stroke-width="6" rx="4" />
        <line x1="150" y1="230" x2="110" y2="350" stroke="#1e293b" stroke-width="3" />
        <line x1="450" y1="230" x2="490" y2="350" stroke="#1e293b" stroke-width="3" />

        <!-- Title -->
        <text x="300" y="50" font-family="'Inter', sans-serif" font-weight="900" font-size="22" fill="#ffffff" text-anchor="middle" letter-spacing="2">FINGER PENALTY CHAMPION</text>
        <text x="300" y="70" font-family="'Inter', sans-serif" font-weight="500" font-size="11" fill="#818cf8" text-anchor="middle" letter-spacing="3">COMPUTER VISION LEAGUE</text>
        
        <!-- Score Card -->
        <rect x="200" y="140" width="200" height="90" rx="12" fill="#1e1b4b" stroke="#3730a3" stroke-width="2"/>
        <text x="300" y="175" font-family="'Courier New', monospace" font-weight="900" font-size="36" fill="#f59e0b" text-anchor="middle">${score}</text>
        <text x="300" y="210" font-family="'Inter', sans-serif" font-weight="700" font-size="12" fill="#a5b4fc" text-anchor="middle" letter-spacing="1">TOTAL POINTS</text>
        
        <!-- Left Stat Box -->
        <rect x="70" y="250" width="210" height="80" rx="12" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
        <text x="175" y="280" font-family="'Inter', sans-serif" font-weight="900" font-size="24" fill="#10b981" text-anchor="middle">${streak} GOALS</text>
        <text x="175" y="305" font-family="'Inter', sans-serif" font-weight="500" font-size="11" fill="#64748b" text-anchor="middle">BEST STREAK</text>
        
        <!-- Right Stat Box -->
        <rect x="320" y="250" width="210" height="80" rx="12" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
        <text x="425" y="280" font-family="'Inter', sans-serif" font-weight="900" font-size="20" fill="#a78bfa" text-anchor="middle" text-transform="uppercase">${difficulty} MODE</text>
        <text x="425" y="305" font-family="'Inter', sans-serif" font-weight="500" font-size="11" fill="#64748b" text-anchor="middle">DIFFICULTY</text>
        
        <!-- Badge -->
        <path d="M 300 310 L 315 325 L 315 350 L 300 340 L 285 350 L 285 325 Z" fill="url(#goldGlow)" />
        <circle cx="300" cy="320" r="10" fill="#f59e0b" />
        <text x="300" y="324" font-family="'Inter', sans-serif" font-weight="900" font-size="10" fill="#000000" text-anchor="middle">✔</text>

        <!-- Small footer watermark -->
        <text x="300" y="380" font-family="'Inter', sans-serif" font-weight="500" font-size="9" fill="#334155" text-anchor="middle">PLAYED VIA GOOGLE AI STUDIO WEBCAM COMPUTER VISION</text>
      </svg>
    `;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finger-football-score-${score}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <h3 className="text-md font-bold text-white mb-3 flex items-center gap-2">
        <Share2 className="w-4 h-4 text-indigo-400" /> Share Your Achievement
      </h3>
      
      {/* Visual Preview Box */}
      <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 mb-4 font-mono text-xs text-slate-300 leading-relaxed break-words whitespace-pre-line relative">
        <div className="absolute top-2 right-2 text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-sans">
          Preview
        </div>
        {shareText}
      </div>

      {/* Sharing Button Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={handleCopyText}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-slate-700"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" /> Copied Text!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" /> Copy Message
            </>
          )}
        </button>

        <button
          onClick={downloadStatsCard}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-semibold rounded-lg transition-colors shadow"
        >
          <Download className="w-4 h-4" /> Download Poster
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={shareTwitter}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] border border-[#1DA1F2]/20 text-xs font-semibold rounded-lg transition-colors"
        >
          <Twitter className="w-4 h-4 fill-current" /> Twitter
        </button>

        <button
          onClick={shareWhatsApp}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 text-xs font-semibold rounded-lg transition-colors"
        >
          <MessageCircle className="w-4 h-4 fill-current" /> WhatsApp
        </button>

        <button
          onClick={handleCopyLink}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold rounded-lg transition-colors"
          title="Copy Link to Clipboard"
        >
          {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
