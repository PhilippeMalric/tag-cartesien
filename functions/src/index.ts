// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { handlers } from "./modes";

// -----------------------------------------------------------------------------
// Initialisation
// -----------------------------------------------------------------------------
initializeApp();
setGlobalOptions({
  region: "northamerica-northeast1",
  maxInstances: 10,
});

// -----------------------------------------------------------------------------
// Types utilitaires
// -----------------------------------------------------------------------------
type PlayerDoc = {
  score?: number;
  combo?: number;
  lastTagMs?: number;
  iFrameUntilMs?: number;
  role?: "chasseur" | "chassé" | string;
};

type RoomDoc = {
  mode?: "classic" | "transmission" | "infection" | string;
  targetScore?: number;            // classic
  // Infection
  victory?: "all_infected" | "target_infections";
  infectionTarget?: number;        // si target_infections
  roles?: Record<string, string>;
  huntersCount?: number;           // optionnel (variante optimisée)
  playersCount?: number;           // optionnel (variante optimisée)
  state?: "idle" | "running" | "ended" | "done";
};

type TagEventData = {
  type?: string;
  hunterUid?: string;
  victimUid?: string;
  x?: number;
  y?: number;
};

// -----------------------------------------------------------------------------
// Trigger principal : création d'un event → traitement du tag
// -----------------------------------------------------------------------------
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
  const eventRef = snap.ref;

  // ---------------------------------------------------------------------------
  // Idempotence : réserver le traitement AVANT tout (évite doubles exécutions)
  // ---------------------------------------------------------------------------
  const markerRef = eventRef.collection("_processed").doc("score");
  const claimed = await db.runTransaction(async (tx) => {
    const m = await tx.get(markerRef);
    if (m.exists) return false; // déjà traité par une autre instance
    tx.set(markerRef, { at: FieldValue.serverTimestamp() }, { merge: true });
    return true;                // réservé
  });
  if (!claimed) return;

  // ---------------------------------------------------------------------------
  // Chargements nécessaires
  // ---------------------------------------------------------------------------
  const roomSnap = await roomRef.get();
  const room = (roomSnap.data() || {}) as RoomDoc;
  const modeName = (room.mode ?? "classic") as NonNullable<RoomDoc["mode"]>;

  // Cache "best effort" des joueurs (les handlers revalideront en transaction)
  const playersSnap = await db.collection(`rooms/${roomId}/players`).get();
  const players = new Map<string, PlayerDoc>();
  playersSnap.forEach((d) => players.set(d.id, (d.data() || {}) as PlayerDoc));

  // ---------------------------------------------------------------------------
  // Dispatch vers le handler du mode
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Conditions de fin de manche selon le mode
  // ---------------------------------------------------------------------------

  // 1) CLASSIC : fin quand le score du chasseur atteint targetScore
  if (modeName === "classic") {
    const target = room.targetScore ?? 5;
    if (target > 0) {
      const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);
      const hunterDoc = await hunterRef.get();
      const h = (hunterDoc.data() || {}) as PlayerDoc;
      const score = h.score ?? 0;
      if (score >= target) {
        await roomRef.set({ state: "ended", endedAt: Date.now() }, { merge: true });
        return;
      }
    }
  }

  // 2) INFECTION : deux variantes
  if (modeName === "infection") {
    const victory = room.victory ?? "all_infected";

    // 2a) target_infections : fin si le chasseur atteint infectionTarget
    if (victory === "target_infections") {
      const target = room.infectionTarget ?? 10;
      if (target > 0) {
        const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);
        const hunterDoc = await hunterRef.get();
        const h = (hunterDoc.data() || {}) as PlayerDoc;
        const score = h.score ?? 0;
        if (score >= target) {
          await roomRef.set({ state: "ended", endedAt: Date.now() }, { merge: true });
          return;
        }
      }
    } else {
      // 2b) all_infected : fin si tous les joueurs sont "chasseur"
      // Variante optimisée : si room maintient huntersCount/playersCount
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

      // Fallback : compter via roles + nombre de docs players
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

  // 3) TRANSMISSION : pas de condition de fin par défaut (à définir si besoin)
});
