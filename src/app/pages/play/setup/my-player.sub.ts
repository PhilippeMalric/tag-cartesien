import { runInInjectionContext } from '@angular/core';
import { doc } from '@angular/fire/firestore';
import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';
import { pickRespawn } from '../respawn.util';
import { clamp } from '../play.helpers';
import { moveCooldownMs } from './helpers.move-cooldown';

export function attachMyPlayerSub(ctx: PlayCtx, ls: LocalState) {
  ls.mySub = ctx.match.myPlayer$(ctx.matchId).subscribe((d) => {
    if (d) {
        ctx.role = (d.role ?? ctx.role ?? null) as any;

        // ✅ mets à jour mon score depuis mon doc
        if (typeof (d as any).score === 'number') {
        ctx.myScore = (d as any).score;
        }

        // ... le reste (spawn, positions, cooldown, etc.)
    }
    ctx.cd.markForCheck();
    });
}
