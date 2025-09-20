#!/usr/bin/env node
// Écoute en temps réel : mode, état, #joueurs, chasseur, scores, derniers events, temps restant

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import readline from "node:readline/promises";
import { stdin as input, stdout as output, argv as ARGV } from "node:process";

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
async function listRooms(limit = 50) {
  const q = db.collection("rooms").orderBy("updatedAt", "desc").limit(limit);
  const snap = await q.get().catch(async () => await db.collection("rooms").limit(limit).get());
  const out = []; snap.forEach(d => out.push({ id: d.id, ...d.data() })); return out;
}
function currentHunter(roles = {}, players = []) {
  const fromRoom = Object.entries(roles).find(([, r]) => r === "chasseur")?.[0];
  if (fromRoom) return fromRoom; return players.find(p => p.role === "chasseur")?.id ?? null;
}
function safeTsToMs(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  return null;
}
function computeRemaining(room) {
  const now = Date.now();
  const endsAtMs = safeTsToMs(room.endsAt); if (endsAtMs) return Math.max(0, endsAtMs - now);
  const startedMs = safeTsToMs(room.startedAt); const durationMs = typeof room.durationMs === "number" ? room.durationMs : null;
  if (startedMs && durationMs) return Math.max(0, startedMs + durationMs - now);
  return null;
}
function fmtMs(ms) { if (ms == null) return "—"; const s = Math.floor(ms / 1000); const mm = Math.floor(s / 60); const ss = s % 60; return `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`; }
function shallowEqual(a, b) {
  if (a === b) return true; if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false; return true;
}

// ——— Rendering
let cache = { roomId: null, room: {}, players: [], lastEvents: [], lastRenderStr: "", lastRemainingStr: "" };
function render() {
  const { room, players, roomId, lastEvents } = cache;
  const roles = room.roles || {}; const hunter = currentHunter(roles, players);
  const nb = players.length; const remainingMs = computeRemaining(room); const remainingStr = fmtMs(remainingMs);
  const playersSorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  let out = "";
  out += "──────────────────────────────────────────────────────────\n";
  out += ` Room: ${roomId}\n`;
  out += ` Mode: ${room.mode ?? "—"}   State: ${room.state ?? "—"}\n`;
  out += ` Joueurs: ${nb}   Chasseur: ${hunter ?? "—"}\n`;
  if (room.targetScore !== undefined) out += ` Objectif (score): ${room.targetScore}\n`;
  out += ` Temps restant: ${remainingStr}\n`;
  out += "──────────────────────────────────────────────────────────\n";
  out += " Joueurs (triés par score):\n";
  for (const p of playersSorted) out += `  - ${p.id.padEnd(14)} role=${(p.role ?? "—").padEnd(9)} score=${String(p.score ?? 0).padStart(3)}\n`;
  out += "──────────────────────────────────────────────────────────\n";
  out += " Derniers events:\n";
  if (lastEvents.length === 0) out += "  (aucun)\n";
  else for (const ev of lastEvents) {
    const ts = safeTsToMs(ev.ts); const tstr = ts ? new Date(ts).toLocaleTimeString() : "—";
    if (ev.type === "tag") out += `  [${tstr}] tag: ${ev.hunterUid} → ${ev.victimUid}  @(${ev.x ?? 0},${ev.y ?? 0})\n`;
    else if (ev.type === "start") out += `  [${tstr}] start (mode=${ev.mode})\n`;
    else if (ev.type === "end") out += `  [${tstr}] end (reason=${ev.reason ?? "—"})\n`;
    else out += `  [${tstr}] ${ev.type}\n`;
  }
  out += "──────────────────────────────────────────────────────────\n";

  if (out !== cache.lastRenderStr) { console.clear(); process.stdout.write(out); cache.lastRenderStr = out; }
  if (remainingStr !== cache.lastRemainingStr) { cache.lastRemainingStr = remainingStr; }
}
setInterval(() => { const remainingMs = computeRemaining(cache.room || {}); if (remainingMs != null) render(); }, 1000);

// ——— Main
async function main() {
  console.log("== ROOM LISTENER =="); console.log("PROJECT_ID:", PROJECT_ID, "  EMULATOR:", process.env.FIRESTORE_EMULATOR_HOST || "(none)", "\n");

  const ping = await pingFirestore(db, 800);
  if (!ping.ok) { console.error("❌ Firestore indisponible.\nDétail:", ping.detail); process.exit(2); }

  // Choix room (arg ou menu)
  const argRoom = ARGV.find(a => a.startsWith("--room="))?.split("=")[1];
  let roomId = argRoom;
  if (!roomId) {
    const rooms = await listRooms(50);
    if (!rooms.length) { console.log("Aucune room."); process.exit(2); }
    const choice = await choose("Sélectionne une room :", rooms.map(r => ({ id: r.id, label: `${r.id}  ${r.mode ? `(${r.mode})` : ""}  ${r.state ? `- ${r.state}` : ""}` })));
    roomId = choice.id;
  }
  cache.roomId = roomId;

  // Subscriptions
  const roomRef = db.doc(`rooms/${roomId}`);
  const playersRef = db.collection(`rooms/${roomId}/players`);
  const eventsRef = db.collection(`rooms/${roomId}/events`).orderBy("ts", "desc").limit(5);

  const unsubs = [];
  unsubs.push(roomRef.onSnapshot(snap => {
    const data = snap.data() || {};
    const nextRoom = { ...cache.room, ...data };
    const same = shallowEqual(nextRoom.roles || {}, (cache.room?.roles) || {}) &&
                 nextRoom.mode === cache.room?.mode && nextRoom.state === cache.room?.state &&
                 nextRoom.targetScore === cache.room?.targetScore &&
                 (safeTsToMs(nextRoom.startedAt) === safeTsToMs(cache.room?.startedAt)) &&
                 (safeTsToMs(nextRoom.endsAt) === safeTsToMs(cache.room?.endsAt)) &&
                 nextRoom.durationMs === cache.room?.durationMs;
    cache.room = data; if (!same) render();
  }, err => console.error("room onSnapshot error:", err)));

  unsubs.push(playersRef.onSnapshot(snap => {
    const players = []; snap.forEach(d => players.push({ id: d.id, ...d.data() }));
    players.sort((a, b) => a.id.localeCompare(b.id));
    const prev = JSON.stringify(cache.players); cache.players = players;
    if (JSON.stringify(players) !== prev) render();
  }, err => console.error("players onSnapshot error:", err)));

  unsubs.push(eventsRef.onSnapshot(snap => {
    const events = []; snap.forEach(d => events.push({ id: d.id, ...d.data() }));
    const prev = JSON.stringify(cache.lastEvents); cache.lastEvents = events;
    if (JSON.stringify(events) !== prev) render();
  }, err => console.error("events onSnapshot error:", err)));

  const cleanup = () => { unsubs.forEach(u => { try { u(); } catch {} }); rl.close(); process.exit(0); };
  process.on("SIGINT", cleanup); process.on("SIGTERM", cleanup);
}

main().catch(e => { console.error(e); rl.close(); process.exit(1); });
