import type { GameModeHandler } from '../types';

const transmission: GameModeHandler = {
  async onTag({ db, matchId, hunterUid, victimUid, room }) {
    const roles: Record<string, 'chasseur' | 'chassé'> = { ...(room?.roles ?? {}) };
    // Garantir 1 seul chasseur
    for (const uid of Object.keys(roles)) {
      if (roles[uid] === 'chasseur') roles[uid] = 'chassé';
    }
    roles[hunterUid] = 'chassé';
    roles[victimUid] = 'chasseur';

    await db.doc(`rooms/${matchId}`).set({ roles }, { merge: true });
    await db.doc(`rooms/${matchId}/players/${victimUid}`).set(
      { lastBecameHunterAtMs: Date.now() },
      { merge: true }
    );
  },
};

export default transmission;
