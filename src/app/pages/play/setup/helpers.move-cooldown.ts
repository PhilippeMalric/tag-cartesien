import type { PlayCtx } from '../play.types';
import { GAME_CONSTANTS } from '../play.models';

export function moveCooldownMs(ctx: PlayCtx) {
  return ctx.role === 'hunter'
    ? GAME_CONSTANTS.MOVE_COOLDOWN_MS_CHASSEUR
    : GAME_CONSTANTS.MOVE_COOLDOWN_MS_CHASSE;
}
