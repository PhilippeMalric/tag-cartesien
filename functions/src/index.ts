// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { getModeHandler } from "./modes/factory.js"; // ← NodeNext: extension .js requise

initializeApp();
setGlobalOptions({ region: "northamerica-northeast1", maxInstances: 10 });

type PlayerDoc = {
  score?: number;
  combo?: number;
  lastTagMs?: number;
  iFrameUntilMs?: number;
};

type TagEventData = {
  type?: string;
  hunterUid?: string;
  victimUid?: string;
};

/**
 * Déclenchée quand un event est créé dans rooms/{roomId}/events/{eventId}.
 * - Résout le mode via la Factory et exécute son handler.
 * - Idempotence via un marqueur _processed/score.
 * - En mode "classic", termine la room si targetScore atteinte.
 */
export const onTag = onDocumentCreated("rooms/{roomId}/events/{eventId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const data = snap.data() as TagEventData;
  if (data?.type !== "tag") return;

  const roomId = event.params.roomId as string;
  const hunterUid = data.hunterUid as string | undefined;
  const victimUid = data.victimUid as string | undefined;
  if (!roomId || !hunterUid || !victimUid) return;

  const db = getFirestore();
  const roomRef = db.doc(`rooms/${roomId}`);
  const eventRef = snap.ref; // rooms/{roomId}/events/{eventId}

  // ---------- Idempotence: skip si déjà traité ----------
  const markerRef = eventRef.collection("_processed").doc("score");
  const already = await markerRef.get();
  if (already.exists) return;

  // Charger room + players (une fois)
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};

  const playersQuery = await db.collection(`rooms/${roomId}/players`).get();
  const players = new Map<string, PlayerDoc>();
  playersQuery.forEach((d) => players.set(d.id, (d.data() || {}) as PlayerDoc));

  // Dispatcher vers le mode actif
  const handler = await getModeHandler((room as any).mode);
  await handler.onTag({
    matchId: roomId,
    hunterUid,
    victimUid,
    now: Date.now(),
    db,
    room,
    players,
  });

  // Marquer l'event comme traité (idempotence) — transaction = sérialisation douce
  await db.runTransaction(async (tx) => {
    const m = await tx.get(markerRef);
    if (!m.exists) {
      tx.set(markerRef, { at: FieldValue.serverTimestamp() }, { merge: true });
    }
  });

  // Parité: fin auto en mode "classic" si target atteinte
  const modeName = ((room as any)?.mode ?? "classic") as string;
  if (modeName === "classic") {
    const refreshedRoomSnap = await roomRef.get();
    const refreshedRoom = refreshedRoomSnap.data() ?? {};
    const target = (refreshedRoom as { targetScore?: number }).targetScore ?? 5;

    const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);
    const hunterDoc = await hunterRef.get();
    const hunter = (hunterDoc.data() || {}) as PlayerDoc;
    const score = hunter.score ?? 0;

    if (score >= target) {
      await roomRef.set({ state: "ended" }, { merge: true });
    }
  }
});
