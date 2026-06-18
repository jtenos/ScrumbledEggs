// Vote scoring. Rules (see CLAUDE.md → Vote reveal & scoring):
//  - ½ counts as 0.5; non-numeric scales (T-shirt/custom) map ordinally onto Fibonacci.
//  - Special cards 0/∞/? are excluded from all math; non-voters are excluded.
//  - Recommended = deck value closest to the mean; exact half → round up.
//  - Spread = cast votes more than one deck position apart.
//  - Consensus = ≥2 voters, all cast votes identical.
import { isSpecial } from './types';
import { HALF } from './scales';

/** Fibonacci values used for ordinal mapping of non-numeric scales. */
function fib(n: number): number[] {
  const out = [1, 2];
  while (out.length < n) out.push(out[out.length - 1] + out[out.length - 2]);
  return out.slice(0, n);
}

function parseNumeric(value: string): number | null {
  if (value === HALF) return 0.5;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface DeckModel {
  /** Deck values excluding special cards, in order. */
  baseValues: string[];
  /** Base value -> numeric value used for math. */
  toNumber: Map<string, number>;
  /** Base value -> its index (for spread distance). */
  indexOf: Map<string, number>;
}

/** Build the numeric model for a deck. Numeric scales use their own numbers; otherwise ordinal Fibonacci. */
export function buildDeckModel(deck: string[]): DeckModel {
  const baseValues = deck.filter((v) => !isSpecial(v));
  const numeric = baseValues.map(parseNumeric);
  const allNumeric = numeric.every((n) => n !== null);

  const toNumber = new Map<string, number>();
  const indexOf = new Map<string, number>();
  const fibVals = allNumeric ? [] : fib(baseValues.length);

  baseValues.forEach((v, i) => {
    indexOf.set(v, i);
    toNumber.set(v, allNumeric ? (numeric[i] as number) : fibVals[i]);
  });

  return { baseValues, toNumber, indexOf };
}

export interface Scores {
  /** Number of real (non-special) votes counted. */
  count: number;
  mean: number | null;
  median: number | null;
  /** Recommended deck value (a base value label), or null if nothing to compute. */
  recommended: string | null;
  /** True when cast real votes span more than one deck position. */
  spread: boolean;
  /** True when ≥2 voters and all cast votes are identical. */
  consensus: boolean;
}

/**
 * Compute scores from a votes map (uid -> deck value). Only real votes from voters
 * are considered for math; specials and non-voters are ignored.
 */
export function computeScores(model: DeckModel, votes: Record<string, string>): Scores {
  const cast = Object.values(votes);
  const consensus = cast.length >= 2 && cast.every((v) => v === cast[0]);

  const realValues = cast.filter((v) => !isSpecial(v));
  const nums = realValues
    .map((v) => model.toNumber.get(v))
    .filter((n): n is number => n !== undefined);

  if (nums.length === 0) {
    return { count: 0, mean: null, median: null, recommended: null, spread: false, consensus };
  }

  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const median = computeMedian(nums);
  const recommended = nearestDeckValue(model, mean);

  const indices = realValues
    .map((v) => model.indexOf.get(v))
    .filter((i): i is number => i !== undefined);
  const spread = indices.length >= 2 && Math.max(...indices) - Math.min(...indices) > 1;

  return { count: nums.length, mean, median, recommended, spread, consensus };
}

function computeMedian(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Closest base value to `target`; on an exact tie, pick the higher value. */
function nearestDeckValue(model: DeckModel, target: number): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  let bestNum = -Infinity;
  for (const v of model.baseValues) {
    const num = model.toNumber.get(v);
    if (num === undefined) continue;
    const dist = Math.abs(num - target);
    if (dist < bestDist || (dist === bestDist && num > bestNum)) {
      best = v;
      bestDist = dist;
      bestNum = num;
    }
  }
  return best;
}
