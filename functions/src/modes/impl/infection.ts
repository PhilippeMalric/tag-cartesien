import { FieldValue } from 'firebase-admin/firestore';
import type { GameModeHandler } from '../types.js';

/**
 * Mode "infection" (Zombie Tag)
 * - Quand le chasseur tague une victime, la victime devient aussi "chasseur".
 * - On incrémente le "score" du chasseur (nb d'infections réalisées).
 * - On garantit qu'il y a >= 1 chasseur (jamais 0).
 * - Petite iframe côté victime pour éviter re-tag instantané.
 */
const infection: GameModeHandler = {
  async onTag({ db, matchId, hunterUid, victimUid, room, now }) {
    const roomRef = db.doc(`rooms/${matchId}`);
    const hunterRef = db.doc(`rooms/${matchId}/players/${hunterUid}`);
    const victimRef = db.doc(`rooms/${matchId}/players/${victimUid}`);

    // Rôles actuels
    const roles: Record<string, 'chasseur' | 'chassé'> = { ...(room?.roles ?? {}) };

    // 1) La victime devient chasseur
    roles[victimUid] = 'chasseur';

    // 2) (Optionnel) le chasseur reste chasseur (on force)
    roles[hunterUid] = 'chasseur';

    // 3) Persiste les rôles et l'iframe de la victime
    await Promise.all([
      roomRef.set({ roles }, { merge: true }),
      victimRef.set({ iFrameUntilMs: now + 1500 }, { merge: true }),
      // 4) Comptage des infections (score du chasseur = nb infections)
      hunterRef.set(
        { score: FieldValue.increment(1), lastTagAtMs: now },
        { merge: true }
      ),
    ]);
  },
};

export default infection;
