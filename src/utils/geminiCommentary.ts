/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gemini AI live match commentary for GOAL AI.
 * Called after every penalty kick outcome.
 */

import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export type ShotOutcome = 'goal' | 'saved' | 'missed' | 'post';

const OUTCOME_CONTEXT: Record<ShotOutcome, string> = {
  goal:   'the striker scored a goal — the ball hit the back of the net',
  saved:  'the goalkeeper made a spectacular save and stopped the shot',
  missed: 'the shot went wide or over the crossbar — completely missed the target',
  post:   'the ball hit the post or crossbar and bounced out — heartbreakingly close',
};

/**
 * Generates a single punchy, dramatic commentary line via Gemini 2.0 Flash.
 * Returns an empty string if the API key is missing or the call fails.
 */
export async function generateCommentary(
  outcome: ShotOutcome,
  score: number,
  streak: number,
  difficulty: 'easy' | 'medium' | 'hard'
): Promise<string> {
  if (!ai) return '';

  const streakNote = streak >= 3 ? ` The player is on a ${streak}-kick scoring streak!` : '';
  const diffNote = difficulty === 'hard' ? ' Pro difficulty.' : '';

  const prompt =
    `You are a dramatic, electric live football/soccer TV commentator calling a penalty shootout.\n` +
    `The outcome: ${OUTCOME_CONTEXT[outcome]}.${streakNote}${diffNote}\n` +
    `Generate ONE single commentary line — maximum 12 words — that is punchy, vivid, and exciting.\n` +
    `Output only the commentary line itself, no quotes, no labels, no explanation.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });
    const text = response.text?.trim() ?? '';
    // Guard against any stray quotes or newlines
    return text.replace(/^["']|["']$/g, '').split('\n')[0].trim();
  } catch {
    return '';
  }
}
