// functions/src/lib/players.ts
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

export type RoomDoc = {
  ownerUid?: string;
  hunterUid?: string | null;
  roles?: Record<string, string>;
};

export type RemovePlayerResult = {
  ok: true;
  roomId: string;
  uid: string;
  cleanedRoles: boolean;
  clearedHunter: boolean;
};

export async function cleanRoomAfterPlayerRemoval(db: Firestore, roomId: string, uid: string) {
  const roomRef = db.doc(`rooms/${roomId}`);
  const snap = await roomRef.get();
  if (!snap.exists) return;

  const room = (snap.data() || {}) as RoomDoc;
  const roles = room.roles ?? {};
  const hunterUid = room.hunterUid ?? null;

  const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
  if (Object.prototype.hasOwnProperty.call(roles, uid)) {
    updates[`roles.${uid}`] = FieldValue.delete();
  }
  if (hunterUid === uid) {
    updates["hunterUid"] = null;
  }

  if (Object.keys(updates).length > 1) {
    await roomRef.update(updates);
  } else {
    await roomRef.update({ updatedAt: FieldValue.serverTimestamp() });
  }
}

/**
 * N’initialise rien ; prend `db` en argument.
 * Vérifie l’accès (owner/admin/joueur) et exécute la suppression + cleanup en batch.
 */
export async function removePlayerCore(
  db: Firestore,
  params: { roomId: string; uid: string; callerUid: string; isAdmin: boolean }
): Promise<RemovePlayerResult> {
  const { roomId, uid, callerUid, isAdmin } = params;

  const roomRef = db.doc(`rooms/${roomId}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw Object.assign(new Error("Room not found"), { code: "not-found" });
  }

  const room = roomSnap.data() as RoomDoc;
  const ownerUid = room.ownerUid ?? "";

  // Autorisations: admin, owner, ou le joueur lui-même
  if (!(isAdmin || callerUid === ownerUid || callerUid === uid)) {
    const err = new Error("Not allowed to remove this player");
    (err as any).code = "permission-denied";
    throw err;
  }

  const playerRef = roomRef.collection("players").doc(uid);

  const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
  const roles = (room.roles ?? {}) as Record<string, string>;
  if (Object.prototype.hasOwnProperty.call(roles, uid)) {
    updates[`roles.${uid}`] = FieldValue.delete();
  }
  if (room.hunterUid === uid) {
    updates["hunterUid"] = null;
  }

  const batch = db.batch();
  batch.delete(playerRef);
  batch.update(roomRef, updates);
  await batch.commit();

  return {
    ok: true,
    roomId,
    uid,
    cleanedRoles: Object.prototype.hasOwnProperty.call(roles, uid),
    clearedHunter: room.hunterUid === uid,
  };
}
