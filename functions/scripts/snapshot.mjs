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
  'lib',                // ← exclude outputs tsc
  'environments'        // ← Angular src/environments/*
]);

// Extensions autorisées (sans le point)
const EXT = new Set([
  'ts','tsx','js','jsx','mjs','cjs','html','css','scss','json','md','yml','yaml','sh','ps1','bat'
]);

// Fichiers à exclure par motif (basename seulement)
const EXCLUDE_FILE_REGEX = [
  /^environment(\..+)?\.ts$/i,         // environment.ts, environment.prod.ts, etc.
  /^\.env(\..+)?$/i,                   // .env, .env.local, .env.production...
  /^serviceaccount.*\.json$/i,         // serviceAccount*.json
  /^firebase.*\.json$/i,               // firebase*.json (credentials, config)
  /^google-credentials.*\.json$/i,     // google-credentials*.json
  /^secret.*\.(json|txt)$/i,           // secret*.json/txt
];

// retourne true si un chemin contient un dossier exclu
function isExcludedDir(p) {
  const parts = path.relative(ROOT, p).split(path.sep);
  return parts.some(part => EXCLUDE_DIRS.has(part));
}

// retourne true si un fichier doit être exclu par nom
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

async function main() {
  const files = await walk(ROOT, []);
  // vide le fichier de sortie
  await fs.writeFile(path.join(ROOT, OUTFILE), '', 'utf8');

  for (const f of files) {
    let content = '';
    try {
      content = await fs.readFile(f, 'utf8');
    } catch {
      continue;
    }

    const header =
`────────────────────────────────────────────────────────────
FILE: ${f}
REL:  ${path.relative(ROOT, f)}
────────────────────────────────────────────────────────────
`;
    await fs.appendFile(path.join(ROOT, OUTFILE), header + content + '\n\n', 'utf8');
  }

  console.log(`OK → ${OUTFILE} (${files.length} files)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
