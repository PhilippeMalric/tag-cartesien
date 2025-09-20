// functions/src/modes/impl/transmission.ts
import type { GameModeHandler } from "../types.js";

const VICTIM_IFRAME_MS = 1200;

const transmission: GameModeHandler = {
  async onTag({ db, matchId, hunterUid, victimUid, room, now, players }) {
    const v = (players.get(victimUid) || {}) as { iFrameUntilMs?: number };
    if (v.iFrameUntilMs && now < v.iFrameUntilMs) return; // évite ping-pong instantané

    const roles: Record<string, "chasseur" | "chassé"> = { ...(room?.roles ?? {}) };
    for (const uid of Object.keys(roles)) {
      if (roles[uid] === "chasseur") roles[uid] = "chassé";
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
