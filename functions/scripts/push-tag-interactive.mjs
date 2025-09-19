// scripts/push-tag-interactive.mjs
// Script interactif pour créer/mettre à jour une room, pousser des events "tag",
// et observer le score du chasseur. Conçu pour l'émulateur Firebase.
//
// Prérequis (dans un terminal où tournent les émulateurs):
//   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//   export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
//
// Lance: node scripts/push-tag-interactive.mjs

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ---- Init Admin SDK (ok sans creds en émulateur si projectId est défini)
const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "demo-tag-cartesien";

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

// ---- Helpers Firestore
async function ensureRoomAndPlayers(roomId, hunterUid, victimUid, targetScore) {
  const roomRef = db.doc(`rooms/${roomId}`);
  const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);
  const victimRef = db.doc(`rooms/${roomId}/players/${victimUid}`);

  // Room (création/MAJ targetScore)
  await db.runTransaction(async (tx) => {
    const rs = await tx.get(roomRef);
    if (!rs.exists) {
      tx.set(
        roomRef,
        {
          state: "idle",
          targetScore,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      tx.set(roomRef, { targetScore, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });

  // Players (création s'ils n’existent pas)
  await hunterRef.set({ displayName: "Hunter", score: 0 }, { merge: true });
  await victimRef.set({ displayName: "Victim", score: 0 }, { merge: true });
}

async function pushTagEvent(roomId, hunterUid, victimUid) {
  const evRef = db.collection(`rooms/${roomId}/events`).doc();
  await evRef.set({
    type: "tag",
    hunterUid,
    victimUid,
    ts: FieldValue.serverTimestamp(),
  });
  return evRef.id;
}

async function readStatus(roomId, hunterUid) {
  const roomRef = db.doc(`rooms/${roomId}`);
  const hunterRef = db.doc(`rooms/${roomId}/players/${hunterUid}`);

  const [roomSnap, hunterSnap] = await Promise.all([roomRef.get(), hunterRef.get()]);
  const room = roomSnap.data() || {};
  const hunter = hunterSnap.data() || {};
  return {
    roomState: room.state || "unknown",
    targetScore: room.targetScore ?? null,
    hunterScore: hunter.score || 0,
  };
}

// ---- UI (CLI)
function printStatus(status) {
  console.log(`\nÉtat après event:
  - room.state   : ${status.roomState}
  - targetScore  : ${status.targetScore}
  - hunter.score : ${status.hunterScore}\n`);
}

async function main() {
  // Sanity check émulateur
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.warn(
      "[!] FIRESTORE_EMULATOR_HOST n'est pas défini. Si tu utilises l'émulateur:\n" +
        "    export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080\n"
    );
  }

  const rl = readline.createInterface({ input, output });

  try {
    const roomId = (await rl.question("Room ID (ex: TEST123) : ")).trim() || "TEST123";
    const hunterUid = (await rl.question("Hunter UID (ex: u_hunter) : ")).trim() || "u_hunter";
    const victimUid = (await rl.question("Victim UID (ex: u_victim) : ")).trim() || "u_victim";
    const targetStr = (await rl.question("Target score (def=5) : ")).trim();
    const targetScore = Number.isFinite(Number(targetStr)) && targetStr !== "" ? Number(targetStr) : 5;

    console.log("\n→ Préparation de la room et des joueurs…");
    await ensureRoomAndPlayers(roomId, hunterUid, victimUid, targetScore);

    // Boucle d’actions
    while (true) {
      console.log(
        "\nChoisis une action:\n" +
          "  [1] Envoyer 1 event tag\n" +
          "  [2] Envoyer N events tag (rafale)\n" +
          "  [3] Voir l'état (sans envoyer)\n" +
          "  [4] Changer victimUid\n" +
          "  [q] Quitter\n"
      );

      const choice = (await rl.question("> ")).trim().toLowerCase();

      if (choice === "q") break;

      if (choice === "1") {
        console.log("→ Ajout d’un event 'tag'…");
        const id = await pushTagEvent(roomId, hunterUid, victimUid);
        console.log(`   Event créé: ${id}`);
        await new Promise((r) => setTimeout(r, 700)); // laisse la Function bosser
        const st = await readStatus(roomId, hunterUid);
        printStatus(st);
        if (st.roomState === "ended") {
          console.log("La manche est terminée (state=ended).");
        }
      } else if (choice === "2") {
        const nStr = (await rl.question("Combien d’events ? ")).trim();
        const n = Math.max(1, Math.min(1000, Number(nStr) || 1));
        const delayStr = (await rl.question("Délai (ms) entre events (def=150) ? ")).trim();
        const delay = Number.isFinite(Number(delayStr)) ? Number(delayStr) : 150;

        console.log(`→ Envoi de ${n} events avec ${delay} ms d’intervalle…`);
        for (let i = 0; i < n; i++) {
          await pushTagEvent(roomId, hunterUid, victimUid);
          await new Promise((r) => setTimeout(r, delay));
        }
        await new Promise((r) => setTimeout(r, 800));
        const st = await readStatus(roomId, hunterUid);
        printStatus(st);
        if (st.roomState === "ended") {
          console.log("La manche est terminée (state=ended).");
        }
      } else if (choice === "3") {
        const st = await readStatus(roomId, hunterUid);
        printStatus(st);
      } else if (choice === "4") {
        const newVictim = (await rl.question("Nouveau victimUid : ")).trim();
        if (newVictim) {
          console.log(`victimUid = ${newVictim}`);
          victimUid = newVictim;
        } else {
          console.log("Aucun changement.");
        }
      } else {
        console.log("Choix invalide.");
      }
    }

    console.log("\nBye 👋");
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
