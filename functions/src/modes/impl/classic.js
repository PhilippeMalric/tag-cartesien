// functions/src/modes/impl/classic.ts
import { FieldValue } from "firebase-admin/firestore";
const HUNTER_COOLDOWN_MS = 1200; // anti-spam chasseur
const VICTIM_IFRAME_MS = 2000; // invulnérabilité victime
const classic = {
    async onTag({ db, matchId, hunterUid, victimUid, now, players }) {
        const hunterRef = db.doc(`rooms/${matchId}/players/${hunterUid}`);
        const victimRef = db.doc(`rooms/${matchId}/players/${victimUid}`);
        // Utilise le cache 'players' si présent pour éviter 2 lectures
        const h = (players.get(hunterUid) || {});
        const v = (players.get(victimUid) || {});
        await db.runTransaction(async (tx) => {
            // Double-check lecture fraîche en transaction (robuste en cas de retard cache)
            const [hSnap, vSnap] = await Promise.all([tx.get(hunterRef), tx.get(victimRef)]);
            const hh = { ...h, ...(hSnap.data() || {}) };
            const vv = { ...v, ...(vSnap.data() || {}) };
            // 1) Victime invulnérable ?
            if (vv.iFrameUntilMs && now < vv.iFrameUntilMs)
                return;
            // 2) Cooldown chasseur ?
            if (hh.lastTagMs && now - hh.lastTagMs < HUNTER_COOLDOWN_MS)
                return;
            // 3) Mise à jour atomique
            tx.set(hunterRef, { score: FieldValue.increment(1), lastTagMs: now }, { merge: true });
            tx.set(victimRef, { iFrameUntilMs: now + VICTIM_IFRAME_MS }, { merge: true });
        });
    },
};
export default classic;
