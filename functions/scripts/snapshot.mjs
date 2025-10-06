// scripts/snapshot.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const OUTFILE = process.env.OUTFILE || 'snapshot_all.txt';

// Dossiers à exclure (par nom de segment)
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.angular', 'dist', 'build', 'out', 'coverage',
  '.vscode', '.idea', 'tmp', 'temp',
  'lib',                // outputs tsc
  'environments'        // Angular src/environments/*
]);

// Extensions autorisées (sans le point)
const EXT = new Set([
  'ts','tsx','js','jsx','mjs','cjs','html','css','scss','json','md','yml','yaml','sh','ps1','bat','rules'
]);

// Fichiers à exclure par motif (basename)
const EXCLUDE_FILE_REGEX = [
  /^environment(\..+)?\.ts$/i,
  /^\.env(\..+)?$/i,
  /^serviceaccount.*\.json$/i,
  /^firebase.*\.json$/i,
  /^google-credentials.*\.json$/i,
  /^secret.*\.(json|txt)$/i,
];

// Fichiers à FORCER dans la sortie (chemins relatifs à ROOT ou basenames).
// Par défaut, on force 'firestore.rules'. Tu peux compléter via l'env FORCE_INCLUDE="fileA,fileB".
const FORCE_INCLUDE = new Set(
  (process.env.FORCE_INCLUDE?.split(',').map(s => s.trim()).filter(Boolean) ?? [])
    .concat(['firestore.rules'])
);

// util
function isExcludedDir(p) {
  const rel = path.relative(ROOT, p);
  const parts = rel.split(path.sep).filter(Boolean);
  return parts.some(part => EXCLUDE_DIRS.has(part));
}
function isExcludedFile(filePath) {
  const base = path.basename(filePath);
  return EXCLUDE_FILE_REGEX.some(rx => rx.test(base));
}

async function walk(dir, files = []) {
  if (isExcludedDir(dir)) return files;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (isExcludedDir(p)) continue;
      await walk(p, files);
    } else {
      if (isExcludedDir(path.dirname(p))) continue;
      if (isExcludedFile(p)) continue;
      const ext = path.extname(p).slice(1).toLowerCase();
      if (EXT.has(ext)) files.push(p);
    }
  }
  return files;
}

async function appendFileToOut(absPath, outAbs) {
  let content = '';
  try {
    content = await fs.readFile(absPath, 'utf8');
  } catch {
    return false;
  }
  const header =
`────────────────────────────────────────────────────────────
FILE: ${absPath}
REL:  ${path.relative(ROOT, absPath)}
────────────────────────────────────────────────────────────
`;
  await fs.appendFile(outAbs, header + content + '\n\n', 'utf8');
  return true;
}

async function resolveForceIncludes() {
  const results = new Set();
  for (const entry of FORCE_INCLUDE) {
    // 1) si entry est un chemin relatif depuis ROOT
    const direct = path.resolve(ROOT, entry);
    try {
      const stat = await fs.stat(direct);
      if (stat.isFile()) {
        results.add(direct);
        continue;
      }
    } catch {}

    // 2) sinon, on cherche par basename dans le repo
    const matches = [];
    async function search(dir) {
      if (isExcludedDir(dir)) return;
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch { return; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          await search(p);
        } else {
          if (path.basename(p) === entry) matches.push(p);
        }
      }
    }
    await search(ROOT);
    for (const m of matches) results.add(m);
  }
  return Array.from(results);
}

async function main() {
  const outAbs = path.join(ROOT, OUTFILE);

  // 1) parcourt standard
  const files = await walk(ROOT, []);
  await fs.writeFile(outAbs, '', 'utf8');

  for (const f of files) {
    await appendFileToOut(f, outAbs);
  }

  // 2) Ajoute les fichiers FORCÉS s'ils n'ont pas déjà été ajoutés
  const forced = await resolveForceIncludes();
  const already = new Set(files.map(f => path.resolve(f)));

  let added = 0;
  for (const f of forced) {
    const abs = path.resolve(f);
    if (!already.has(abs)) {
      const ok = await appendFileToOut(abs, outAbs);
      if (ok) added++;
    }
  }

  console.log(`OK → ${OUTFILE} (${files.length} files + ${added} forced)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
