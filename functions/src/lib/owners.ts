// functions/src/lib/owners.ts
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export async function setRoomOwnerCore(
  db: Firestore,
  params: { roomId: string; newOwnerUid: string; isAdmin: boolean }
) {
  const { roomId, newOwnerUid, isAdmin } = params;
  if (!isAdmin) {
    const err = new Error('Admin required'); (err as any).code = 'permission-denied'; throw err;
  }

  const roomRef = db.doc(`rooms/${roomId}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    const err = new Error('Room not found'); (err as any).code = 'not-found'; throw err;
  }

  // (Optionnel) vérifier que le joueur existe dans la room
  const playerSnap = await roomRef.collection('players').doc(newOwnerUid).get();
  if (!playerSnap.exists) {
    const err = new Error('Target player not in room'); (err as any).code = 'failed-precondition'; throw err;
  }

  const batch = db.batch();
  batch.update(roomRef, { ownerUid: newOwnerUid, updatedAt: FieldValue.serverTimestamp() });

  // Si tu utilises roomsMeta comme miroir d’owner:
  const metaRef = db.doc(`roomsMeta/${roomId}`);
  const metaSnap = await metaRef.get();
  if (metaSnap.exists) {
    batch.set(metaRef, { ownerUid: newOwnerUid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  await batch.commit();
  return { ok: true, roomId, newOwnerUid };
}
