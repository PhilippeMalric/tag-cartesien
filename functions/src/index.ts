import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {setGlobalOptions} from "firebase-functions/v2";

admin.initializeApp();
setGlobalOptions({region: "northamerica-northeast1", maxInstances: 10});

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
 * Valide, incrémente le score, gère iFrame & combo, fin de partie.
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
    const huntersPath = `rooms/${roomId}/players/${hunterUid}`;
    const victimsPath = `rooms/${roomId}/players/${victimUid}`;

    const hunterRef = db.doc(huntersPath);
    const victimRef = db.doc(victimsPath);
    const roomRef = db.doc(`rooms/${roomId}`);

    await db.runTransaction(async (tx) => {
      const [hunterDoc, victimDoc, roomDoc] = await Promise.all([
        tx.get(hunterRef),
        tx.get(victimRef),
        tx.get(roomRef),
      ]);
      if (!hunterDoc.exists || !victimDoc.exists) return;

      const now = Date.now();
      const hunter = (hunterDoc.data() || {}) as PlayerDoc;
      const room = roomDoc.exists ? roomDoc.data() || {} : {};

      const score = hunter.score || 0;

      tx.update(hunterRef, {
        score: score + 1,
        lastTagMs: now,
      });

      // Invulnérabilité victime
      const IFR = 1500; // ms
      tx.update(victimRef, {
        iFrameUntilMs: now + IFR,
      });

      // Fin de partie si target atteinte
      const target = (room as {targetScore?: number}).targetScore || 5;
      if ((score +1) >= target) {
        tx.update(roomRef, {state: "ended"});
      }
    });
  },
);
