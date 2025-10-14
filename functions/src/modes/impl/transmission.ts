// functions/src/modes/impl/transmission.ts
import type { GameModeHandler } from "../types.js";
import { FieldValue } from "firebase-admin/firestore";

// Durées (ajuste librement)
const VICTIM_IFRAME_MS      = 1500; // nouveau chasseur protégé
const OLD_HUNTER_LOCK_MS    = 1200; // ancien chasseur ne peut pas retag instantanément
const NO_RETAG_MS           = 3000; // ⟵ NEW: interdiction de retaguer l'émetteur pendant X ms

const transmission: GameModeHandler = {
  async onTag({ db, matchId, hunterUid, victimUid, room, now, players }) {
    const roomRef   = db.doc(`rooms/${matchId}`);
    const hunterRef = db.doc(`rooms/${matchId}/players/${hunterUid}`);
    const victimRef = db.doc(`rooms/${matchId}/players/${victimUid}`);

    // Lecture (si non fournie en cache)
    const hunter = (players.get(hunterUid) || {}) as {
      iFrameUntilMs?: number;
      cantTagUntilMs?: number;
      noRetagUid?: string;
      noRetagUntilMs?: number;
    };
    const victim = (players.get(victimUid) || {}) as {
      iFrameUntilMs?: number;
    };

    // 0) garde: victime invulnérable ?
    if (victim.iFrameUntilMs && now < victim.iFrameUntilMs) return;

    // 1) garde: le chasseur est en lock global ?
    if (hunter.cantTagUntilMs && now < hunter.cantTagUntilMs) return;

    // 2) garde: règle SANS RETAG (directionnelle)
    // Si le chasseur actuel a un noRetag actif vers la victime -> on annule
    if (hunter.noRetagUid === victimUid && hunter.noRetagUntilMs && now < hunter.noRetagUntilMs) {
      return;
    }

    // 3) transmission: la victime devient chasseur, l'ancien chasseur devient chassé
    const roles: Record<string, "hunter" | "prey"> = { ...(room?.roles ?? {}) };
    for (const uid of Object.keys(roles)) if (roles[uid] === "hunter") roles[uid] = "prey";
    roles[victimUid] = "hunter";
    roles[hunterUid] = "prey";

    // 4) écritures atomiques
    await db.runTransaction(async (tx) => {
      // rafraîchir room
      const roomSnap = await tx.get(roomRef);
      void roomSnap; // (pas utilisé ici, mais OK)

      // nouveau chasseur (ex-victime) :
      // - iframe standard
      // - règle SANS RETAG: bloque la cible = "ancien chasseur" pendant NO_RETAG_MS
      tx.set(victimRef, {
        role: "hunter",
        iFrameUntilMs: now + VICTIM_IFRAME_MS,
        noRetagUid: hunterUid,                 // ⟵ NEW
        noRetagUntilMs: now + NO_RETAG_MS,     // ⟵ NEW
      }, { merge: true });

      // ancien chasseur :
      // - petit lock anti-retag global (confort UX)
      tx.set(hunterRef, {
        role: "prey",
        cantTagUntilMs: now + OLD_HUNTER_LOCK_MS,
        lastTagMs: now,
      }, { merge: true });

      // rôles de la room
      tx.set(roomRef, {
        roles,
        rolesUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  },
};

export default transmission;
