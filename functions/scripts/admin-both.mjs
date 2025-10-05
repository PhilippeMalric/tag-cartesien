#!/usr/bin/env node
/**
 * Configure un admin dans Firebase Auth (custom claim) + RTDB.
 * - Émulateur: ne demande AUCUN token. Si uid manquant/introuvable, propose une sélection
 *   depuis la liste des users de l'émulateur Auth, sinon création auto.
 *
 * Usage:
 *   node functions/scripts/admin-both.mjs --uid <UID> --emulator --project demo-project --dbNamespace tag-cartesien-default-rtdb
 *   node functions/scripts/admin-both.mjs --emulator --project demo-project --dbNamespace tag-cartesien-default-rtdb   (sélection interactive)
 *
 * Notes:
 *   - Auth emulator host: 127.0.0.1:9099
 *   - Emulator UI (pour vérifier visuellement): http://127.0.0.1:4000/auth
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import admin from "firebase-admin";

// -------------------- CLI --------------------
function parseArgs(argv) {
  const args = {
    uid: undefined,
    unset: false,
    revoke: false,
    emulator: false,
    projectId: undefined,
    dbNamespace: undefined,
    sa: undefined,
  };
  if (argv[0] && !String(argv[0]).startsWith("--")) args.uid = argv.shift();
  while (argv.length) {
    const k = argv.shift();
    switch (k) {
      case "--uid": args.uid = argv.shift(); break;
      case "--unset": args.unset = true; break;
      case "--revoke": args.revoke = true; break;
      case "--emulator": args.emulator = true; break;
      case "--project": args.projectId = argv.shift(); break;
      case "--dbNamespace": args.dbNamespace = argv.shift(); break;
      case "--sa": args.sa = argv.shift(); break;
      default: throw new Error(`Argument inconnu: ${k}`);
    }
  }
  if (!args.uid && process.env.npm_config_uid) args.uid = process.env.npm_config_uid;
  return args;
}

function rlQuestion(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, a => { rl.close(); res(a); }));
}

// -------------------- INIT --------------------
function resolveServiceAccount(saPath) {
  const abs = path.resolve(saPath);
  const json = JSON.parse(fs.readFileSync(abs, "utf8"));
  return cert(json);
}

function initFirebase({ emulator, projectId, dbNamespace, sa }) {
  console.log("— INIT FIREBASE ADMIN —");
  if (emulator) {
    const proj = projectId || "demo-project";
    const ns = dbNamespace || proj;

    process.env.FIREBASE_AUTH_EMULATOR_HOST =
      process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
    process.env.FIREBASE_DATABASE_EMULATOR_HOST =
      process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";

    const databaseURL = `http://127.0.0.1:9000?ns=${ns}`;
    initializeApp({ projectId: proj, databaseURL });
    console.log("  mode       : EMULATOR");
    console.log("  projectId  :", proj);
    console.log("  dbURL      :", databaseURL);
  } else {
    const credential = sa ? resolveServiceAccount(sa) : applicationDefault();
    const proj = projectId || credential.projectId;
    if (!proj) throw new Error("projectId introuvable (prod). Passe --project ou --sa.");
    const ns = dbNamespace || `${proj}-default-rtdb`;
    const databaseURL = `https://${ns}.firebasedatabase.app`;
    initializeApp({ credential, projectId: proj, databaseURL });
    console.log("  mode       : PRODUCTION");
    console.log("  projectId  :", proj);
    console.log("  dbURL      :", databaseURL);
  }
  return { auth: getAuth(), rtdb: admin.database() };
}

// -------------------- AUTH EMULATOR HELPERS --------------------
// Liste les comptes de l'émulateur Auth via l'API REST (port 9099)
async function listEmulatorUsers(projectId) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const url = `http://${host}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:query`;
  // L’émulateur ignore la clé API ; POST requis par l’API
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Auth emulator /accounts:query HTTP ${resp.status} — ${txt}`);
  }
  const data = await resp.json();
  return Array.isArray(data?.users) ? data.users : [];
}

function formatUserRow(u, idx) {
  const email = u.email || "(no-email)";
  const uid = u.localId || "(no-uid)";
  const disp = u.displayName || "";
  return `${String(idx).padStart(2, " ")} • uid=${uid}  email=${email}  ${disp ? `name="${disp}"` : ""}`;
}

async function chooseUidFromEmulator(projectId) {
  console.log("— AUTH EMULATOR: sélection d’un utilisateur —");
  const users = await listEmulatorUsers(projectId);
  if (!users.length) {
    console.log("  ∅ Aucun utilisateur dans l’émulateur Auth.");
    const ans = (await rlQuestion("  Créer un nouvel utilisateur ? (y/N) ")).trim().toLowerCase();
    if (ans === "y") {
      const uid = (await rlQuestion("  UID (laisser vide pour auto) : ")).trim();
      const email = (await rlQuestion("  Email (optionnel) : ")).trim() || undefined;
      const displayName = (await rlQuestion("  Display name (optionnel) : ")).trim() || undefined;
      return { action: "create", uid: uid || undefined, email, displayName };
    }
    return { action: "cancel" };
  }

  console.log(`  ${users.length} utilisateur(s) trouvé(s) dans l’émulateur:`);
  users.forEach((u, i) => console.log(" ", formatUserRow(u, i)));
  console.log("");
  const pick = (await rlQuestion("  Entrer l’index de l’utilisateur à utiliser (ou laisser vide pour annuler) : ")).trim();
  if (pick === "") return { action: "cancel" };
  const idx = Number(pick);
  if (!Number.isFinite(idx) || idx < 0 || idx >= users.length) {
    console.log("  Index invalide.");
    return { action: "cancel" };
  }
  const chosen = users[idx];
  return { action: "use", uid: chosen.localId };
}

// Crée un user dans l’émulateur (email/displayName optionnels)
async function ensureUserExistsInEmulator(auth, { uid, email, displayName }) {
  if (uid) {
    try {
      return await auth.getUser(uid);
    } catch {
      // crée avec uid forcé
      const u = await auth.createUser({ uid, email, displayName });
      console.log("  ✅ utilisateur créé (émulateur) :", u.uid);
      return u;
    }
  } else {
    // crée sans uid => uid auto
    const u = await auth.createUser({ email, displayName });
    console.log("  ✅ utilisateur créé (émulateur, uid auto) :", u.uid);
    return u;
  }
}

// -------------------- ACTIONS --------------------
async function setAuthAdminClaim(auth, uid, { unset, revoke, emulator, projectId }) {
  console.log("— AUTH: set custom claim admin —");
  let user;

  if (emulator) {
    // Si uid absent: proposer la sélection
    if (!uid) {
      const choice = await chooseUidFromEmulator(projectId || "demo-project");
      if (choice.action === "cancel") {
        throw new Error("Sélection annulée.");
      } else if (choice.action === "use") {
        uid = choice.uid;
        console.log("  ✓ UID sélectionné :", uid);
      } else if (choice.action === "create") {
        const u = await ensureUserExistsInEmulator(auth, choice);
        uid = u.uid;
      }
    } else {
      // uid fourni mais peut ne pas exister -> tente get, sinon crée
      try {
        user = await auth.getUser(uid);
      } catch {
        console.log("  ℹ️ getUser a échoué, création dans l’émulateur …");
        user = await ensureUserExistsInEmulator(auth, { uid });
      }
    }
  }

  // En prod, ou si user pas encore récupéré
  if (!user) {
    user = await auth.getUser(uid);
  }

  const current = user.customClaims || {};
  if (unset) {
    if (current.admin) delete current.admin;
    await auth.setCustomUserClaims(uid, Object.keys(current).length ? current : null);
    console.log(`  ✅ admin claim removed (uid=${uid})`);
  } else {
    const next = { ...current, admin: true };
    await auth.setCustomUserClaims(uid, next);
    console.log(`  ✅ admin claim set to true (uid=${uid})`);
  }

  if (revoke) {
    await auth.revokeRefreshTokens(uid);
    console.log("  ℹ️ tokens revoked");
  }
  return uid;
}

async function setRtdbAdminFlag(rtdb, uid, unset) {
  console.log("— RTDB: set admins/<uid> flag —");
  const ref = rtdb.ref(`admins/${uid}`);
  if (unset) {
    await ref.remove();
    console.log("  ✅ admins/%s removed", uid);
  } else {
    await ref.set(true);
    console.log("  ✅ admins/%s = true", uid);
  }
}

// -------------------- MAIN --------------------
(async () => {
  const args = parseArgs(process.argv.slice(2));

  console.log("— ADMIN BOTH —");
  console.log("  uid        :", args.uid || "(à sélectionner)");
  console.log("  emulator   :", args.emulator ? "YES" : "NO");
  console.log("  projectId  :", args.projectId || "(auto/demo-project en émulateur)");
  console.log("  dbNamespace:", args.dbNamespace || "(auto)");
  console.log("  sa         :", args.sa ? path.resolve(args.sa) : "(ADC / none)");
  console.log("");

  const { auth, rtdb } = initFirebase({
    emulator: args.emulator,
    projectId: args.projectId,
    dbNamespace: args.dbNamespace,
    sa: args.sa,
  });

  try {
    const effectiveUid = await setAuthAdminClaim(auth, args.uid, {
      unset: args.unset,
      revoke: args.revoke,
      emulator: args.emulator,
      projectId: args.projectId || "demo-project",
    });

    await setRtdbAdminFlag(rtdb, effectiveUid, args.unset);

    console.log("\n✅ DONE: admin configuré dans Auth + RTDB");
    if (!args.unset) {
      console.log(
        "ℹ️ Côté client : rafraîchir l'ID token pour voir la claim :\n" +
        "   const token = await user.getIdTokenResult(true);\n" +
        "   const isAdmin = !!token.claims['admin'];"
      );
    }
  } catch (err) {
    console.error("\n❌ FAILED:", err?.message || err);
    process.exit(2);
  } finally {
    await admin.app().delete().catch(() => {});
  }
})();









