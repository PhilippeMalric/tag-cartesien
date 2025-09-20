// Enregistre ts-node en CommonJS, même si le projet Functions est en ESM.
require('ts-node').register({
  project: 'tsconfig.scripts.json',
  transpileOnly: true
});

// Forward des variables d'env + arguments au script TS
const path = require('path');

const script = process.env.SCRIPT_TS;
if (!script) {
  console.error('Missing SCRIPT_TS env var (ex.: scripts/seed_classic.ts)');
  process.exit(1);
}

// Résout et exécute le script TypeScript
require(path.resolve(script));
