import { runInInjectionContext } from '@angular/core';
import { doc, updateDoc } from '@angular/fire/firestore';
import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';
import { pickRespawn } from '../respawn.util';
import { GAME_CONSTANTS } from '../play.models';

// types @tag/types
import type { EventItem, TagHitEvent } from '@tag/types';
import { isTagHitEvent } from '@tag/types';

export function attachEventsSub(ctx: PlayCtx, ls: LocalState) {
  ls.eventsSub = ctx.match.events$(ctx.matchId).subscribe((events: EventItem[]) => {
    for (const ev of events) {
      // ——— Discrimination par type
      if (isTagHitEvent(ev)) {
        const hit = ev as TagHitEvent;

        // id stable pour éviter doublons
        const id = hit.id ?? `tag/hit:${hit.payload.byUid}:${hit.payload.targetUid}:${hit.ts}`;
        if (ls.handledEventIds.has(id)) continue;
        ls.handledEventIds.add(id);

        // bandeau
        ctx.recentTag = {
          label: `${hit.payload.byUid.slice(0, 6)} a tagué ${hit.payload.targetUid.slice(0, 6)}`,
          until: Date.now() + 2500,
        };

        // respawn si JE suis victime (mode classic)
        if (hit.payload.targetUid === ctx.uid && ls.mode === 'classic') {
          const { x, y } = pickRespawn(hit.payload.x, hit.payload.y);
          ctx.me.x = x; ctx.me.y = y;

          ctx.invulnerableUntil = performance.now() + GAME_CONSTANTS.INVULN_MS;
          const untilMs = Date.now() + GAME_CONSTANTS.INVULN_MS;

          runInInjectionContext(ctx.env, async () => {
            try {
              const ref = doc(ctx.match.fs, `rooms/${ctx.matchId}/players/${ctx.uid}`);
              await updateDoc(ref, { iFrameUntilMs: untilMs });
            } catch {}
          });

          ctx.positions.writeSelf(ctx.matchId, ctx.uid, x, y, ctx.role as string);
        }
      } else {
        // autres types: no-op (extension possible)
      }
    }
    ctx.cd.markForCheck();
  });
}
