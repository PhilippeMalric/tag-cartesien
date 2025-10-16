import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';

export function detachSubscriptions(ctx: PlayCtx, ls: LocalState) {
  ls.mySub?.unsubscribe?.();
  ls.roomSub?.unsubscribe?.();
  ls.eventsSub?.unsubscribe?.();
  ls.playersSub?.unsubscribe?.();
  ls.positionsSub?.unsubscribe?.();

  (ls as any).stopBots?.();   // coupe le listener RTDB des bots
  ctx.sub.unsubscribe();
  ctx.positions.stop();

  if (ls.timerId) clearInterval(ls.timerId);
  ls.handledEventIds.clear();
}
