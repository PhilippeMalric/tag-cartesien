// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { handlers } from "./modes/index.js";
import { removePlayerCore, cleanRoomAfterPlayerRemoval } from "./lib/players.js";
import { setRoomOwnerCore } from "./lib/owners.js";
import { getDatabase } from "firebase-admin/database";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();
const rtdb = getDatabase();

// Bornes du monde (adapte si besoin)
const WORLD = { minX: -50, maxX: 50, minY: -50, maxY: 50 };

// Respawn simple : au hasard dans les bornes, avec option d'éviter de respawn trop près du point (nearX, nearY)
function pickRespawnSimple(nearX?: number, nearY?: number) {
  const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
  let x = rand(WORLD.minX, WORLD.maxX);
  let y = rand(WORLD.minY, WORLD.maxY);
  if (Number.isFinite(nearX) && Number.isFinite(nearY)) {
    const dx = x - (nearX as number);
    const dy = y - (nearY as number);
    if (Math.hypot(dx, dy) < 5) {
      x = Math.max(WORLD.minX, Math.min(WORLD.maxX, x + 7));
      y = Math.max(WORLD.minY, Math.min(WORLD.maxY, y + 7));
    }
  }
  return { x, y };
}

/** Callable: removePlayer */
export const removePlayer = onCall(async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Authentication required.");

  const { roomId, uid } = (req.data ?? {}) as { roomId?: string; uid?: string };
  if (!roomId || !uid) throw new HttpsError("invalid-argument", "roomId and uid are required.");

  try {
    const res = await removePlayerCore(db, {
      roomId,
      uid,
      callerUid: auth.uid,
      isAdmin: auth.token?.admin === true,
    });
    return res;
  } catch (e: any) {
    if (e?.code === "permission-denied") {
      throw new HttpsError("permission-denied", e.message ?? "Not allowed");
    }
    if (e?.code === "not-found") {
      throw new HttpsError("not-found", e.message ?? "Room not found");
    }
    throw new HttpsError("internal", e?.message ?? "Remove failed");
  }
});

/** Trigger: cleanup auto si un player est supprimé directement */
export const onPlayerDeleted = onDocumentDeleted("rooms/{roomId}/players/{uid}", async (event) => {
  const { roomId, uid } = event.params as { roomId: string; uid: string };
  await cleanRoomAfterPlayerRemoval(db, roomId, uid);
});

// -------- Types locaux utiles ----------
type PlayerDoc = {
  score?: number;
  combo?: number;
  lastTagMs?: number;
  iFrameUntilMs?: number;
  role?: "hunter" | "prey" | string;
};
type RoomDoc = {
  mode?: "classic" | "transmission" | "infection" | string;
  targetScore?: number;
  victory?: "all_infected" | "target_infections";
  infectionTarget?: number;
  roles?: Record<string, string>;
  huntersCount?: number;
  playersCount?: number;
  state?: "idle" | "running" | "ended" | "done";
};

