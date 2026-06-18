// Pointing scales: presets, special-card toggles, deck assembly, and the
// bookmarkable preset link (?scale=...&zero=1&unknown=0&infinity=1).
import { ZERO, INFINITY, UNKNOWN } from './types';

export interface PresetScale {
  id: string;
  label: string;
  values: string[];
}

export const HALF = '½';

export const PRESET_SCALES: PresetScale[] = [
  { id: 'fib', label: 'Fibonacci (Classic)', values: ['1', '2', '3', '5', '8', '13', '21'] },
  {
    id: 'modfib',
    label: 'Modified Fibonacci',
    values: [HALF, '1', '2', '3', '5', '8', '13', '20', '40', '100'],
  },
  { id: 'pow2', label: 'Powers of 2', values: ['1', '2', '4', '8', '16', '32', '64'] },
  {
    id: 'linear',
    label: 'Linear Scale',
    values: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  },
  { id: 'tshirt', label: 'T-Shirt Sizes', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
];

export interface ScaleOptions {
  zero: boolean;
  unknown: boolean;
  infinity: boolean;
}

export const DEFAULT_OPTIONS: ScaleOptions = { zero: false, unknown: false, infinity: false };

/**
 * Assemble the full ordered deck from base scale values + toggles.
 * Order: [0?] then scale values then [∞?] then [??]  (zero first; infinity then unknown last).
 */
export function buildDeck(baseValues: string[], opts: ScaleOptions): string[] {
  const deck: string[] = [];
  if (opts.zero) deck.push(ZERO);
  deck.push(...baseValues);
  if (opts.infinity) deck.push(INFINITY);
  if (opts.unknown) deck.push(UNKNOWN);
  return deck;
}

/** Keyed set companion of the deck, for cheap Security-Rule membership checks. */
export function deckToSet(deck: string[]): Record<string, true> {
  return Object.fromEntries(deck.map((v) => [v, true]));
}

export interface ScaleSelection {
  /** Base scale values, excluding special cards. */
  values: string[];
  options: ScaleOptions;
}

/** Build the bookmarkable query string for a selection. */
export function buildPresetQuery(sel: ScaleSelection): string {
  const params = new URLSearchParams();
  params.set('scale', sel.values.join(','));
  params.set('zero', sel.options.zero ? '1' : '0');
  params.set('unknown', sel.options.unknown ? '1' : '0');
  params.set('infinity', sel.options.infinity ? '1' : '0');
  return params.toString();
}

/** Parse a preset query string; returns null if no usable `scale` param is present. */
export function parsePresetQuery(search: string): ScaleSelection | null {
  const params = new URLSearchParams(search);
  const scale = params.get('scale');
  if (!scale) return null;
  const values = scale
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  return {
    values,
    options: {
      zero: params.get('zero') === '1',
      unknown: params.get('unknown') === '1',
      infinity: params.get('infinity') === '1',
    },
  };
}

/** Parse comma-delimited custom values entered by the host. */
export function parseCustomValues(input: string): string[] {
  return input
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
