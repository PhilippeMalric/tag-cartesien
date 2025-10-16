import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';

export function attachPositionsSub(ctx: PlayCtx, ls: LocalState) {
  ctx.positions.attachPresence(ctx.matchId, ctx.uid);
  ctx.positions.startListening(ctx.matchId);

  ls.positionsSub = ctx.positions.positions$.subscribe((map) => {
    // liste des hunters (fusion FR/EN)
    const hunters: string[] = [];
    for (const [id, p] of Object.entries(map)) {
      const r = String((p as any)?.role ?? '').toLowerCase();
      if (r === 'hunter' || r === 'chasseur') hunters.push(id);
    }
    ctx.hunterUids = Array.from(new Set(hunters));

    ctx.debug.posUids = Object.keys(map || {});
    ctx.others.clear();

    // anneau "moi"
    const mePlayer = ls.playersById[ctx.uid];
    if (mePlayer) {
      const myEpoch =
        (typeof (mePlayer as any).iFrameUntilMs === 'number' ? (mePlayer as any).iFrameUntilMs : null)
        ?? (typeof (mePlayer as any).cantTagUntilMs === 'number' ? (mePlayer as any).cantTagUntilMs : null);
      ctx.invulnerableUntil = myEpoch && myEpoch > Date.now()
        ? performance.now() + (myEpoch - Date.now())
        : 0;
    }

    // 1) HUMANS (sauf moi)
    for (const [id, p] of Object.entries(map || {})) {
      if (id === ctx.uid) continue;
      const pos: any = p as any;
      if (pos?.x == null || pos?.y == null) continue;

      const pl = ls.playersById[id];
      const ringEpoch =
        (pl && typeof (pl as any).iFrameUntilMs === 'number' ? (pl as any).iFrameUntilMs : null)
        ?? (pl && typeof (pl as any).cantTagUntilMs === 'number' ? (pl as any).cantTagUntilMs : null);

      ctx.others.set(id, {
        x: pos.x,
        y: pos.y,
        iFrameUntilMs: ringEpoch && ringEpoch > Date.now() ? ringEpoch : undefined,
        ringKind: pl ? ((pl as any).role === 'hunter' ? 'hunter' : 'prey') : 'prey',
      });
    }

    // 2) BOTS (depuis RTDB mis par bots.listener)
    const lastBots = (ls as any).lastBots as Record<string, { x: number; y: number }> | undefined;
    if (lastBots) {
      for (const [id, b] of Object.entries(lastBots)) {
        ctx.others.set(id, { x: b.x, y: b.y });
      }
    }

    ctx.cd.markForCheck();
  });
}
