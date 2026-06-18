// Revealed-scores panel: mean, median, recommended, optional host override.
import { el } from '../util/dom';
import type { Round } from '../types';
import type { Scores } from '../scoring';

function fmt(n: number | null): string {
  return n === null ? '—' : (Math.round(n * 100) / 100).toString();
}

export interface ResultsCtx {
  scores: Scores;
  round: Round;
  isHost: boolean;
  /** Deck values eligible as override choices (base values). */
  overrideChoices: string[];
  onSetOverride: (value: string) => void;
  onClearOverride: () => void;
  onReset: () => void;
}

export function renderResults(ctx: ResultsCtx): HTMLElement {
  const { scores } = ctx;

  const scoreRow = el('div', { class: 'scores' }, [
    el('div', {}, [el('div', { class: 'muted', text: 'Mean' }), el('div', { text: fmt(scores.mean) })]),
    el('div', {}, [el('div', { class: 'muted', text: 'Median' }), el('div', { text: fmt(scores.median) })]),
    el('div', {}, [
      el('div', { class: 'muted', text: 'Recommended' }),
      el('div', { class: 'recommended', text: scores.recommended ?? '—' }),
    ]),
  ]);

  const children: HTMLElement[] = [scoreRow];

  if (ctx.round.overrideScore != null) {
    children.push(
      el('div', {}, [
        el('span', { class: 'muted', text: 'Final score (override): ' }),
        el('span', { class: 'override', text: ctx.round.overrideScore }),
      ])
    );
  }

  if (ctx.isHost) {
    const select = el('select', {}, [
      el('option', { value: '', text: 'Override…' }),
      ...ctx.overrideChoices.map((v) => el('option', { value: v, text: v })),
    ]) as HTMLSelectElement;
    select.addEventListener('change', () => {
      if (select.value) ctx.onSetOverride(select.value);
    });

    const controls = el('div', { class: 'row', style: 'justify-content:center;margin-top:.6rem' }, [
      select,
      ctx.round.overrideScore != null
        ? (() => {
            const b = el('button', { text: 'Clear override' });
            b.addEventListener('click', () => ctx.onClearOverride());
            return b;
          })()
        : false,
      (() => {
        const b = el('button', { text: 'Reset votes' });
        b.addEventListener('click', () => ctx.onReset());
        return b;
      })(),
    ]);
    children.push(controls);
  }

  return el('div', { class: 'results' }, children);
}
