// functions/src/modes/impl/classic.ts
import { FieldValue } from "firebase-admin/firestore";
import type { GameModeHandler } from "../types.js";

const HUNTER_COOLDOWN_MS = 100;  // anti-spam chasseur (cooldown global visible)
const VICTIM_IFRAME_MS   = 1200;  // invulnérabilité victime
const HUNTER_IFRAME_MS   = 800;   // courte invulnérabilité pour le chasseur (UI + anti-trade)

const classic: GameModeHandler = {
  async onTag({ db, matchId, hunterUid, victimUid, now, players }) {
    const hunterRef = db.doc(`rooms/${matchId}/players/${hunterUid}`);
    const victimRef = db.doc(`rooms/${matchId}/players/${victimUid}`);

    // types enrichis pour inclure cantTagUntilMs
    const h = (players.get(hunterUid) || {}) as {
      lastTagMs?: number;
      iFrameUntilMs?: number;
      cantTagUntilMs?: number;
    };
    const v = (players.get(victimUid) || {}) as {
      iFrameUntilMs?: number;
    };

    await db.runTransaction(async (tx) => {
      const [hSnap, vSnap] = await Promise.all([tx.get(hunterRef), tx.get(victimRef)]);
      const hh = {
        ...(hSnap.data() || {}),
        ...h,
      } as { lastTagMs?: number; iFrameUntilMs?: number; cantTagUntilMs?: number };
      const vv = {
        ...(vSnap.data() || {}),
        ...v,
      } as { iFrameUntilMs?: number };

      // 0) victime déjà invulnérable → ignorer
      if (vv.iFrameUntilMs && now < vv.iFrameUntilMs) return;

      // 1) cooldown chasseur (deadline explicite prioritaire, puis fallback lastTagMs)
      if ((hh.cantTagUntilMs && now < hh.cantTagUntilMs)
        || (hh.lastTagMs && now - hh.lastTagMs < HUNTER_COOLDOWN_MS)) {
        return;
      }

      // 2) mise à jour atomique
      tx.set(hunterRef, {
        score: FieldValue.increment(1),
        lastTagMs: now,
        iFrameUntilMs:  now + HUNTER_IFRAME_MS,      // iFrame courte côté chasseur
        cantTagUntilMs: now + HUNTER_COOLDOWN_MS,    // cooldown global visible
      }, { merge: true });

      tx.set(victimRef, {
        iFrameUntilMs: now + VICTIM_IFRAME_MS,       // invulnérabilité victime
      }, { merge: true });
    });
  },
};

export default classic;
