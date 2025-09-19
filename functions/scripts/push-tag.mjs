// scripts/push-tag.mjs (ESM)
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [,, roomId, hunterUid, victimUid] = process.argv;
if (!roomId || !hunterUid || !victimUid) {
  console.error("Usage: node scripts/push-tag.mjs <roomId> <hunterUid> <victimUid>");
  process.exit(1);
}

// IMPORTANT: projectId arbitraire pour l’émulateur
initializeApp({ projectId: "demo-tag-cartesien" });

// si tu veux être explicite côté env (pas obligatoire si tu as lancé l’émulateur avec la CLI)
// process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const db = getFirestore();

async function main() {
  await db.doc(`rooms/${roomId}`).set({
    mode: "classic",
    targetScore: 3,
    state: "running",
    roles: { [hunterUid]: "chasseur", [victimUid]: "chassé" }
  }, { merge: true });

  await db.doc(`rooms/${roomId}/players/${hunterUid}`).set({ score: 0 }, { merge: true });
  await db.doc(`rooms/${roomId}/players/${victimUid}`).set({}, { merge: true });

  await db.collection(`rooms/${roomId}/events`).add({
    type: "tag",
    hunterUid,
    victimUid,
    x: 0, y: 0,
    ts: Date.now()
  });

  console.log("Tag event pushed");
}
main().catch(e => (console.error(e), process.exit(1)));
