// scripts/reset-room.mjs (ESM)
// Usage:
//   node scripts/reset-room.mjs <roomId> <hunterUid> <victimUid> [preserveMode=true|false] [preserveTarget=true|false]
//
// Exemples:
//   node scripts/reset-room.mjs test-123 H1 V1
//   node scripts/reset-room.mjs test-123 H1 V1 false false

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const [,, roomId, hunterUid, victimUid, preserveModeArg = "true", preserveTargetArg = "true"] = process.argv;

if (!roomId || !hunterUid || !victimUid) {
  console.error("Usage: node scripts/reset-room.mjs <roomId> <hunterUid> <victimUid> [preserveMode=true|false] [preserveTarget=true|false]");
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

async function deleteCollection(collRef, batchSize = 200) {
  while (true) {
    const snap = await collRef.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < batchSize) break;
  }
}

(async () => {
  console.log(`[reset-room] PROJECT=${projectId} EMU=${process.env.FIRESTORE_EMULATOR_HOST || "(none)"} ROOM=${roomId}`);

  const roomRef = db.doc(`rooms/${roomId}`);
  const room = (await roomRef.get()).data() || {};

  const preserveMode = preserveModeArg.toLowerCase() !== "false";
  const preserveTarget = preserveTargetArg.toLowerCase() !== "false";

  // 1) Purge des events (pour repartir propre)
  console.log("[reset-room] Deleting events…");
  await deleteCollection(db.collection(`rooms/${roomId}/events`));

  // 2) Reset scores de tous les joueurs existants
  console.log("[reset-room] Reset players score/flags…");
  const playersSnap = await db.collection(`rooms/${roomId}/players`).get();
  const batch = db.batch();
  playersSnap.forEach(doc => {
    batch.set(doc.ref, { score: 0, combo: FieldValue.delete(), lastTagMs: FieldValue.delete(), iFrameUntilMs: FieldValue.delete() }, { merge: true });
  });
  await batch.commit();

  // 3) Remettre les rôles de base (1 chasseur)
  const roles = { ...(room.roles || {}) };
  for (const k of Object.keys(roles)) roles[k] = "chassé";
  roles[hunterUid] = "chasseur";
  roles[victimUid] = "chassé";

  // 4) Reposer l’état de la room (state running, mode/target optionnels)
  const next = {
    state: "running",
    roles,
  };
  if (preserveMode && room.mode) next["mode"] = room.mode;
  if (preserveTarget && room.targetScore != null) next["targetScore"] = room.targetScore;

  await roomRef.set(next, { merge: true });

  console.log("[reset-room] room:", (await roomRef.get()).data());
  console.log("✅ Done.");
})().catch(e => (console.error(e), process.exit(1)));
