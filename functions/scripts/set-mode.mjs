// scripts/set-mode.mjs (ESM)
// Usage:
//   node scripts/set-mode.mjs <roomId> <mode> <hunterUid> <victimUid> [targetScore]
//
// Exemples:
//   node scripts/set-mode.mjs test-123 classic H1 V1 5
//   node scripts/set-mode.mjs test-123 transmission H1 V1
//   node scripts/set-mode.mjs test-123 infection H1 V1

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [,, roomId, mode, hunterUid, victimUid, targetScoreArg] = process.argv;

if (!roomId || !mode || !hunterUid || !victimUid) {
  console.error("Usage: node scripts/set-mode.mjs <roomId> <mode> <hunterUid> <victimUid> [targetScore]");
  process.exit(2);
}

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "demo-tag-cartesien";

const usingEmu = !!process.env.FIRESTORE_EMULATOR_HOST;

if (usingEmu) {
  initializeApp({ projectId });
} else {
  initializeApp({ projectId, credential: applicationDefault() });
}

const db = getFirestore();

(async () => {
  console.log(`[set-mode] PROJECT=${projectId} EMU=${process.env.FIRESTORE_EMULATOR_HOST || "(none)"} MODE=${mode}`);

  const targetScore = Number.isFinite(Number(targetScoreArg)) ? Number(targetScoreArg) : undefined;

  const roomRef = db.doc(`rooms/${roomId}`);
  const base = { mode, state: "running" };
  if (targetScore != null) base["targetScore"] = targetScore;

  // Pose le mode / targetScore
  await roomRef.set(base, { merge: true });

  // Pose les rôles de départ
  const roles = { [hunterUid]: "chasseur", [victimUid]: "chassé" };
  await roomRef.set({ roles }, { merge: true });

  // Prépare les players
  await db.doc(`rooms/${roomId}/players/${hunterUid}`).set({ score: 0 }, { merge: true });
  await db.doc(`rooms/${roomId}/players/${victimUid}`).set({}, { merge: true });

  const snap = await roomRef.get();
  console.log("[set-mode] room:", snap.data());

  console.log("✅ Done.");
})().catch(e => (console.error(e), process.exit(1)));
