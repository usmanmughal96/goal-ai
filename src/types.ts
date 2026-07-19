/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export type GamePhase = 'welcome' | 'calibration' | 'playing' | 'summary';

export type KickResultType = 'goal' | 'saved' | 'missed' | 'post';

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  difficulty: Difficulty;
  streak: number;
  date: string;
  isPlayer?: boolean;
}

export interface CalibrationData {
  sensitivity: number; // Threshold for motion detection (1-100)
  invertX: boolean; // Mirror camera input
  activeZoneRect: {
    x: number; // percentage from left
    y: number; // percentage from top
    w: number; // percentage width
    h: number; // percentage height
  };
}

export interface KickResult {
  type: KickResultType;
  message: string;
  speed: number; // speed in km/h
  placementX: number; // -1 (far left) to +1 (far right)
  placementY: number; // 0 (ground) to 1 (top corner)
  keeperDivedTo: 'left' | 'center' | 'right' | 'up-left' | 'up-right';
}
