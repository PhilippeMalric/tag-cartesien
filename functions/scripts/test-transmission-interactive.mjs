#!/usr/bin/env node
// scripts/launch-game.mjs
// Choix room → mode → chasseur → démarrer la partie
// + Menu de test: lire l'état, émettre TAG, rafales, stop, etc.
//
// Prérequis (émulateur conseillé):
//   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//   export GOOGLE_CLOUD_PROJECT=demo-luniver
//
// Exécution:
//   node scripts/launch-game.mjs

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "tag-cartesien";

const usingEmu = !!process.env.FIRESTORE_EMULATOR_HOST;
if (usingEmu) initializeApp({ projectId: PROJECT_ID });
else initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });

const db = getFirestore();

// ———————————————————————————————————————————————————————————
// CLI utils
const rl = readline.createInterface({ input, output });
async function ask(q, def = "") {
  const v = (await rl.question(`${q}${def ? ` [${def}]` : ""}: `)).trim();
  return v || def;
}
async function choose(title, options, defIndex = 0) {
  if (!options.length) throw new Error(`${title}: aucune option`);
  console.log(`\n${title}`);
  options.forEach((opt, i) => {
    const label = typeof opt === "string" ? opt : opt.label ?? opt.id ?? String(opt);
    console.log(`  ${i + 1}. ${label}`);
  });
  let idx;
  while (true) {
    const s = await ask("> Choix (numéro)", String(defIndex + 1));
    idx = Number(s) - 1;
    if (!Number.isNaN(idx) && idx >= 0 && idx < options.length) break;
    console.log("Choix invalide.");
  }
  return options[idx];
}

