import type { PlayCtx } from '../play.types';
import { attachBotsListener } from './bots.listener';
import { attachEventsSub } from './events.sub';
import type { LocalState } from './local-state';
import { attachModeSub } from './mode.sub';
import { attachMyPlayerSub } from './my-player.sub';
import { attachPlayersSub } from './players.sub';
import { attachPositionsSub } from './positions.sub';
import { attachRoomSub } from './room.sub';



export function attachSubscriptions(ctx: PlayCtx, ls: LocalState) {
  // RTDB: bots
  attachBotsListener(ctx, ls);

  // Mode (classic/transmission…)
  attachModeSub(ctx, ls);

  // Players (scores + hunter)
  attachPlayersSub(ctx, ls);

  // Mon doc joueur
  attachMyPlayerSub(ctx, ls);

  // Room (roles / owner / timer / bots / fin)
  attachRoomSub(ctx, ls);

  // Events (annonces + respawn si je suis victime)
  attachEventsSub(ctx, ls);

  // Positions (humains + bots fusionnées)
  attachPositionsSub(ctx, ls);
}
