import { FieldValue } from 'firebase-admin/firestore';
import type { GameModeHandler } from '../types';

const classic: GameModeHandler = {
  async onTag({ db, matchId, hunterUid, victimUid, now }) {
    const hunterRef = db.doc(`rooms/${matchId}/players/${hunterUid}`);
    const victimRef = db.doc(`rooms/${matchId}/players/${victimUid}`);

    await hunterRef.set(
      { score: FieldValue.increment(1), lastTagAtMs: now },
      { merge: true }
    );
    await victimRef.set(
      { iFrameUntilMs: Date.now() + 2000 },
      { merge: true }
    );
  },
};

export default classic;