// ———————————————————————————————————————————————————————————
// Data helpers
async function listRooms(limit = 50) {
  const snap = await db.collection("rooms").orderBy("updatedAt", "desc").limit(limit).get().catch(async () => {
    return await db.collection("rooms").limit(limit).get();
  });
  const rooms = [];
  snap.forEach((d) => rooms.push({ id: d.id, ...d.data() }));
  return rooms;
}
async function listPlayers(roomId) {
  const snap = await db.collection(`rooms/${roomId}/players`).get();
  const players = [];
  snap.forEach((d) => players.push({ id: d.id, ...d.data() }));
  return players;
}
async function readRoom(roomId) {
  const snap = await db.doc(`rooms/${roomId}`).get();
  return snap.data() || {};
}
async function setMode(roomId, mode) {
  await db.doc(`rooms/${roomId}`).set(
    { mode, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
async function setStateRunning(roomId) {
  await db.doc(`rooms/${roomId}`).set(
    { state: "running", startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
async function setStateStopped(roomId) {
  await db.doc(`rooms/${roomId}`).set(
    { state: "stopped", stoppedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
async function setRoles(roomId, hunterUid, players) {
  const rolesMap = {};
  for (const p of players) rolesMap[p.id] = (p.id === hunterUid ? "chasseur" : "chassé");
  const batch = db.batch();
  batch.set(db.doc(`rooms/${roomId}`), { roles: rolesMap, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  for (const p of players) {
    batch.set(db.doc(`rooms/${roomId}/players/${p.id}`), { role: rolesMap[p.id] }, { merge: true });
  }
  await batch.commit();
  return rolesMap;
}
async function resetEvents(roomId) {
  const coll = db.collection(`rooms/${roomId}/events`);
  while (true) {
    const snap = await coll.limit(300).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < 300) break;
  }
}
async function maybeResetScores(roomId, players, doReset) {
  if (!doReset) return;
  const batch = db.batch();
  for (const p of players) {
    batch.set(db.doc(`rooms/${roomId}/players/${p.id}`),
      { score: 0, iFrameUntilMs: 0, lastTagMs: 0 }, { merge: true });
  }
  await batch.commit();
}
async function emitStartEvent(roomId, mode, meta = {}) {
  await db.collection(`rooms/${roomId}/events`).add({
    type: "start",
    mode,
    meta,
    ts: FieldValue.serverTimestamp(),
  });
}
function currentHunter(roles = {}) {
  return Object.entries(roles).find(([, r]) => r === "chasseur")?.[0] || null;
}
function printState(room, players) {
  console.log("\n— ÉTAT —");
  console.log("mode :", room.mode);
  console.log("state:", room.state);
  console.log("roles:", room.roles || {});
  console.log("players:");
  for (const p of players) {
    console.log(`  - ${p.id}: { role=${p.role ?? "?"}, score=${p.score ?? 0} }`);
  }
  console.log("——————\n");
}

// ———————————————————————————————————————————————————————————
// TAG helpers (mécanique)
async function pushTag(roomId, hunterUid, victimUid, x = 0, y = 0) {
  await db.collection(`rooms/${roomId}/events`).add({
    type: "tag",
    hunterUid, victimUid, x, y,
    ts: FieldValue.serverTimestamp(),
  });
}
async function expectSwapAfterTag(roomId, prevHunter, prevVictim, waitMs = 700) {
  await new Promise((r) => setTimeout(r, waitMs)); // laisse la logique côté app/CF se propager
  const room = await readRoom(roomId);
  const roles = room.roles || {};
  const ok =
    roles[prevVictim] === "chasseur" &&
    roles[prevHunter] === "chassé";
  return { ok, room };
}

// ———————————————————————————————————————————————————————————
const MODES = ["classic", "transmission", "infection", "custom"];

async function main() {
  console.log("== LANCEUR DE PARTIE + TEST TAGS ==");
  console.log("ENV:");
  console.log("  PROJECT_ID               :", PROJECT_ID);
  console.log("  FIRESTORE_EMULATOR_HOST  :", process.env.FIRESTORE_EMULATOR_HOST || "(none)");
  console.log("");

  // 1) Room
  const rooms = await listRooms(50);
  if (!rooms.length) {
    console.log("Aucune room trouvée. Crée une room dans l’app.");
    process.exit(2);
  }
  const roomChoice = await choose("Sélectionne une room :", rooms.map(r => ({
    id: r.id,
    label: `${r.id}  ${r.mode ? `(${r.mode})` : ""}  ${r.state ? `- ${r.state}` : ""}`
  })));
  const roomId = roomChoice.id;

  // 2) Players & chasseur
  let players = await listPlayers(roomId);
  if (!players.length) {
    console.log("Cette room n’a pas de joueurs.");
    process.exit(3);
  }
  const hunterChoice = await choose("Choisis le chasseur :", players.map(p => ({
    id: p.id,
    label: `${p.id}${p.role ? ` (role: ${p.role})` : ""}${Number.isFinite(p.score) ? ` - score:${p.score}` : ""}`
  })));
  let hunterUid = hunterChoice.id;

  // 3) Mode
  const mode = (await choose("Choisis le mode :", MODES)).toString();

  // 4) Options
  console.log("\nOptions :");
  const resetEv = (await ask("→ Reset events avant démarrage ? (y/n)", "n")).toLowerCase().startsWith("y");
  const resetSc = (await ask("→ Reset scores/iframe/lastTag ? (y/n)", "n")).toLowerCase().startsWith("y");
  const targetScoreStr = await ask("→ Score cible (optionnel, vide = ignore)", "");
  const targetScore = targetScoreStr ? Number(targetScoreStr) : undefined;

  // 5) Setup
  if (resetEv) { console.log("• Reset events…"); await resetEvents(roomId); }
  if (resetSc) { console.log("• Reset scores…"); await maybeResetScores(roomId, players, true); }

  console.log(`• Applique mode=${mode}…`); await setMode(roomId, mode);
  console.log(`• Définit les rôles (chasseur=${hunterUid})…`);
  await setRoles(roomId, hunterUid, players);
  if (Number.isFinite(targetScore)) {
    await db.doc(`rooms/${roomId}`).set({ targetScore, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  console.log("• Passe state=running…"); await setStateRunning(roomId);
  console.log("• Event start…"); await emitStartEvent(roomId, mode, { targetScore });

  players = await listPlayers(roomId); // refresh
  let room = await readRoom(roomId);
  printState(room, players);

  // ———————————— MENU TAG / TEST ————————————
  while (true) {
    console.log(
      "Actions :\n" +
      "  [1] Lire l’état (room + players)\n" +
      "  [2] TAG (hunter→victim) avec swap attendu (utile pour transmission)\n" +
      "  [3] Rafale de N TAGs (rotation des victimes)\n" +
      "  [4] Changer de chasseur manuellement\n" +
      "  [5] Stopper la partie (state=stopped)\n" +
      "  [q] Quitter\n"
    );
    const c = (await ask("> ")).toLowerCase();

    if (c === "q") break;

    if (c === "1") {
      players = await listPlayers(roomId);
      room = await readRoom(roomId);
      printState(room, players);

    } else if (c === "2") {
      // TAG interactif
      room = await readRoom(roomId);
      const roles = room.roles || {};
      const current = currentHunter(roles) || hunterUid;
      const victimList = players.filter(p => p.id !== current);
      if (!victimList.length) { console.log("Pas de victime disponible."); continue; }

      const victimChoice = await choose("Choisir la victime :", victimList.map(v => ({ id: v.id, label: v.id })));
      const victimUid = victimChoice.id;

      const x = Number(await ask("x (entier, def 0)", "0")) || 0;
      const y = Number(await ask("y (entier, def 0)", "0")) || 0;
      const waitMs = Number(await ask("Attente après TAG (ms, def 700)", "700")) || 700;

      console.log(`→ TAG: ${current} → ${victimUid} @ (${x},${y})`);
      await pushTag(roomId, current, victimUid, x, y);

      const { ok, room: roomAfter } = await expectSwapAfterTag(roomId, current, victimUid, waitMs);
      const rolesAfter = roomAfter.roles || {};
      console.log("roles après TAG:", rolesAfter);
      if (ok) {
        console.log("✅ Swap détecté (transmission): la victime est devenue chasseur.");
        hunterUid = victimUid; // maj chasseur courant local
      } else {
        console.log("ℹ️ Pas de swap (mode classic ?) ou logique côté app non déclenchée.");
      }

    } else if (c === "3") {
      // Rafale N tags : le chasseur tague successivement les autres joueurs
      const n = Number(await ask("Combien de TAGs ? (def 5)", "5")) || 5;
      const waitMs = Number(await ask("Attente entre TAGs (ms, def 600)", "600")) || 600;
      let current = hunterUid;

      for (let i = 0; i < n; i++) {
        room = await readRoom(roomId);
        players = await listPlayers(roomId);
        const others = players.filter(p => p.id !== current);
        if (!others.length) { console.log("Pas d'autres joueurs."); break; }
        // choisit une victime “tournante”
        const victimUid = others[i % others.length].id;

        console.log(`→ [${i + 1}/${n}] TAG: ${current} → ${victimUid}`);
        await pushTag(roomId, current, victimUid, 0, 0);

        const { ok } = await expectSwapAfterTag(roomId, current, victimUid, waitMs);
        if (ok) {
          current = victimUid; // en transmission, le chasseur devient la victime
          hunterUid = current;
          console.log("   ✅ swap OK");
        } else {
          console.log("   ℹ️ pas de swap (classic ?)");
        }
      }
      console.log("Rafale terminée.");

    } else if (c === "4") {
      // Changer de chasseur manuellement
      players = await listPlayers(roomId);
      const pick = await choose("Nouveau chasseur :", players.map(p => ({ id: p.id, label: p.id })));
      hunterUid = pick.id;
      await setRoles(roomId, hunterUid, players);
      room = await readRoom(roomId);
      console.log("Nouveau hunter =", hunterUid);
      printState(room, players);

    } else if (c === "5") {
      await setStateStopped(roomId);
      room = await readRoom(roomId);
      console.log("Partie stoppée.");
      printState(room, players);

    } else {
      console.log("Choix invalide.");
    }
  }

  rl.close();
  console.log("\nBye 👋");
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});
