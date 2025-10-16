import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';
import type { Player } from '../../room/player.model';

export function attachPlayersSub(ctx: PlayCtx, ls: LocalState) {
  ls.playersSub = ctx.roomSvc.players$(ctx.matchId).subscribe((players: Player[]) => {
    ls.playersById = Object.fromEntries((players || []).map(p => [p.uid, p]));

    const me = players.find((p: any) => p?.uid === ctx.uid) as any;
    ctx.myScore = typeof me?.score === 'number' ? me.score : 0;

    ctx.cd.markForCheck();
  });
}
