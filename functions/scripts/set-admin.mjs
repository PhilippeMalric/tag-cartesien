#!/usr/bin/env node
// Usage :
//   node set-admin.mjs <UID> [--unset] [--project <projectId>] [--sa <serviceAccount.json>] [--emulator] [--revoke]
// Exemples :
//   node set-admin.mjs xM9xZueVKUIAFFjyqCKB6SSfUf1e
//   node set-admin.mjs xM9xZueVKUIAFFjyqCKB6SSfUf1e --unset
//   node set-admin.mjs xM9xZueVKUIAFFjyqCKB6SSfUf1e --project tag-cartesien
//   node set-admin.mjs xM9xZueVKUIAFFjyqCKB6SSfUf1e --sa ./serviceAccountKey.json
//   node set-admin.mjs xM9xZueVKUIAFFjyqCKB6SSfUf1e --emulator --project demo-project

import { fileURLToPath } from "url";
import { dirname } from "path";
import process from "process";

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function parseArgs(argv) {
  const args = { unset: false, emulator: false, revoke: false };
  const rest = [...argv];
  args.uid = rest.shift();
  while (rest.length) {
    const k = rest.shift();
    if (k === "--unset") args.unset = true;
    else if (k === "--emulator") args.emulator = true;
    else if (k === "--revoke") args.revoke = true;
    else if (k === "--project") args.projectId = rest.shift();
    else if (k === "--sa") args.sa = rest.shift();
    else throw new Error(`Arg inconnu: ${k}`);
  }
  if (!args.uid) throw new Error("UID manquant. Voir l’usage en tête de fichier.");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Émulateur (Auth)
  if (args.emulator) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
    if (!args.projectId) args.projectId = "demo-project";
  }

  // Initialisation Admin SDK
  let appOptions = {};
  if (args.projectId) appOptions.projectId = args.projectId;

  if (args.sa) {
    appOptions.credential = cert(args.sa);
  } else {
    // Tente GOOGLE_APPLICATION_CREDENTIALS ou ADC (gcloud auth application-default login)
    appOptions.credential = applicationDefault();
  }

  initializeApp(appOptions);
  const auth = getAuth();

  // Récupère les claims actuelles
  const user = await auth.getUser(args.uid);
  const current = user.customClaims || {};

  // Modifie la claim admin
  if (args.unset) {
    // retire admin
    if (current.admin) delete current.admin;
    await auth.setCustomUserClaims(args.uid, Object.keys(current).length ? current : null);
    console.log(`✅ Claim 'admin' retirée pour uid=${args.uid}`);
  } else {
    // ajoute/force admin: true
    const next = { ...current, admin: true };
    await auth.setCustomUserClaims(args.uid, next);
    console.log(`✅ Claim 'admin' = true appliquée pour uid=${args.uid}`);
  }

  if (args.revoke) {
    await auth.revokeRefreshTokens(args.uid);
    console.log("ℹ️  Tokens révoqués : l’utilisateur devra rafraîchir sa session.");
  }

  // Affiche l’état final
  const after = await auth.getUser(args.uid);
  console.log("Claims finales :", after.customClaims || {});
  console.log("\nℹ️  Côté client, il faut rafraîchir l’ID token (déconnexion/reconnexion, ou attendre le prochain refresh) pour que :");
  console.log("    const token = await user.getIdTokenResult();");
  console.log("    this.isAdmin.set(!!token.claims['admin']);");
  console.log("…devienne vrai/à jour.");
}

main().catch(err => {
  console.error("❌ Erreur :", err.message || err);
  process.exit(1);
});
