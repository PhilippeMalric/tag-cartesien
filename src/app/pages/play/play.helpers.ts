import { GAME_CONSTANTS } from './play.models';
import type { PlayCtx } from './play.types';

/** Clamp utilitaire générique */
export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Temps d'invulnérabilité restant d'un joueur (spawn/tag) */
export function remainingInvulnMs(
  victim: { lastSpawnAt?: number; lastTaggedAt?: number },
  C = GAME_CONSTANTS
) {
  const now = Date.now();
  const sinceSpawn = victim.lastSpawnAt ? now - victim.lastSpawnAt : Infinity;
  const sinceTag = victim.lastTaggedAt ? now - victim.lastTaggedAt : Infinity;
  const rem1 = Math.max(0, C.INVULN_MS - sinceSpawn);
  const rem2 = Math.max(0, C.TAG_COOLDOWN_MS - sinceTag);
  return Math.max(rem1, rem2);
}

/** Cherche la victime la plus proche dans le rayon de tag */
export function findVictimWithinRadius(ctx: PlayCtx): { uid: string; dist: number } | null {
  let best: { uid: string; dist: number } | null = null;
  for (const [uid, p] of ctx.others) {
    const d = Math.hypot(p.x - ctx.me.x, p.y - ctx.me.y);
    if (d <= GAME_CONSTANTS.TAG_RADIUS && (!best || d < best.dist)) best = { uid, dist: d };
  }
  return best;
}
