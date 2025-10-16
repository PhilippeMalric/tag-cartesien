import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';

export function attachModeSub(ctx: PlayCtx, ls: LocalState) {
  ctx.roomSvc.getMode$(ctx.matchId).subscribe((data: any) => {
    ls.mode = data || '';
  });
}
