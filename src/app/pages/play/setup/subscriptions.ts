import { runInInjectionContext } from '@angular/core';
import { doc, setDoc, updateDoc } from '@angular/fire/firestore';
import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';
import { isOwnerNow } from './local-state';
import { pickRespawn } from '../respawn.util';
import { GAME_CONSTANTS } from '../play.models';
import type { Player } from '../../room/player.model';
import { clamp } from '../play.helpers';
import { ref, onValue, off } from '@angular/fire/database';

// ✅ types & type guard depuis @tag/types (Option A)
import type { EventItem, TagHitEvent } from '@tag/types';
import { isTagHitEvent } from '@tag/types';

export function attachSubscriptions(ctx: PlayCtx, ls: LocalState) {

  /* ===================== BOTS (RTDB via ctx.rtdb) ===================== */
  let lastBots: Record<string, { x: number; y: number; t?: number; role?: string }> = {};

  // Écoute bots/{matchId} depuis l’autre appli (ou ton BotService)
  const botsRef = ref(ctx.rtdb, `bots/${ctx.matchId}`);
  const botsHandler = (snap: any) => {
    const raw = (snap.val() ?? {}) as Record<string, any>;
    const clean: typeof lastBots = {};

    for (const id of Object.keys(raw)) {
      if (!id.startsWith('bot-')) continue; // convention UID bot
      const b = raw[id] || {};
      if (typeof b.x === 'number' && typeof b.y === 'number') {
        clean[id] = { x: b.x, y: b.y, t: b.t, role: b.role };
      }
    }
    lastBots = clean;
    ctx.cd.markForCheck();
  };
  onValue(botsRef, botsHandler);
  // disposer pour detach
  (ls as any).stopBots = () => off(botsRef, 'value', botsHandler);

  /* ===================== MODE ===================== */
  ctx.roomSvc.getMode$(ctx.matchId).subscribe((data: any) => {
    ls.mode = data || '';
  });

  /* ===================== PLAYERS (scores + hunter) ===================== */
  ls.playersSub = ctx.roomSvc.players$(ctx.matchId).subscribe((players: Player[]) => {
    ls.playersById = Object.fromEntries((players || []).map(p => [p.uid, p]));
    let hunter: any = null;
    if (ctx.hunterUid) {
      hunter = players.find((p: any) => p?.uid === ctx.hunterUid || p?.id === ctx.hunterUid) ?? null;
    }
    if (!hunter) hunter = players.find((p: any) => p?.role === 'hunter') ?? null;

    ctx.myScore = hunter?.score ?? 0;
    ctx.cd.markForCheck();
  });

  /* ===================== MON DOC JOUEUR ===================== */
  ls.mySub = ctx.match.myPlayer$(ctx.matchId).subscribe((d) => {
    if (d) {
      ctx.role = (d.role ?? ctx.role ?? null) as any;

      if (!ls.didInitialSpawn) {
        const sp = (d as any)?.spawn;
        if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.y)) {
          ctx.me.x = clamp(sp.x, -50, 50);
          ctx.me.y = clamp(sp.y, -50, 50);
        } else {
          const rnd = pickRespawn();
          ctx.me.x = rnd.x;
          ctx.me.y = rnd.y;
        }
        ctx.positions.writeSelf(ctx.matchId, ctx.uid, ctx.me.x, ctx.me.y, ctx.role as string);
        ctx.lastMoveAt = performance.now() - moveCooldownMs(ctx);
        ctx.moveProgress = 100;
        ls.didInitialSpawn = true;
      }
    }
    ctx.cd.markForCheck();
  });

  /* ===================== ROOM (roles / owner / timer / auto-bots / fin) ===================== */
  ls.roomSub = ctx.match.room$(ctx.matchId).subscribe((room) => {
    if (!room) return;

    ctx.roomOwnerUid = room.ownerUid ?? null;
    ctx.targetScore = room.targetScore ?? 0;

    const roles = (room.roles ?? null) as any;
    if (roles) {
      const mine = roles[ctx.uid] ?? null;
      if (mine && ctx.role !== mine) {
        ctx.role = mine;
        runInInjectionContext(ctx.env, async () => {
          try {
            const ref = doc(ctx.match.fs, `rooms/${ctx.matchId}/players/${ctx.uid}`);
            await setDoc(ref, { role: mine }, { merge: true });
          } catch {}
        });
      }
      const chasseurUids = Object.keys(roles).filter((k) => roles[k] === 'hunter');
      ctx.hunterUid = chasseurUids[0] ?? null;
      if (chasseurUids.length > 1) console.warn('[setupPlay] Plusieurs "hunter":', chasseurUids);
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

  /* ===================== EVENTS (annonces + respawn si je suis victime) ===================== */
  ls.eventsSub = ctx.match.events$(ctx.matchId).subscribe((events: EventItem[]) => {
    for (const ev of events) {
      console.log('[setupPlay] event', ev );
      
      // ——— Discrimination par type
      if (isTagHitEvent(ev)) {
        const hit = ev as TagHitEvent;

        // id stable pour éviter les doublons de traitement
        const id = hit.id ?? `tag/hit:${hit.payload.byUid}:${hit.payload.targetUid}:${hit.ts}`;
        if (ls.handledEventIds.has(id)) continue;
        ls.handledEventIds.add(id);

        // bandeau récent
        ctx.recentTag = {
          label: `${hit.payload.byUid.slice(0, 6)} a tagué ${hit.payload.targetUid.slice(0, 6)}`,
          until: Date.now() + 2500,
        };

        // respawn si JE suis la victime en mode classic
        if (hit.payload.targetUid === ctx.uid && ls.mode === 'classic') {
          console.log('[setupPlay] Je suis tagué, je respawn !');
          
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
        // autres types d’événements : no-op (ou ajoute tes handlers ici)
        // const id = ev.id ?? `${ev.type}:${ev.ts}`;
        // if (!ls.handledEventIds.has(id)) { ... }
      }
    }
    ctx.cd.markForCheck();
  });

  /* ===================== POSITIONS (merge HUMANS + BOTS) ===================== */
  ctx.positions.attachPresence(ctx.matchId, ctx.uid);
  ctx.positions.startListening(ctx.matchId);

  ls.positionsSub = ctx.positions.positions$.subscribe((map) => {
    ctx.debug.posUids = Object.keys(map || {});
    ctx.others.clear();

    // anneau "moi"
    const mePlayer = ls.playersById[ctx.uid];
    if (mePlayer) {
      const myEpoch =
        (typeof mePlayer.iFrameUntilMs === 'number' ? mePlayer.iFrameUntilMs : null)
        ?? (typeof mePlayer.cantTagUntilMs === 'number' ? mePlayer.cantTagUntilMs : null);
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
        (pl && typeof pl.iFrameUntilMs === 'number' ? pl.iFrameUntilMs : null)
        ?? (pl && typeof pl.cantTagUntilMs === 'number' ? pl.cantTagUntilMs : null);

      ctx.others.set(id, {
        x: pos.x,
        y: pos.y,
        iFrameUntilMs: ringEpoch && ringEpoch > Date.now() ? ringEpoch : undefined,
      });
    }

    // 2) BOTS (depuis RTDB via lastBots)
    for (const [id, b] of Object.entries(lastBots)) {
      ctx.others.set(id, { x: b.x, y: b.y });
    }

    ctx.cd.markForCheck();
  });
}

export function detachSubscriptions(ctx: PlayCtx, ls: LocalState) {
  ls.mySub?.unsubscribe?.();
  ls.roomSub?.unsubscribe?.();
  ls.eventsSub?.unsubscribe?.();
  ls.playersSub?.unsubscribe?.();
  ls.positionsSub?.unsubscribe?.();
  (ls as any).stopBots?.(); // ✅ coupe le listener RTDB des bots
  ctx.sub.unsubscribe();
  ctx.positions.stop();
  if (ls.timerId) clearInterval(ls.timerId);
  ls.handledEventIds.clear();
}

/* === Helpers === */
function moveCooldownMs(ctx: PlayCtx) {
  return ctx.role === 'hunter'
    ? GAME_CONSTANTS.MOVE_COOLDOWN_MS_CHASSEUR
    : GAME_CONSTANTS.MOVE_COOLDOWN_MS_CHASSE;
}
