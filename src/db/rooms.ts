// RTDB data-access layer. All room reads/writes go through here.
// RTDB is the single source of truth; the UI subscribes and re-renders on change.
import {
  ref,
  child,
  push,
  set,
  update,
  get,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
} from 'firebase/database';
import { db } from '../firebase';
import type { Room, RoomMeta, Round, Participant, RevealRequest } from '../types';

const roomRef = (roomId: string) => ref(db, `rooms/${roomId}`);
const metaRef = (roomId: string) => ref(db, `rooms/${roomId}/meta`);
const roundsRef = (roomId: string) => ref(db, `rooms/${roomId}/rounds`);
const roundRef = (roomId: string, roundId: string) => ref(db, `rooms/${roomId}/rounds/${roundId}`);
const participantRef = (roomId: string, uid: string) =>
  ref(db, `rooms/${roomId}/participants/${uid}`);

function touch(roomId: string): Promise<void> {
  return update(metaRef(roomId), { lastActivity: serverTimestamp() });
}

export interface CreateRoomInput {
  name: string;
  deck: string[];
  deckSet: Record<string, true>;
  autoReveal: boolean;
  hostUid: string;
  firstStoryTitle: string;
}

/** Create a room with its first (voting) round. Returns the new roomId. */
export async function createRoom(input: CreateRoomInput): Promise<string> {
  const roomId = crypto.randomUUID();
  const firstRoundId = crypto.randomUUID();

  const meta: RoomMeta = {
    name: input.name,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    hostUid: input.hostUid,
    deck: input.deck,
    deckSet: input.deckSet,
    currentRoundId: firstRoundId,
    autoReveal: input.autoReveal,
  };
  const round: Round = {
    title: input.firstStoryTitle,
    startedAt: Date.now(),
    status: 'voting',
  };

  await set(roomRef(roomId), { meta, rounds: { [firstRoundId]: round } });
  return roomId;
}

/** Subscribe to the whole room. Returns an unsubscribe function. */
export function subscribeRoom(roomId: string, cb: (room: Room | null) => void): () => void {
  return onValue(roomRef(roomId), (snap) => cb(snap.val() as Room | null));
}

export async function getRoomMeta(roomId: string): Promise<RoomMeta | null> {
  const snap = await get(metaRef(roomId));
  return snap.exists() ? (snap.val() as RoomMeta) : null;
}

export function updateRoomName(roomId: string, name: string): Promise<void> {
  return update(metaRef(roomId), { name, lastActivity: serverTimestamp() });
}

export function setAutoReveal(roomId: string, autoReveal: boolean): Promise<void> {
  return update(metaRef(roomId), { autoReveal });
}

// --- Participants & presence ---

export async function joinRoom(
  roomId: string,
  uid: string,
  data: { name: string; icon: string; isObserver: boolean }
): Promise<void> {
  const partRef = participantRef(roomId, uid);
  const existing = await get(partRef);
  const base: Participant = {
    name: data.name,
    icon: data.icon,
    isObserver: data.isObserver,
    connected: true,
    joinedAt: existing.exists() ? (existing.val() as Participant).joinedAt : Date.now(),
    lastSeen: Date.now(),
  };
  await set(partRef, base);
  // Presence: flip connected=false when the tab closes/drops.
  onDisconnect(child(partRef, 'connected')).set(false);
  onDisconnect(child(partRef, 'lastSeen')).set(serverTimestamp());
  await touch(roomId);
}

export function setObserver(roomId: string, uid: string, isObserver: boolean): Promise<void> {
  return update(participantRef(roomId, uid), { isObserver });
}

export function kickUser(roomId: string, uid: string): Promise<void> {
  return remove(participantRef(roomId, uid));
}

export function reassignHost(roomId: string, newHostUid: string): Promise<void> {
  return update(metaRef(roomId), { hostUid: newHostUid });
}

// --- Voting ---

/** Cast or change a vote. Writes both the `voted` flag (visible pre-reveal) and the value. */
export async function setVote(
  roomId: string,
  roundId: string,
  uid: string,
  value: string
): Promise<void> {
  await update(roundRef(roomId, roundId), {
    [`voted/${uid}`]: true,
    [`votes/${uid}`]: value,
  });
  await touch(roomId);
}

export async function resetVotes(roomId: string, roundId: string): Promise<void> {
  await update(roundRef(roomId, roundId), {
    voted: null,
    votes: null,
    overrideScore: null,
    status: 'voting',
  });
  await touch(roomId);
}

export function revealRound(roomId: string, roundId: string): Promise<void> {
  return update(roundRef(roomId, roundId), { status: 'revealed' });
}

export function setOverride(
  roomId: string,
  roundId: string,
  value: string | null
): Promise<void> {
  return update(roundRef(roomId, roundId), { overrideScore: value });
}

// --- Reveal request (non-host) ---

export function requestReveal(roomId: string, req: RevealRequest): Promise<void> {
  return set(child(metaRef(roomId), 'revealRequest'), req);
}

export function cancelReveal(roomId: string): Promise<void> {
  return update(child(metaRef(roomId), 'revealRequest'), { cancelled: true });
}

export function clearRevealRequest(roomId: string): Promise<void> {
  return remove(child(metaRef(roomId), 'revealRequest'));
}

// --- Rounds & queue ---

export async function enqueueStory(roomId: string, title: string): Promise<void> {
  const r = push(roundsRef(roomId));
  await set(r, { title, startedAt: 0, status: 'queued' } satisfies Round);
  await touch(roomId);
}

/**
 * Advance to the next round. If a queued round exists, promote the oldest to current;
 * otherwise create a fresh round with `newTitle`. Returns the new current roundId.
 */
export async function nextRound(roomId: string, newTitle: string): Promise<string> {
  const snap = await get(roundsRef(roomId));
  const rounds = (snap.val() as Record<string, Round> | null) ?? {};

  // Queued rounds, oldest first (push keys sort chronologically).
  const queued = Object.entries(rounds)
    .filter(([, r]) => r.status === 'queued')
    .sort(([a], [b]) => (a < b ? -1 : 1));

  if (queued.length > 0) {
    const [roundId] = queued[0];
    await update(roundRef(roomId, roundId), { status: 'voting', startedAt: Date.now() });
    await update(metaRef(roomId), { currentRoundId: roundId, lastActivity: serverTimestamp() });
    return roundId;
  }

  const roundId = crypto.randomUUID();
  await set(roundRef(roomId, roundId), {
    title: newTitle,
    startedAt: Date.now(),
    status: 'voting',
  } satisfies Round);
  await update(metaRef(roomId), { currentRoundId: roundId, lastActivity: serverTimestamp() });
  return roundId;
}
