// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { getModeHandler } from "./modes/factory.js"; // ← extension .js requise en NodeNext

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
 * → Résout le mode via la Factory et exécute son handler.
 * → Si mode "classic", on termine quand targetScore est atteint (parité avec avant).
 */
export const onTag = onDocumentCreated(
  "rooms/{roomId}/events/{eventId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as TagEventData;
    if (data?.type !== "tag") return;

    const roomId = event.params.roomId as string;
    const hunterUid = data.hunterUid as string;
    const victimUid = data.victimUid as string;

    const db = getFirestore();

    // Charger room + players pour le handler
    const roomRef = db.doc(`rooms/${roomId}`);
    const roomSnap = await roomRef.get();
    const room = roomSnap.data() ?? {};

    const playersQuery = await db.collection(`rooms/${roomId}/players`).get();
    const players = new Map<string, PlayerDoc>();
    playersQuery.forEach((d) => players.set(d.id, (d.data() || {}) as PlayerDoc));

    // Dispatcher vers le mode actif
    const handler = await getModeHandler(room.mode as any);
    await handler.onTag({
      matchId: roomId,
      hunterUid,
      victimUid,
      now: Date.now(),
      db,
      room,
      players,
    });

    // Parité: fin automatique en "classic" si target atteinte
    const modeName = (room?.mode ?? "classic") as string;
    if (modeName === "classic") {
      const refreshedRoomSnap = await roomRef.get();
      const refreshedRoom = refreshedRoomSnap.data() ?? {};
      const target =
        (refreshedRoom as { targetScore?: number }).targetScore ?? 5;

      const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);
      const hunterDoc = await hunterRef.get();
      const hunter = (hunterDoc.data() || {}) as PlayerDoc;
      const score = hunter.score ?? 0;

      if (score >= target) {
        await roomRef.set({ state: "ended" }, { merge: true });
      }
    }
  },
);
