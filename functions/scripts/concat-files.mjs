#!/usr/bin/env node
// concat-files.mjs
// Concatène récursivement des fichiers texte dans un seul fichier,
// avec un en-tête contenant le chemin du fichier source.

console.log("concat");


import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.angular', '.next', '.cache'
]);

const TEXT_EXTS = new Set([
  // Extensions explicitement considérées comme texte
  '.txt', '.md', '.markdown', '.json', '.jsonc', '.yaml', '.yml',
  '.xml', '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.java', '.kt', '.kts', '.go', '.rs', '.py', '.rb', '.php', '.sh', '.zsh', '.bash',
  '.ps1', '.bat', '.cmd', '.ini', '.env', '.gitignore', '.gitattributes',
  '.cfg', '.conf', '.toml', '.sql', '.csv', '.tsv', '.vue', '.svelte'
]);

// Heuristique rapide pour détecter du binaire: cherche un \0 dans le premier chunk.
async function looksBinary(filePath) {
  try {
    const fd = await fs.open(filePath, 'r');
    const { buffer, bytesRead } = await fd.read(Buffer.alloc(4096), 0, 4096, 0);
    await fd.close();
    if (bytesRead === 0) return false; // vide -> texte
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0x00) return true;
    }
    return false;
  } catch {
    return true; // si on ne peut pas lire, on "skip"
  }
}

function shouldSkipDir(dirName) {
  if (IGNORED_DIRS.has(dirName)) return true;
  // ignore dossiers cachés (commencent par .)
  if (dirName.startsWith('.')) return true;
  return false;
}

function isLikelyTextByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTS.has(ext)) return true;
  // Fichiers sans extension: on tentera l'heuristique binaire
  return ext === '';
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        yield* walk(full);
      }
    } else if (entry.isFile()) {
      yield full;
    }
    // symlinks: on ignore pour éviter les boucles
  }
}

function nowISO() {
  return new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
}

async function main() {
    console.log("main");
    
  const [, , inputDirArg, outFileArg] = process.argv;
  if (!inputDirArg || !outFileArg) {
    console.error('Usage: node concat-files.mjs <dossier_source> <fichier_sortie>');
    process.exit(1);
  }

  const inputDir = path.resolve(inputDirArg);
  const outFile = path.resolve(outFileArg);

console.log("inputDir",inputDir);
  console.log("outFile",outFile);

  // Crée le dossier de sortie si nécessaire
  await fs.mkdir(path.dirname(outFile), { recursive: true });

  const headerLine = (relPath, size) =>
    `\n===== FILE: ${relPath} (${size} bytes) | generated ${nowISO()} =====\n`;

  // Écrit en flux pour éviter de charger en mémoire
  const outHandle = await fs.open(outFile, 'w');
  try {
    const root = inputDir;
    let count = 0;
    for await (const filePath of walk(root)) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.size === 0) {
          // quand même écrire un header pour signaler un fichier vide
          const rel = path.relative(root, filePath) || path.basename(filePath);
          await outHandle.write(headerLine(rel, 0), null, 'utf8');
          count++;
          continue;
        }

        const extText = isLikelyTextByExt(filePath);
        const isBin = extText ? false : await looksBinary(filePath);
        if (isBin) continue;

        // Vérifie encore le binaire sur un échantillon même si extension connue
        if (extText && await looksBinary(filePath)) continue;

        const rel = path.relative(root, filePath) || path.basename(filePath);
        await outHandle.write(headerLine(rel, stat.size), null, 'utf8');
        const content = await fs.readFile(filePath, 'utf8');
        // Normalise fin de ligne et s’assure qu’un saut de ligne termine chaque bloc
        const normalized = content.replace(/\r\n/g, '\n');
        await outHandle.write(normalized.endsWith('\n') ? normalized : normalized + '\n', null, 'utf8');
        count++;
      } catch (e) {
        // On note l’erreur dans le fichier de sortie pour traçabilité
        const rel = path.relative(inputDir, filePath);
        await outHandle.write(`\n===== SKIPPED: ${rel} (error: ${e?.message ?? e}) =====\n`, null, 'utf8');
      }
    }
    await outHandle.write(`\n===== DONE (${count} files) =====\n`, null, 'utf8');
    console.log(`OK: ${count} fichiers concaténés dans ${outFile}`);
  } finally {
    await outHandle.close();
  }
}


  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });

