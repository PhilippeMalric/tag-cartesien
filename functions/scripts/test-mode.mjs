// scripts/test-mode.mjs (ESM, verbose)
// Usage:
//   node scripts/test-mode.mjs <roomId> <mode> <hunterUid> <victimUid> [targetScore]
// Exemples :
//   node scripts/test-mode.mjs test-123 classic H1 V1 3
//   node scripts/test-mode.mjs test-tx transmission H1 V1
//   node scripts/test-mode.mjs test-z infection H1 V1

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const [roomId, mode, hunterUid, victimUid, targetScoreArg] = args;

function usage() {
  console.error("❌ Usage: node scripts/test-mode.mjs <roomId> <mode> <hunterUid> <victimUid> [targetScore]");
  console.error("   Modes supportés: classic | transmission | infection");
}

if (!roomId || !mode || !hunterUid || !victimUid) {
  usage();
  process.exit(2);
}

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "demo-tag-cartesien";

const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const log = (...m) => console.log("[test-mode]", ...m);
const step = (name) => {
  console.log("");
  console.log("────────────────────────────────────────────────────────");
  console.log("▶", name);
  console.log("────────────────────────────────────────────────────────");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  step("Contexte & ENV");
  log("Node:", process.version);
  log("PROJECT:", projectId);
  log("FIRESTORE_EMULATOR_HOST:", process.env.FIRESTORE_EMULATOR_HOST || "(none)");
  log("GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS || "(none)");
  log("Args:", { roomId, mode, hunterUid, victimUid, targetScoreArg });

  step("Initialisation Admin SDK");
  if (usingEmulator) {
    log("→ Mode ÉMULATEUR (pas d'identifiants requis)");
    initializeApp({ projectId });
  } else {
    log("→ Mode PROD (ADC requis: Service Account ou `gcloud auth application-default login`)");
    initializeApp({ projectId, credential: applicationDefault() });
  }
  const db = getFirestore();
  log("Firestore OK");

  step("Préparation room + players");
  console.time("write:room+players");
  const roomRef = db.doc(`rooms/${roomId}`);
  const base = { mode, state: "running" };
  const targetScore = Number.isFinite(Number(targetScoreArg)) ? Number(targetScoreArg) : undefined;
  if (targetScore != null) base["targetScore"] = targetScore;

  const roles = { [hunterUid]: "chasseur", [victimUid]: "chassé" };

  await roomRef.set(base, { merge: true });
  await roomRef.set({ roles }, { merge: true });
  await db.doc(`rooms/${roomId}/players/${hunterUid}`).set({ score: 0 }, { merge: true });
  await db.doc(`rooms/${roomId}/players/${victimUid}`).set({}, { merge: true });
  console.timeEnd("write:room+players");
  log("room doc:", `rooms/${roomId}`);
  log("players:", [`players/${hunterUid}`, `players/${victimUid}`]);

  step("Création de l'event tag");
  console.time("write:event");
  const evRef = await db.collection(`rooms/${roomId}/events`).add({
    type: "tag",
    hunterUid,
    victimUid,
    x: 0,
    y: 0,
    ts: Date.now(),
  });
  console.timeEnd("write:event");
  log("event id:", evRef.id);

  // Laisse le temps à la Function onTag (émulateur) de tourner
  step("Attente traitement Function (400ms)");
  await sleep(400);

  step("Relecture (room, players, events)");
  console.time("read:state");
  const [roomSnap, hunterDoc, victimDoc, eventsSnap] = await Promise.all([
    db.doc(`rooms/${roomId}`).get(),
    db.doc(`rooms/${roomId}/players/${hunterUid}`).get(),
    db.doc(`rooms/${roomId}/players/${victimUid}`).get(),
    db.collection(`rooms/${roomId}/events`).get(),
  ]);
  console.timeEnd("read:state");

  const room = roomSnap.data() || {};
  const hunter = hunterDoc.data() || {};
  const victim = victimDoc.data() || {};
  const eventsCount = eventsSnap.size;

  log("ROOM:", JSON.stringify(room, null, 2));
  log(`HUNTER (${hunterUid}):`, JSON.stringify(hunter, null, 2));
  log(`VICTIM (${victimUid}):`, JSON.stringify(victim, null, 2));
  log("EVENTS COUNT:", eventsCount);

  console.log("");
  console.log("✅ Test terminé.");
  process.exit(0);
}

main().catch((e) => {
  console.error("");
  console.error("❌ ERREUR:");
  console.error(e && e.stack ? e.stack : e);
  console.error("");
  if (!usingEmulator) {
    console.error("ℹ️ Astuce: pour l'émulateur, exporte:");
    console.error('   set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (Windows PowerShell: $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080")');
    console.error('   set GOOGLE_CLOUD_PROJECT=demo-tag-cartesien (PowerShell: $env:GOOGLE_CLOUD_PROJECT="demo-tag-cartesien")');
  }
  process.exit(1);
});
