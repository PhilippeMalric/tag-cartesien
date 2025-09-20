// functions/src/modes/impl/infection.ts
import { FieldValue } from "firebase-admin/firestore";
import type { GameModeHandler } from "../types.js";

/**
 * Mode "Infection"
 * - À chaque tag valide :
 *   - Le chasseur (hunter) gagne +1 point
 *   - La victime devient chasseur ("infectée")
 *   - Anti-spam: cooldown côté chasseur (évite les multi-tags instantanés)
 *   - iFrame: invulnérabilité courte de la victime après l'infection
 *
 * Convention de noms alignée avec les autres modes :
 * - lastTagMs      : timestamp (ms) du dernier tag réussi par ce joueur
 * - iFrameUntilMs  : invulnérabilité (ms) jusqu’à …
 */

const HUNTER_COOLDOWN_MS = 1000; // 1s entre deux tags validés par le même chasseur
const VICTIM_IFRAME_MS   = 1500; // 1.5s d’invulnérabilité pour la victime infectée

const infection: GameModeHandler = {
  async onTag({ db, matchId, hunterUid, victimUid, now, room, players }) {
    // Références utiles
    const roomRef   = db.doc(`rooms/${matchId}`);
    const hunterRef = db.doc(`rooms/${matchId}/players/${hunterUid}`);
    const victimRef = db.doc(`rooms/${matchId}/players/${victimUid}`);

    // Petits caches "best effort" (seront revalidés en transaction)
    const h = (players.get(hunterUid) || {}) as { lastTagMs?: number; role?: string };
    const v = (players.get(victimUid) || {}) as { iFrameUntilMs?: number; role?: string };

    await db.runTransaction(async (tx) => {
      // Lecture fraîche des joueurs en transaction (anti-course)
      const [hSnap, vSnap, roomSnap] = await Promise.all([
        tx.get(hunterRef),
        tx.get(victimRef),
        tx.get(roomRef),
      ]);

      const hh = { ...(hSnap.data() || {}), ...h } as { lastTagMs?: number; role?: string };
      const vv = { ...(vSnap.data() || {}), ...v } as { iFrameUntilMs?: number; role?: string };

      // 0) Si victime déjà invulnérable → ignorer
      if (vv.iFrameUntilMs && now < vv.iFrameUntilMs) return;

      // 1) Cooldown côté chasseur
      if (hh.lastTagMs && now - hh.lastTagMs < HUNTER_COOLDOWN_MS) return;

      // 2) Rôles actuels depuis la room
      const roomData = (roomSnap.data() || {}) as { roles?: Record<string, "chasseur" | "chassé" | string> };
      const roles: Record<string, "chasseur" | "chassé" | string> = { ...(roomData.roles || (room as any)?.roles || {}) };

      // Optionnel : si pas de rôles encore posés, on ne bloque pas mais on peut initialiser "soft"
      // (On ne force pas ici pour ne pas écraser un schéma de rôles existant côté client.)
      // On va seulement basculer la victime en chasseur.

      // 3) Mise à jour atomique :
      //    - +1 score pour le chasseur
      //    - lastTagMs pour le chasseur
      //    - iFrame pour la victime
      //    - passage de la victime en "chasseur" dans la map des rôles
      tx.set(
        hunterRef,
        { score: FieldValue.increment(1), lastTagMs: now },
        { merge: true }
      );
      tx.set(
        victimRef,
        { iFrameUntilMs: now + VICTIM_IFRAME_MS },
        { merge: true }
      );

      // Met à jour les rôles (la victime devient chasseur)
      if (Object.keys(roles).length > 0) {
        roles[victimUid] = "chasseur";
        // (On ne force pas le hunter à "chassé" ici : en infection, plusieurs chasseurs peuvent coexister)
        tx.set(roomRef, { roles }, { merge: true });
      } else {
        // Si la room n'avait pas encore de map roles, on crée minimalement l'entrée de la victime.
        tx.set(roomRef, { roles: { [victimUid]: "chasseur" } }, { merge: true });
      }
    });
  },
};

export default infection;
