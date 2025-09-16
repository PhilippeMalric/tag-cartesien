import { GAME_CONSTANTS } from './play.models';

export function pickRespawn(hx?: number, hy?: number) {
  const B = GAME_CONSTANTS.RESPAWN_BOUNDS;
  for (let i = 0; i < 20; i++) {
    const x = B.minX + Math.random() * (B.maxX - B.minX);
    const y = B.minY + Math.random() * (B.maxY - B.minY);
    if (hx == null || hy == null) return { x, y };
    if (Math.hypot(x - hx, y - hy) >= B.minDistFromHunter) return { x, y };
  }
  return {
    x: B.minX + Math.random() * (B.maxX - B.minX),
    y: B.minY + Math.random() * (B.maxY - B.minY),
  };
}
