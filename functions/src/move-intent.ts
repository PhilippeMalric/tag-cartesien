// functions/src/move-intent.ts (TS/ESM)
import { onValueWritten } from 'firebase-functions/v2/database';
import { getDatabase } from 'firebase-admin/database';
// ⛔️ pas d'initializeApp() ici : déjà fait dans index.ts

export const onIntent = onValueWritten(
  { ref: '/rooms/{roomId}/intents/{uid}/{seq}', region: 'northamerica-northeast1' },
  async (event) => {
    const { roomId, uid, seq } = event.params;
    const after = event.data.after.val();
    if (!after) return; // deleted

    const db = getDatabase();
    const posRef = db.ref(`/positions/${roomId}/${uid}`);
    const snap = await posRef.get();
    const pos = snap.val() ?? { x: 0, y: 0, t: 0, lastAppliedSeq: 0 };

    const seqNum = Number(seq) || 0;
    if (seqNum <= (pos.lastAppliedSeq ?? 0)) return; // idempotence

    // Clamp du pas
    const vx = Number(after.vx) || 0;
    const vy = Number(after.vy) || 0;
    const max = 12;
    const nx = pos.x + Math.max(-max, Math.min(max, vx));
    const ny = pos.y + Math.max(-max, Math.min(max, vy));

    // Bornes cohérentes avec le client : [-50..50]
    const bx = Math.max(-50, Math.min(50, nx));
    const by = Math.max(-50, Math.min(50, ny));

    await posRef.update({
      x: bx, y: by,
      t: Date.now(),
      lastAppliedSeq: seqNum,
    });

    // Cleanup des intents ≤ seqNum via batch { key: null }
    try {
      const intentsParentRef = db.ref(`/rooms/${roomId}/intents/${uid}`);
      const oldSnap = await intentsParentRef.orderByKey().endAt(String(seqNum)).get();
      if (oldSnap.exists()) {
        const updates: Record<string, null> = {};
        oldSnap.forEach((child) => {
          if (child.key) updates[child.key] = null;
          return false;
        });
        if (Object.keys(updates).length) {
          await intentsParentRef.update(updates);
        }
      }
    } catch {
      /* best-effort */
    }
  }
);
