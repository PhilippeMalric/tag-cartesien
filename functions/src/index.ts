// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { handlers } from "./modes/index.js";
import { removePlayerCore, cleanRoomAfterPlayerRemoval } from "./lib/players.js";

initializeApp();
setGlobalOptions({ region: "northamerica-northeast1", maxInstances: 10 });

const db = getFirestore();

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

/** Ton trigger onTag existant (inchangé) */
type PlayerDoc = {
  score?: number;
  combo?: number;
  lastTagMs?: number;
  iFrameUntilMs?: number;
  role?: "chasseur" | "chassé" | string;
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
type TagEventData = {
  type?: string;
  hunterUid?: string;
  victimUid?: string;
  x?: number;
  y?: number;
};

export const onTag = onDocumentCreated("rooms/{roomId}/events/{eventId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const data = snap.data() as TagEventData;
  if (data?.type !== "tag") return;

  const roomId = event.params.roomId as string;
  const hunterUid = data.hunterUid as string | undefined;
  const victimUid = data.victimUid as string | undefined;
  if (!roomId || !hunterUid || !victimUid) return;

  const roomRef = db.doc(`rooms/${roomId}`);
  const eventRef = snap.ref;

  // Idempotence
  const markerRef = eventRef.collection("_processed").doc("score");
  const claimed = await db.runTransaction(async (tx) => {
    const m = await tx.get(markerRef);
    if (m.exists) return false;
    tx.set(markerRef, { at: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!claimed) return;

  // Chargements
  const roomSnap = await roomRef.get();
  const room = (roomSnap.data() || {}) as RoomDoc;
  const modeName = (room.mode ?? "classic") as NonNullable<RoomDoc["mode"]>;

  const playersSnap = await db.collection(`rooms/${roomId}/players`).get();
  const players = new Map<string, PlayerDoc>();
  playersSnap.forEach((d) => players.set(d.id, (d.data() || {}) as PlayerDoc));

  // Dispatch mode
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

  // Conditions de fin
  if (modeName === "classic") {
    const target = room.targetScore ?? 5;
    if (target > 0) {
      const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);
      const hunterDoc = await hunterRef.get();
      const h = (hunterDoc.data() || {}) as PlayerDoc;
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
        const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);
        const hunterDoc = await hunterRef.get();
        const h = (hunterDoc.data() || {}) as PlayerDoc;
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
          if (roles[uid] === "chasseur") hunters++;
        }
        if (total > 0 && hunters >= total) {
          await roomRef.set({ state: "ended", endedAt: Date.now() }, { merge: true });
          return;
        }
      }
    }
  }
});
