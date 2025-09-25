// functions/src/modes/impl/classic.ts
import { FieldValue } from "firebase-admin/firestore";
const HUNTER_COOLDOWN_MS = 1200; // anti-spam chasseur
const VICTIM_IFRAME_MS = 1200; // invulnérabilité victime
const HUNTER_IFRAME_MS = 800; // 🔸 NEW: courte invulnérabilité pour le chasseur (UI + anti-trade)
const classic = {
    async onTag({ db, matchId, hunterUid, victimUid, now, players }) {
        const hunterRef = db.doc(`rooms/${matchId}/players/${hunterUid}`);
        const victimRef = db.doc(`rooms/${matchId}/players/${victimUid}`);
        const h = (players.get(hunterUid) || {});
        const v = (players.get(victimUid) || {});
        await db.runTransaction(async (tx) => {
            const [hSnap, vSnap] = await Promise.all([tx.get(hunterRef), tx.get(victimRef)]);
            const hh = { ...(hSnap.data() || {}), ...h };
            const vv = { ...(vSnap.data() || {}), ...v };
            // 0) victime déjà invulnérable → ignorer
            if (vv.iFrameUntilMs && now < vv.iFrameUntilMs)
                return;
            // 1) cooldown chasseur
            if (hh.lastTagMs && now - hh.lastTagMs < HUNTER_COOLDOWN_MS)
                return;
            // 2) mise à jour atomique
            tx.set(hunterRef, {
                score: FieldValue.increment(1),
                lastTagMs: now,
                iFrameUntilMs: now + HUNTER_IFRAME_MS, // 🔸 NEW
            }, { merge: true });
            tx.set(victimRef, {
                iFrameUntilMs: now + VICTIM_IFRAME_MS,
            }, { merge: true });
        });
    },
};
export default classic;
