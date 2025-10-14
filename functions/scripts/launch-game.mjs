#!/usr/bin/env node
// Choix room → mode → chasseur → démarrer + menu TAG/tests

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ——— Init
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "tag-cartesien";
const usingEmu = !!process.env.FIRESTORE_EMULATOR_HOST;
if (usingEmu) initializeApp({ projectId: PROJECT_ID });
else initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });
const db = getFirestore();

// ——— Helpers timeout + ping
function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms (${label})`)), ms)
    ),
  ]);
}
async function pingFirestore(db, timeoutMs = 800) {
  try { await withTimeout(db.collection("_ping").limit(1).get(), timeoutMs, "firestore ping"); return { ok: true }; }
  catch (e) { return { ok: false, detail: e?.message || String(e) }; }
}

// ——— CLI utils
const rl = readline.createInterface({ input, output });
async function ask(q, def = "") { const v = (await rl.question(`${q}${def ? ` [${def}]` : ""}: `)).trim(); return v || def; }
async function choose(title, options, defIndex = 0) {
  if (!options.length) throw new Error(`${title}: aucune option`);
  console.log(`\n${title}`); options.forEach((opt, i) => {
    const label = typeof opt === "string" ? opt : opt.label ?? opt.id ?? String(opt);
    console.log(`  ${i + 1}. ${label}`);
  });
  let idx; while (true) { const s = await ask("> Choix (numéro)", String(defIndex + 1));
    idx = Number(s) - 1; if (!Number.isNaN(idx) && idx >= 0 && idx < options.length) break; console.log("Choix invalide."); }
  return options[idx];
}

// ——— Data helpers
async function listRooms(limit = 50, timeoutMs = 3000) {
  const roomsCol = db.collection("rooms");
  try {
    const q = roomsCol.orderBy("updatedAt", "desc").limit(limit);
    const snap = await withTimeout(q.get(), timeoutMs, "rooms orderBy(updatedAt)");
    const out = []; snap.forEach(d => out.push({ id: d.id, ...d.data() })); return out;
  } catch (e) { console.warn("[listRooms] fallback sans orderBy(updatedAt):", e?.message || e); }
  const snap2 = await withTimeout(roomsCol.limit(limit).get(), timeoutMs, "rooms limit() fallback");
  const out2 = []; snap2.forEach(d => out2.push({ id: d.id, ...d.data() }));
  out2.sort((a, b) => {
    const ta = a.updatedAt?.toMillis?.() ?? 0; const tb = b.updatedAt?.toMillis?.() ?? 0;
    if (tb !== ta) return tb - ta; return a.id.localeCompare(b.id);
  });
  return out2;
}
async function listPlayers(roomId) { const snap = await db.collection(`rooms/${roomId}/players`).get(); const ps = []; snap.forEach(d => ps.push({ id: d.id, ...d.data() })); return ps; }
async function readRoom(roomId) { const s = await db.doc(`rooms/${roomId}`).get(); return s.data() || {}; }
async function setMode(roomId, mode) { await db.doc(`rooms/${roomId}`).set({ mode, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }
async function setStateRunning(roomId) { await db.doc(`rooms/${roomId}`).set({ state: "running", startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }
async function setStateStopped(roomId) { await db.doc(`rooms/${roomId}`).set({ state: "stopped", stoppedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }
async function setRoles(roomId, hunterUid, players) {
  const rolesMap = {}; for (const p of players) rolesMap[p.id] = (p.id === hunterUid ? "hunter" : "prey");
  const batch = db.batch();
  batch.set(db.doc(`rooms/${roomId}`), { roles: rolesMap, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  for (const p of players) batch.set(db.doc(`rooms/${roomId}/players/${p.id}`), { role: rolesMap[p.id] }, { merge: true });
  await batch.commit(); return rolesMap;
}
async function resetEvents(roomId) { const coll = db.collection(`rooms/${roomId}/events`);
  while (true) { const snap = await coll.limit(300).get(); if (snap.empty) break;
    const batch = db.batch(); snap.docs.forEach(d => batch.delete(d.ref)); await batch.commit();
    if (snap.size < 300) break; } }
async function maybeResetScores(roomId, players, doReset) {
  if (!doReset) return; const batch = db.batch();
  for (const p of players) batch.set(db.doc(`rooms/${roomId}/players/${p.id}`), { score: 0, iFrameUntilMs: 0, lastTagMs: 0 }, { merge: true });
  await batch.commit();
}
async function emitStartEvent(roomId, mode, meta = {}) { await db.collection(`rooms/${roomId}/events`).add({ type: "start", mode, meta, ts: FieldValue.serverTimestamp() }); }
function currentHunter(roles = {}) { return Object.entries(roles).find(([, r]) => r === "hunter")?.[0] || null; }
function printState(room, players) {
  console.log("\n— ÉTAT —"); console.log("mode :", room.mode); console.log("state:", room.state);
  console.log("roles:", room.roles || {}); console.log("players:");
  for (const p of players) console.log(`  - ${p.id}: { role=${p.role ?? "?"}, score=${p.score ?? 0} }`);
  console.log("——————\n");
}
// TAG
async function pushTag(roomId, hunterUid, victimUid, x = 0, y = 0) {
  await db.collection(`rooms/${roomId}/events`).add({ type: "tag/hit", hunterUid, victimUid, x, y, ts: FieldValue.serverTimestamp() });
}
async function expectSwapAfterTag(roomId, prevHunter, prevVictim, waitMs = 700) {
  await new Promise(r => setTimeout(r, waitMs));
  const room = await readRoom(roomId); const roles = room.roles || {};
  const ok = roles[prevVictim] === "hunter" && roles[prevHunter] === "prey";
  return { ok, room };
}

const MODES = ["classic", "transmission", "infection", "custom"];

async function main() {
  console.log("== LANCEUR DE PARTIE + TEST TAGS ==");
  console.log("PROJECT_ID:", PROJECT_ID, "  EMULATOR:", process.env.FIRESTORE_EMULATOR_HOST || "(none)", "\n");

  const ping = await pingFirestore(db, 800);
  if (!ping.ok) { console.error("❌ Firestore indisponible.\nDétail:", ping.detail); process.exit(2); }

  // 1) Room
  const rooms = await listRooms(50);
  if (!rooms.length) { console.log("Aucune room."); process.exit(2); }
  const roomChoice = await choose("Sélectionne une room :", rooms.map(r => ({ id: r.id, label: `${r.id}  ${r.mode ? `(${r.mode})` : ""}  ${r.state ? `- ${r.state}` : ""}` })));
  const roomId = roomChoice.id;

  // 2) Players & hunter
  let players = await listPlayers(roomId);
  if (!players.length) { console.log("Cette room n’a pas de joueurs."); process.exit(3); }
  const hunterChoice = await choose("Choisis le chasseur :", players.map(p => ({ id: p.id, label: `${p.id}${p.role ? ` (role: ${p.role})` : ""}${Number.isFinite(p.score) ? ` - score:${p.score}` : ""}` })));
  let hunterUid = hunterChoice.id;

  // 3) Mode
  const mode = (await choose("Choisis le mode :", MODES)).toString();

  // 4) Options
  console.log("\nOptions :");
  const resetEv = (await ask("→ Reset events avant démarrage ? (y/n)", "n")).toLowerCase().startsWith("y");
  const resetSc = (await ask("→ Reset scores/iframe/lastTag ? (y/n)", "n")).toLowerCase().startsWith("y");
  const targetScoreStr = await ask("→ Score cible (optionnel, vide = ignore)", ""); const targetScore = targetScoreStr ? Number(targetScoreStr) : undefined;

  // 5) Setup
  if (resetEv) { console.log("• Reset events…"); await resetEvents(roomId); }
  if (resetSc) { console.log("• Reset scores…"); await maybeResetScores(roomId, players, true); }
  console.log(`• Applique mode=${mode}…`); await setMode(roomId, mode);
  console.log(`• Définit les rôles (chasseur=${hunterUid})…`); await setRoles(roomId, hunterUid, players);
  if (Number.isFinite(targetScore)) await db.doc(`rooms/${roomId}`).set({ targetScore, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log("• Passe state=running…"); await setStateRunning(roomId);
  console.log("• Event start…"); await emitStartEvent(roomId, mode, { targetScore });

  players = await listPlayers(roomId); let room = await readRoom(roomId); printState(room, players);

  // ——— Menu post-lancement
  while (true) {
    console.log(
      "Actions :\n" +
      "  [1] Lire l’état\n" +
      "  [2] TAG (hunter→victim) + vérif swap (transmission)\n" +
      "  [3] Rafale de N TAGs (rotation victimes)\n" +
      "  [4] Changer de chasseur manuellement\n" +
      "  [5] Stopper la partie\n" +
      "  [q] Quitter\n"
    );
    const c = (await ask("> ")).toLowerCase();
    if (c === "q") break;

    if (c === "1") {
      players = await listPlayers(roomId); room = await readRoom(roomId); printState(room, players);

    } else if (c === "2") {
      room = await readRoom(roomId); const roles = room.roles || {}; const current = currentHunter(roles) || hunterUid;
      const victimList = players.filter(p => p.id !== current); if (!victimList.length) { console.log("Pas de victime."); continue; }
      const victimChoice = await choose("Choisir la victime :", victimList.map(v => ({ id: v.id, label: v.id })));
      const victimUid = victimChoice.id;
      const x = Number(await ask("x (def 0)", "0")) || 0; const y = Number(await ask("y (def 0)", "0")) || 0;
      const waitMs = Number(await ask("Attente après TAG (ms, def 700)", "700")) || 700;
      console.log(`→ TAG: ${current} → ${victimUid} @ (${x},${y})`); await pushTag(roomId, current, victimUid, x, y);
      const { ok, room: roomAfter } = await expectSwapAfterTag(roomId, current, victimUid, waitMs);
      console.log("roles après TAG:", roomAfter.roles || {});
      if (ok) { console.log("✅ Swap détecté (transmission)"); hunterUid = victimUid; }
      else { console.log("ℹ️ Pas de swap (classic ?)"); }

    } else if (c === "3") {
      const n = Number(await ask("Combien de TAGs ? (def 5)", "5")) || 5;
      const waitMs = Number(await ask("Attente entre TAGs (ms, def 600)", "600")) || 600;
      let current = hunterUid;
      for (let i = 0; i < n; i++) {
        room = await readRoom(roomId); players = await listPlayers(roomId);
        const others = players.filter(p => p.id !== current); if (!others.length) { console.log("Pas d'autres joueurs."); break; }
        const victimUid = others[i % others.length].id;
        console.log(`→ [${i + 1}/${n}] TAG: ${current} → ${victimUid}`); await pushTag(roomId, current, victimUid, 0, 0);
        const { ok } = await expectSwapAfterTag(roomId, current, victimUid, waitMs);
        if (ok) { current = victimUid; hunterUid = current; console.log("   ✅ swap OK"); }
        else { console.log("   ℹ️ pas de swap"); }
      }
      console.log("Rafale terminée.");

    } else if (c === "4") {
      players = await listPlayers(roomId);
      const pick = await choose("Nouveau chasseur :", players.map(p => ({ id: p.id, label: p.id })));
      hunterUid = pick.id; await setRoles(roomId, hunterUid, players);
      room = await readRoom(roomId); console.log("Nouveau hunter =", hunterUid); printState(room, players);

    } else if (c === "5") {
      await setStateStopped(roomId); room = await readRoom(roomId);
      console.log("Partie stoppée."); printState(room, players);

    } else {
      console.log("Choix invalide.");
    }
  }

  rl.close(); console.log("\nBye 👋");
}

main().catch(e => { console.error(e); rl.close(); process.exit(1); });
