/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LeaderboardEntry, Difficulty } from '../types';
import { Trophy, Zap, RefreshCw } from 'lucide-react';

interface LeaderboardProps {
  currentDifficulty: Difficulty;
  newScoreEntry?: { score: number; streak: number } | null;
  onClose?: () => void;
}

// Pre-seeded legendary football players for competitive fun!
const DEFAULT_LEADERBOARDS: LeaderboardEntry[] = [
  { id: '1', name: 'Cristiano Ronaldo', score: 1250, difficulty: 'hard', streak: 12, date: '2026-07-15' },
  { id: '2', name: 'Leo Messi', score: 1200, difficulty: 'hard', streak: 11, date: '2026-07-14' },
  { id: '3', name: 'Kylian Mbappé', score: 1050, difficulty: 'medium', streak: 9, date: '2026-07-15' },
  { id: '4', name: 'Neymar Jr', score: 980, difficulty: 'medium', streak: 8, date: '2026-07-13' },
  { id: '5', name: 'Erling Haaland', score: 950, difficulty: 'hard', streak: 8, date: '2026-07-16' },
  { id: '6', name: 'Bukayo Saka', score: 820, difficulty: 'easy', streak: 7, date: '2026-07-12' },
  { id: '7', name: 'Jude Bellingham', score: 790, difficulty: 'medium', streak: 6, date: '2026-07-15' },
  { id: '8', name: 'Mo Salah', score: 750, difficulty: 'easy', streak: 6, date: '2026-07-14' },
  { id: '9', name: 'Son Heung-min', score: 620, difficulty: 'easy', streak: 5, date: '2026-07-10' },
];

export default function Leaderboard({ currentDifficulty, newScoreEntry, onClose }: LeaderboardProps) {
  const [activeTab, setActiveTab] = useState<Difficulty>(currentDifficulty);
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);

  // Load scores on start
  useEffect(() => {
    const saved = localStorage.getItem('fifa_finger_scores');
    if (saved) {
      try {
        setScores(JSON.parse(saved));
      } catch (e) {
        setScores(DEFAULT_LEADERBOARDS);
      }
    } else {
      localStorage.setItem('fifa_finger_scores', JSON.stringify(DEFAULT_LEADERBOARDS));
      setScores(DEFAULT_LEADERBOARDS);
    }
  }, []);

  const handleSaveScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !newScoreEntry) return;

    const newEntry: LeaderboardEntry = {
      id: Math.random().toString(36).substring(2),
      name: playerName.trim(),
      score: newScoreEntry.score,
      difficulty: currentDifficulty,
      streak: newScoreEntry.streak,
      date: new Date().toISOString().split('T')[0],
      isPlayer: true,
    };

    const updated = [newEntry, ...scores];
    // Sort by score descending
    updated.sort((a, b) => b.score - a.score);
    localStorage.setItem('fifa_finger_scores', JSON.stringify(updated));
    setScores(updated);
    setScoreSaved(true);
    setActiveTab(currentDifficulty); // View the tab they scored on
  };

  const handleResetScores = () => {
    if (confirm('Are you sure you want to reset all custom scores to defaults?')) {
      localStorage.setItem('fifa_finger_scores', JSON.stringify(DEFAULT_LEADERBOARDS));
      setScores(DEFAULT_LEADERBOARDS);
      setScoreSaved(false);
    }
  };

  const filteredScores = scores
    .filter(s => s.difficulty === activeTab)
    .slice(0, 10); // Show top 10

  return (
    <div className="w-full bg-zinc-900 border border-white/10 rounded-2xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
      
      {/* Save score section if player just finished a game */}
      {newScoreEntry && !scoreSaved && (
        <div className="mb-5 p-5 border border-lime-400/30 bg-lime-400/5 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 text-lime-400/10">
            <Trophy className="w-12 h-12" />
          </div>
          <h3 className="text-xs font-black tracking-widest text-lime-400 uppercase flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 fill-current" /> STRIKER RECORD UNLOCKED
          </h3>
          <p className="text-xs text-zinc-300 mb-4 uppercase tracking-wider font-bold">
            Score <span className="text-lime-400 font-black">{newScoreEntry.score} PTS</span> • Max Streak <span className="text-lime-400 font-black">{newScoreEntry.streak} GOALS</span>
          </p>
          <form onSubmit={handleSaveScore} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="YOUR CALLSIGN..."
              required
              maxLength={18}
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              className="bg-black/60 border border-white/10 focus:border-lime-400 focus:outline-none rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 transition-all font-mono text-xs uppercase tracking-widest font-black"
            />
            <button
              type="submit"
              className="px-6 py-2.5 bg-lime-400 hover:bg-lime-300 text-black font-black text-xs uppercase tracking-widest rounded-lg transition-all shadow-[0_0_15px_rgba(163,230,53,0.3)] cursor-pointer"
            >
              SAVE TO LEADERBOARD
            </button>
          </form>
        </div>
      )}

      {/* Title */}
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black text-lime-400 uppercase tracking-widest">
            Leaderboard - {activeTab.toUpperCase()}
          </h3>
          
          {/* Difficulty Tabs */}
          <div className="flex bg-black/60 p-1 rounded-full border border-white/10">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(diff => (
              <button
                key={diff}
                onClick={() => setActiveTab(diff)}
                className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                  activeTab === diff
                    ? 'bg-lime-400 text-black'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scores List */}
      <div className="space-y-3 bg-black/30 border border-white/5 p-4 rounded-xl mb-4">
        {filteredScores.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 text-xs font-bold uppercase tracking-widest">
            No entries available.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredScores.map((entry, index) => {
              const rank = index + 1;
              const formattedRank = rank.toString().padStart(2, '0');
              
              return (
                <div
                  key={entry.id}
                  className="flex justify-between items-center py-1 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase tracking-tight ${entry.isPlayer ? 'text-lime-400' : 'opacity-50 text-white'}`}>
                      {formattedRank}. {entry.name}
                    </span>
                    {entry.isPlayer && (
                      <span className="text-[8px] bg-lime-400 text-black px-1 py-0.5 rounded font-black font-mono tracking-widest">
                        YOU
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] text-zinc-500 font-mono">
                      STRK:{entry.streak}
                    </span>
                    <span className={`text-sm font-mono font-bold ${entry.isPlayer ? 'text-lime-400' : 'text-white'}`}>
                      {entry.score.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-zinc-500">
        <button
          onClick={handleResetScores}
          className="flex items-center gap-1.5 hover:text-red-400 transition-colors py-1 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" /> Reset
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full font-black tracking-widest transition-all cursor-pointer"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