// =======================================
// ✅ onTag: ne lit QUE data.payload
// =======================================
export const onTag = onDocumentCreated("rooms/{roomId}/events/{eventId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const data = snap.data() as any; // EventItem-like: { type, createdAt, payload: {...} }
  if (data?.type !== "tag/hit") return;

  // Utiliser UNIQUEMENT payload
  const payload = data?.payload ?? null;
  if (!payload) return;

  const roomId = String(event.params.roomId || "");
  const hunterUid = payload.byUid as string | undefined;
  const victimUid = payload.targetUid as string | undefined;
  const tagX = payload.x as number | undefined;
  const tagY = payload.y as number | undefined;
  const payloadMode = (payload.mode as RoomDoc["mode"]) ?? undefined;

  if (!roomId || !hunterUid || !victimUid) return;

  const isBotVictim = victimUid.startsWith("bot-");

  const roomRef = db.doc(`rooms/${roomId}`);
  const eventRef = snap.ref;

  // Idempotence du traitement "score"
  const markerRef = eventRef.collection("_processed").doc("score");
  const claimed = await db.runTransaction(async (tx) => {
    const m = await tx.get(markerRef);
    if (m.exists) return false;
    tx.set(markerRef, { at: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!claimed) return;

  // Lire la room (pour le mode & règles de fin)
  const roomSnap = await roomRef.get();
  const room = (roomSnap.data() || {}) as RoomDoc;
  const modeName = (payloadMode ?? room.mode ?? "classic") as NonNullable<RoomDoc["mode"]>;

  // 1) +1 au chasseur
  const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);
  await db.runTransaction(async (tx) => {
    const h = await tx.get(hunterRef);
    if (!h.exists) return;
    tx.update(hunterRef, {
      score: FieldValue.increment(1),
      lastTagMs: Date.now(),
    });
  });

  // 2) Respawn si victime = BOT (RTDB: champs conformes aux règles /bots)
  if (isBotVictim) {
    const { x: rx, y: ry } = pickRespawnSimple(tagX ?? 0, tagY ?? 0);
    await rtdb.ref(`bots/${roomId}/${victimUid}`).update({
      x: rx,
      y: ry,
      t: Date.now(),
      // name facultatif mais autorisé si tu veux l’inclure:
      // name: 'Bot',
    });
  } else {
    // 3) Victime humaine → déléguer au handler du mode
    const playersSnap = await db.collection(`rooms/${roomId}/players`).get();
    const players = new Map<string, PlayerDoc>();
    playersSnap.forEach((d) => players.set(d.id, (d.data() || {}) as PlayerDoc));

    const handler = handlers[modeName];
    if (handler?.onTag) {
      await handler.onTag({
        db,
        matchId: roomId,
        hunterUid,
        victimUid,
        now: Date.now(),
        room,
        players,
      });
    }
  }

  // 4) Conditions de fin (identiques à ta logique mais basées sur le mode final)
  if (modeName === "classic") {
    const target = room.targetScore ?? 5;
    if (target > 0) {
      const hDoc = await hunterRef.get();
      const h = (hDoc.data() || {}) as PlayerDoc;
      if ((h.score ?? 0) >= target) {
        await roomRef.set({ state: "ended", endedAt: Date.now() }, { merge: true });
        return;
      }
    }
  }

  if (modeName === "infection") {
    const victory = room.victory ?? "all_infected";
    if (victory === "target_infections") {
      const target = room.infectionTarget ?? 10;
      if (target > 0) {
        const hDoc = await hunterRef.get();
        const h = (hDoc.data() || {}) as PlayerDoc;
        if ((h.score ?? 0) >= target) {
          await roomRef.set({ state: "ended", endedAt: Date.now() }, { merge: true });
          return;
        }
      }
    } else {
      const freshRoom = ((await roomRef.get()).data() || {}) as RoomDoc;
      const huntersCount = freshRoom.huntersCount ?? room.huntersCount;
      const playersCount = freshRoom.playersCount ?? room.playersCount;

      if (
        typeof huntersCount === "number" &&
        typeof playersCount === "number" &&
        playersCount > 0 &&
        huntersCount >= playersCount
      ) {
        await roomRef.set({ state: "ended", endedAt: Date.now() }, { merge: true });
        return;
      }

      const roles = freshRoom.roles ?? room.roles ?? {};
      if (roles && Object.keys(roles).length > 0) {
        const playersCol = await db.collection(`rooms/${roomId}/players`).get();
        const total = playersCol.size;
        let hunters = 0;
        for (const uid of Object.keys(roles)) {
          if (roles[uid] === "hunter") hunters++;
        }
        if (total > 0 && hunters >= total) {
          await roomRef.set({ state: "ended", endedAt: Date.now() }, { merge: true });
          return;
        }
      }
    }
  }
});

export const setRoomOwner = onCall(async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Authentication required.');

  const { roomId, newOwnerUid } = (req.data ?? {}) as { roomId?: string; newOwnerUid?: string };
  if (!roomId || !newOwnerUid) throw new HttpsError('invalid-argument', 'roomId and newOwnerUid are required.');

  try {
    const res = await setRoomOwnerCore(getFirestore(), {
      roomId,
      newOwnerUid,
      isAdmin: auth.token?.admin === true,
    });
    return res;
  } catch (e: any) {
    const code = e?.code || 'internal';
    throw new HttpsError(code, e?.message ?? 'setRoomOwner failed');
  }
});

export { onIntent } from './move-intent.js';
