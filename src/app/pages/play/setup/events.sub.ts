// src/app/pages/play/setup/events.sub.ts
import { runInInjectionContext } from '@angular/core';
import { doc, updateDoc } from '@angular/fire/firestore';
import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';
import { pickRespawn } from '../respawn.util';
import { GAME_CONSTANTS } from '../play.models';
import { isOwnerNow } from './local-state';

// types @tag/types
import type { EventItem, TagHitEvent } from '@tag/types';
import { isTagHitEvent } from '@tag/types';

export function attachEventsSub(ctx: PlayCtx, ls: LocalState) {
  ls.eventsSub = ctx.match.events$(ctx.matchId).subscribe((events: EventItem[]) => {
    if (!Array.isArray(events) || !events.length) return;

    for (const ev of events) {
      // ——— Ne traite que 'tag/hit' avec payload (payload-only comme souhaité)
      if (!isTagHitEvent(ev) || !ev?.payload) continue;
      const hit = ev as TagHitEvent;
      const p = hit.payload;
      const byUid = p.byUid;
      const targetUid = p.targetUid;

      if (!byUid || !targetUid) continue;

      // id stable pour éviter doublons locaux
      const id = hit.id ?? `tag/hit:${byUid}:${targetUid}:${hit.ts ?? ''}`;
      if (ls.handledEventIds.has(id)) continue;
      ls.handledEventIds.add(id);

      // Bandeau d’info (optionnel)
      ctx.recentTag = {
        label: `${byUid.slice(0, 6)} a tagué ${targetUid.slice(0, 6)}`,
        until: Date.now() + 2500,
      };

      // 🟢 Cas 1 — la victime est un BOT → téléportation aléatoire (OWNER uniquement)
      if (targetUid.startsWith('bot-') && isOwnerNow(ctx)) {
        void ctx.bots.teleportToRandom(ctx.matchId, targetUid, p.x, p.y).catch(() => {});
        continue;
      }

      // 🟠 Cas 2 — JE suis la victime (joueur humain, mode classic) → respawn + iFrame
      if (targetUid === ctx.uid && ls.mode === 'classic') {
        const { x, y } = pickRespawn(p.x, p.y);
        ctx.me.x = x; ctx.me.y = y;

        // iFrame local (UI)
        ctx.invulnerableUntil = performance.now() + GAME_CONSTANTS.INVULN_MS;
        const untilMs = Date.now() + GAME_CONSTANTS.INVULN_MS;

        // iFrame persistée pour rendu côté autres clients (FS)
        runInInjectionContext(ctx.env, async () => {
          try {
            const refFs = doc(ctx.match.fs, `rooms/${ctx.matchId}/players/${ctx.uid}`);
            await updateDoc(refFs, { iFrameUntilMs: untilMs });
          } catch {}
        });

        // Position côté RTDB (positions/) pour diffusion
        ctx.positions.writeSelf(ctx.matchId, ctx.uid, x, y, ctx.role as string);
      }

      // (Autres victimes humaines) → no-op ici
    }

    ctx.cd.markForCheck();
  });
}
