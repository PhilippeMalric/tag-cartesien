import { runInInjectionContext } from '@angular/core';
import { doc, setDoc } from '@angular/fire/firestore';
import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';
import { isOwnerNow } from './local-state';

export function attachRoomSub(ctx: PlayCtx, ls: LocalState) {
  ls.roomSub = ctx.match.room$(ctx.matchId).subscribe((room) => {
    if (!room) return;

    ctx.roomOwnerUid = room.ownerUid ?? null;
    ctx.targetScore  = room.targetScore ?? 0;

    const roles = (room.roles ?? null) as any;
    if (roles) {
      const mine = roles[ctx.uid] ?? null;
      if (mine && ctx.role !== mine) {
        ctx.role = mine;

        // miroir Firestore player.role
        runInInjectionContext(ctx.env, async () => {
          try {
            const ref = doc(ctx.match.fs, `rooms/${ctx.matchId}/players/${ctx.uid}`);
            await setDoc(ref, { role: mine }, { merge: true });
          } catch {}
        });

        // miroir RTDB positions pour que le canvas voie le bon rôle tout de suite
        ctx.positions.writeSelf(ctx.matchId, ctx.uid, ctx.me.x, ctx.me.y, ctx.role as string)
          .catch(() => {});
      }

      const chasseurUids = Object.keys(roles).filter((k) => roles[k] === 'hunter');
      // (log éventuel inchangé)
    }

    const endMs = room.roundEndAtMs as number | undefined;
    if (endMs) {
      const tick = () => {
        ctx.timeLeft = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
        if (ctx.timeLeft === 0 && isOwnerNow(ctx)) {
          ctx.match.endByTimer(ctx.matchId).catch(() => {});
        }
        ctx.cd.markForCheck();
      };
      tick();
      if (ls.timerId) clearInterval(ls.timerId);
      ls.timerId = setInterval(tick, 250);
    }

    if (isOwnerNow(ctx) && (ctx.desiredBots ?? 0) > 0) {
      ctx.bots.spawn(ctx.matchId, Math.min(ctx.desiredBots!, 12));
      ctx.desiredBots = 0;
    }

    if (room.state === 'ended') {
      if (ls.timerId) clearInterval(ls.timerId);
      ctx.router.navigate(['/score', ctx.matchId]);
    }
    ctx.cd.markForCheck();
  });
}
