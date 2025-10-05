#!/usr/bin/env node
/**
 * RTDB admin helper (émulateur par défaut)
 * Commandes:
 *  - add-admin --uid <UID>
 *  - rm-admin --uid <UID>
 *  - ls-admin
 *  - set-owner --room <ROOM_ID> --uid <OWNER_UID>
 *
 * Options communes:
 *  --prod                 cible la prod (sinon émulateur)
 *  --project <ID>         projectId (utile en prod + pour choisir le ns en émulateur)
 *  --dbNamespace <NS>     namespace RTDB (ex: tag-cartesien ou <project>-default-rtdb)
 *  --sa <path.json>       chemin vers la clé service account (prod)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import admin from 'firebase-admin';

// ---------- Helpers log ----------
const T = () => new Date().toISOString();
const log = (...a) => console.log(`[${T()}]`, ...a);
const warn = (...a) => console.warn(`[${T()}] ⚠`, ...a);
const err = (...a) => console.error(`[${T()}] ❌`, ...a);

// ---------- Utils CLI ----------
function parseArgs(argv) {
  const args = {};
  let cmd = null;
  const cmds = new Set(['add-admin', 'rm-admin', 'ls-admin', 'set-owner']);

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (cmds.has(a) && !cmd) { cmd = a; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const nxt = argv[i + 1];
      if (!nxt || nxt.startsWith('--')) { args[key] = true; }
      else { args[key] = nxt; i++; }
    }
  }
  return { cmd, args };
}

function required(val, name) {
  if (!val) {
    err(`Argument requis manquant: --${name}`);
    process.exit(1);
  }
}

// ---------- Init Firebase Admin (avec logs) ----------
// ✅ Emulator-safe: on évite toute tentative d’ADC/tokens en local.
async function initAdmin({ prod, project, dbNamespace, saPath }) {
  // --- logs utiles ---
  console.log('[initAdmin] prod=', !!prod, 'project=', project || '∅', 'dbNamespace=', dbNamespace || '∅', 'saPath=', saPath || '∅');

  // Si une app Admin existe déjà (souvent la source des erreurs), on la supprime proprement.
  if (admin.apps.length) {
    console.log('[initAdmin] existing admin apps =', admin.apps.length, '→ deleting first');
    try { await admin.app().delete(); } catch {}
  }

  // Résolution du namespace
  const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined;
  const ns = dbNamespace || project || envProject || 'demo-emulator';

  if (!prod) {
    // ---------- ÉMULATEUR ----------
    // 1) câbler l’émulateur RTDB
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';

    // 2) neutraliser ADC (sinon il essaye metadata.google.internal)
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GCLOUD_PROJECT;
    process.env.GOOGLE_CLOUD_PROJECT = ns;

    // 3) URL RTDB émulateur
    const databaseURL = `http://127.0.0.1:9000?ns=${ns}`;

    // 4) ⚠️ Certaines versions de firebase-admin tentent tout de même ADC
    //    → on fournit un "fake credential" qui satisfait l’interface.
    const fakeCredential = {
      getAccessToken: async () => ({ access_token: 'owner', expires_in: 3600 })
    };

    console.log('[initAdmin] EMULATOR =>', { ns, databaseURL, FIREBASE_DATABASE_EMULATOR_HOST: process.env.FIREBASE_DATABASE_EMULATOR_HOST });

    admin.initializeApp({
      projectId: ns,
      databaseURL,
      // Le fake credential empêche toute tentative de metadata server
      credential: fakeCredential
    });

    console.log('[initAdmin] ✓ Admin SDK initialized (emulator)');
  } else {
    // ---------- PRODUCTION ----------
    const cred = saPath
      ? admin.credential.cert(JSON.parse(fs.readFileSync(path.resolve(saPath), 'utf8')))
      : admin.credential.applicationDefault();

    const effectiveProject = project || (cred.projectId ?? envProject);
    if (!effectiveProject) {
      throw new Error('Impossible de déterminer le projectId en prod. Passe --project ou configure GOOGLE_APPLICATION_CREDENTIALS.');
    }

    const effectiveNs = dbNamespace || `${effectiveProject}-default-rtdb`;
    const databaseURL = `https://${effectiveNs}.firebasedatabase.app`;

    console.log('[initAdmin] PROD =>', { effectiveProject, effectiveNs, databaseURL });

    admin.initializeApp({
      credential: cred,
      projectId: effectiveProject,
      databaseURL,
    });
    console.log('[initAdmin] ✓ Admin SDK initialized (prod)');
  }

  // Ping rapide pour vérifier l’accès
  const db = admin.database();
  try {
    const snap = await db.ref('/').limitToFirst(1).get();
    console.log('[initAdmin] ping root → exists?', snap.exists());
  } catch (e) {
    console.error('[initAdmin] ping root FAILED:', e?.message || e);
    throw e;
  }
  return db;
}

// ---------- Actions (avec logs) ----------
async function addAdmin(db, uid) {
  log('— add-admin — uid =', uid);
  const p = `admins/${uid}`;
  log('  → set true at', p);
  await db.ref(p).set(true);
  log('  ✓ OK (admin ajouté)');
}

async function rmAdmin(db, uid) {
  log('— rm-admin — uid =', uid);
  const p = `admins/${uid}`;
  log('  → remove at', p);
  await db.ref(p).remove();
  log('  ✓ OK (admin retiré)');
}

async function lsAdmin(db) {
  log('— ls-admin —');
  const p = 'admins';
  log('  → get at', p);
  const snap = await db.ref(p).get();
  const val = snap.exists() ? snap.val() : {};
  const list = Object.entries(val).filter(([, v]) => v === true).map(([k]) => k);
  if (!list.length) {
    warn('  ∅ Aucun admin défini.');
  } else {
    log('  ✓ Admins:', list.join(', '));
  }
}

async function setOwner(db, roomId, uid) {
  log('— set-owner — room =', roomId, 'uid =', uid);
  const p = `roomsMeta/${roomId}/ownerUid`;
  log('  → check exists at', p);
  const ref = db.ref(p);
  const snap = await ref.get();
  if (snap.exists()) {
    warn(`  ownerUid déjà défini: ${snap.val()}`);
    warn('  (supprime manuellement si tu veux le remplacer)');
    return;
  }
  log('  → set ownerUid =', uid);
  await ref.set(uid);
  log('  ✓ OK (ownerUid défini)');
}

// ---------- Main ----------
(async () => {
  // Parse & log args
  const { cmd, args } = parseArgs(process.argv);
  log('— RTDB ADMIN —');
  log('  argv        =', JSON.stringify(process.argv));
  log('  cmd         =', cmd || '∅');
  log('  args        =', args);

  if (!cmd) {
    console.log(`Usage:
  node rtdb-admin.mjs <commande> [options]

Commandes:
  add-admin   --uid <UID>                 Ajoute un admin (RTDB: /admins/<uid>=true)
  rm-admin    --uid <UID>                 Retire un admin
  ls-admin                                Liste les admins
  set-owner   --room <ROOM_ID> --uid <UID>Définit l'owner d'une room (si absent)

Options:
  --prod                      Vise la production (sinon émulateur)
  --project <ID>              ProjectId (prod ou pour nommer le ns en émulateur)
  --dbNamespace <NS>          Namespace RTDB (ex: tag-cartesien ou <project>-default-rtdb)
  --sa <path.json>            Clé service account (prod)`);
    process.exit(0);
  }

  const prod = !!args.prod;
  const project = args.project || undefined;
  const dbNamespace = args.dbNamespace || undefined;
  const saPath = args.sa || undefined;

  // Logs env utiles
  log('ENV before init:');
  log('  FIREBASE_DATABASE_EMULATOR_HOST =', process.env.FIREBASE_DATABASE_EMULATOR_HOST || '∅');
  log('  GOOGLE_APPLICATION_CREDENTIALS  =', process.env.GOOGLE_APPLICATION_CREDENTIALS || '∅');
  log('  GOOGLE_CLOUD_PROJECT            =', process.env.GOOGLE_CLOUD_PROJECT || '∅');

  let db;
  try {
    db = await initAdmin({ prod, project, dbNamespace, saPath });
  } catch (e) {
    err('initAdmin failed:', e?.message || e);
    process.exit(2);
  }

  try {
    if (cmd === 'add-admin') {
      required(args.uid, 'uid');
      await addAdmin(db, args.uid);
    } else if (cmd === 'rm-admin') {
      required(args.uid, 'uid');
      await rmAdmin(db, args.uid);
    } else if (cmd === 'ls-admin') {
      await lsAdmin(db);
    } else if (cmd === 'set-owner') {
      required(args.room, 'room');
      required(args.uid, 'uid');
      await setOwner(db, args.room, args.uid);
    } else {
      err(`Commande inconnue: ${cmd}`);
      process.exit(1);
    }
  } catch (e) {
    err('Action failed:', e?.message || e);
    process.exit(3);
  } finally {
    try {
      await admin.app().delete();
      log('✓ Admin app deleted');
    } catch {
      /* noop */
    }
  }
})();
