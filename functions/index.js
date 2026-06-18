// Scheduled cleanup (Blaze plan). Runs daily; for each room past the retention
// window, deletes ALL of its contents and leaves a tombstone { meta: { status: "expired" } }
// so the room URL resolves to the expired page instead of "not found".
//
// Pair this with a Cloud Billing budget + hard cap (see README → Cost protection)
// so a usage spike can never produce a large bill.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

initializeApp();

// Delete rooms with no activity for this long.
const RETENTION_MS = 48 * 60 * 60 * 1000; // 48 hours

exports.cleanupExpiredRooms = onSchedule('every 24 hours', async () => {
  const db = getDatabase();
  const cutoff = Date.now() - RETENTION_MS;

  const snap = await db.ref('rooms').once('value');
  const rooms = snap.val() || {};

  const updates = {};
  for (const [roomId, room] of Object.entries(rooms)) {
    if (!room || !room.meta) continue;
    if (room.meta.status === 'expired') continue; // already a tombstone
    const last = room.meta.lastActivity || room.meta.createdAt || 0;
    if (last < cutoff) {
      // Replacing rooms/<id> wholesale drops participants/rounds and leaves only the tombstone.
      updates[roomId] = { meta: { status: 'expired' } };
    }
  }

  const count = Object.keys(updates).length;
  if (count > 0) {
    await db.ref('rooms').update(updates);
  }
  console.log(`cleanupExpiredRooms: expired ${count} room(s)`);
});
