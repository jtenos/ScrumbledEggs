// Shared data shapes. Mirrors the RTDB layout documented in CLAUDE.md.

export type RoundStatus = 'queued' | 'voting' | 'revealed';

export interface RevealRequest {
  byUid: string;
  byName: string;
  requestedAt: number;
  /** Set true by the host to veto a non-host reveal request within the 3s window. */
  cancelled?: boolean;
}

export interface RoomMeta {
  name: string;
  createdAt: number;
  lastActivity: number;
  hostUid: string;
  /** Ordered deck for display (includes any enabled special cards 0/∞/?). */
  deck: string[];
  /** Same values keyed for O(1) Security-Rule membership validation. */
  deckSet: Record<string, true>;
  currentRoundId: string;
  autoReveal: boolean;
  /** Present only on a tombstone left by the cleanup job. */
  status?: 'expired';
  revealRequest?: RevealRequest | null;
}

export interface Round {
  title: string;
  startedAt: number;
  status: RoundStatus;
  /** Host-chosen final score (a deck value). Absent = no override. */
  overrideScore?: string | null;
  /** uid -> true. Readable during voting so we can show who has voted without leaking values. */
  voted?: Record<string, true>;
  /** uid -> deck value. Values only displayed once the round is revealed. */
  votes?: Record<string, string>;
}

export interface Participant {
  name: string;
  /** Filename from player-images.txt; unique per room (best-effort). */
  icon: string;
  isObserver: boolean;
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
}

export interface Room {
  meta: RoomMeta;
  rounds?: Record<string, Round>;
  participants?: Record<string, Participant>;
}

/** Special (non-scale) cards, excluded from all score math. */
export const ZERO = '0';
export const INFINITY = '∞';
export const UNKNOWN = '?';
export const SPECIAL_CARDS = [ZERO, INFINITY, UNKNOWN] as const;

export function isSpecial(card: string): boolean {
  return card === ZERO || card === INFINITY || card === UNKNOWN;
}
