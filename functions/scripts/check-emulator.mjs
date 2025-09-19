// scripts/check-emulator.mjs (ESM)
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const host = process.env.FIRESTORE_EMULATOR_HOST || "(not set)";
const projectId = process.env.GOOGLE_CLOUD_PROJECT || "demo-tag-cartesien";

console.log(`[check-emulator] FIRESTORE_EMULATOR_HOST=${host}`);
console.log(`[check-emulator] GOOGLE_CLOUD_PROJECT=${projectId}`);

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ FIRESTORE_EMULATOR_HOST n'est pas défini. Défini-le puis relance.");
  process.exit(2);
}

// En mode émulateur, pas d'identifiants nécessaires
initializeApp({ projectId });
const db = getFirestore();

(async () => {
  try {
    // petit write → read pour sanity check
    const ts = Date.now();
    const docRef = db.doc(`_emu_check/run_${ts}`);
    await docRef.set({ ok: true, ts });

    const got = (await docRef.get()).data();
    console.log("[check-emulator] write/read OK:", got);

    // liste la collection pour confirmer le host
    const colSnap = await db.collection("_emu_check").get();
    console.log("[check-emulator] docs in _emu_check:", colSnap.size);

    console.log("✅ Émulateur Firestore accessible.");
    process.exit(0);
  } catch (e) {
    console.error("❌ Échec d'accès à l'émulateur Firestore:");
    console.error(e);
    process.exit(1);
  }
})();
