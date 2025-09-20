const VICTIM_IFRAME_MS = 1200;
const transmission = {
    async onTag({ db, matchId, hunterUid, victimUid, room, now, players }) {
        const v = (players.get(victimUid) || {});
        if (v.iFrameUntilMs && now < v.iFrameUntilMs)
            return; // évite ping-pong instantané
        const roles = { ...(room?.roles ?? {}) };
        for (const uid of Object.keys(roles)) {
            if (roles[uid] === "chasseur")
                roles[uid] = "chassé";
        }
        roles[hunterUid] = "chassé";
        roles[victimUid] = "chasseur";
        await Promise.all([
            db.doc(`rooms/${matchId}`).set({ roles }, { merge: true }),
            db.doc(`rooms/${matchId}/players/${victimUid}`).set({ iFrameUntilMs: now + VICTIM_IFRAME_MS }, { merge: true }),
        ]);
    },
};
export default transmission;
