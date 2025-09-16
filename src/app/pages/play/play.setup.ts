import { runInInjectionContext } from '@angular/core';
import { doc, setDoc, updateDoc } from '@angular/fire/firestore';
import { pickRespawn } from './respawn.util';
import { GAME_CONSTANTS, TagEvent } from './play.models';
import type { Player } from '../room/player.model';
import type { PlayCtx } from './play.types';

/**
 * Branche toute la logique “runtime” (auth, listeners, subscriptions, loop).
 * Retourne un disposer à appeler dans ngOnDestroy().
 */
export function setupPlay(ctx: PlayCtx): () => void {
  // Subscriptions / timers / listeners pour clean-up
  let mySub: any, roomSub: any, eventsSub: any, playersSub: any;
  let timerId: any = null;
  let rafId = 0;
  const handledEventIds = new Set<string>();

  const onKeyDown = (e: KeyboardEvent) => ctx.keys.add(e.key.toLowerCase());
  const onKeyUp = (e: KeyboardEvent) => ctx.keys.delete(e.key.toLowerCase());

  const isOwnerNow = () => !!ctx.uid && !!ctx.roomOwnerUid && ctx.uid === ctx.roomOwnerUid;
  const moveCooldownMs = () => ctx.role === 'chasseur'
    ? GAME_CONSTANTS.MOVE_COOLDOWN_MS_CHASSEUR
    : GAME_CONSTANTS.MOVE_COOLDOWN_MS_CHASSE;
  const stepUnits = () => ctx.role === 'chasseur'
    ? GAME_CONSTANTS.STEP_UNITS_CHASSEUR
    : GAME_CONSTANTS.STEP_UNITS_CHASSE;
  const moveReady = () => (performance.now() - ctx.lastMoveAt) >= moveCooldownMs();

  // --------- BOOTSTRAP APRÈS AUTH ---------
  const bootstrap = () => {
    // Clavier
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Noms (annonces)
    playersSub = ctx.roomSvc.players$(ctx.matchId).subscribe((players: Player[]) => {
      // rien à stocker ici côté ctx, on résout les noms “à la volée” via map Firestore côté MatchService si besoin
      // (si tu veux garder un map des noms: crée un Map<string,string> sur ctx et remplis-la ici)
      ctx.cd.markForCheck();
    });

    // Mon doc joueur
    mySub = ctx.match.myPlayer$(ctx.matchId).subscribe((d) => {
      if (d) {
        ctx.role = (d.role ?? ctx.role ?? null) as any;
        ctx.myScore = d.score ?? 0;
      }
      ctx.cd.markForCheck();
    });

    // Room (rôles + chrono + owner + auto-bots)
    roomSub = ctx.match.room$(ctx.matchId).subscribe((room) => {
      if (!room) return;

      ctx.roomOwnerUid = room.ownerUid ?? null;
      ctx.targetScore = room.targetScore ?? 0;

      const roles = (room.roles ?? null) as Record<string, 'chasseur' | 'chassé'> | null;
      if (roles) {
        const mine = roles[ctx.uid] ?? null;
        if (mine && ctx.role !== mine) {
          ctx.role = mine;
          // sync vers mon doc joueur (utile p.ex. pour overlay ailleurs)
          runInInjectionContext(ctx.env, async () => {
            try {
              const ref = doc(ctx.match.fs, `rooms/${ctx.matchId}/players/${ctx.uid}`);
              await setDoc(ref, { role: mine }, { merge: true });
            } catch {}
          });
        }
        ctx.hunterUid = Object.keys(roles).find(k => roles[k] === 'chasseur') ?? null;
      }

      const endMs = room.roundEndAtMs as number | undefined;
      if (endMs) {
        const tick = () => {
          ctx.timeLeft = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
          if (ctx.timeLeft === 0 && isOwnerNow()) {
            ctx.match.endByTimer(ctx.matchId).catch(() => {});
          }
          ctx.cd.markForCheck();
        };
        tick();
        if (timerId) clearInterval(timerId);
        timerId = setInterval(tick, 250);
      }

      // Auto-spawn bots si demandé (une fois)
      if (isOwnerNow() && (ctx.desiredBots ?? 0) > 0) {
        ctx.bots.spawn(ctx.matchId, Math.min(ctx.desiredBots!, 12));
        // on zero pour éviter respawn si room$ émet de nouveau
        ctx.desiredBots = 0;
      }

      if (room.state === 'ended') {
        if (timerId) clearInterval(timerId);
        ctx.router.navigate(['/score', ctx.matchId]);
      }
      ctx.cd.markForCheck();
    });

    // Events (annonces + respawn victime)
    eventsSub = ctx.match.events$(ctx.matchId).subscribe((events: TagEvent[]) => {
      for (const ev of events) {
        const id = ev.id ?? `${ev.hunterUid}:${ev.victimUid}:${ev.ts?.seconds ?? ''}`;
        if (handledEventIds.has(id)) continue;
        handledEventIds.add(id);

        if (ev.type === 'tag') {
          // Annonce simple (si tu as un map de noms, remplace ev.* par affichage lisible)
          ctx.recentTag = { label: `${ev.hunterUid.slice(0,6)} a tagué ${ev.victimUid.slice(0,6)}`, until: Date.now() + 2500 };

          if (ev.victimUid === ctx.uid) {
            const { x, y } = pickRespawn(ev.x, ev.y);
            ctx.me.x = x; ctx.me.y = y;

            ctx.invulnerableUntil = performance.now() + GAME_CONSTANTS.INVULN_MS;
            const untilMs = Date.now() + GAME_CONSTANTS.INVULN_MS;
            runInInjectionContext(ctx.env, async () => {
              try {
                const ref = doc(ctx.match.fs, `rooms/${ctx.matchId}/players/${ctx.uid}`);
                await updateDoc(ref, { iFrameUntilMs: untilMs });
              } catch {}
            });

            ctx.positions.writeSelf(ctx.matchId, ctx.uid, x, y);
          }
        }
      }
      ctx.cd.markForCheck();
    });

    // Positions + spawn initial
    ctx.positions.attachPresence(ctx.matchId, ctx.uid);
    ctx.positions.startListening(ctx.matchId);

    {
      const spawn = pickRespawn();
      ctx.me.x = spawn.x; ctx.me.y = spawn.y;
      ctx.positions.writeSelf(ctx.matchId, ctx.uid, spawn.x, spawn.y);
      ctx.lastMoveAt = performance.now() - moveCooldownMs();
      ctx.moveProgress = 100;
    }

    ctx.positions.positions$.subscribe((map) => {
      ctx.debug.posUids = Object.keys(map || {});
      ctx.others.clear();
      for (const [id, p] of Object.entries(map || {})) {
        if (id === ctx.uid) continue; // garde aussi les bots (ids préfixés "bot-")
        if ((p as any)?.x == null || (p as any)?.y == null) continue;
        ctx.others.set(id, { x: (p as any).x, y: (p as any).y });
      }
      ctx.cd.markForCheck();
    });

    // Boucle de jeu
    let last = performance.now();
    const loop = (t: number) => {
      const _dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      // Progress cooldown déplacement
      const elapsed = performance.now() - ctx.lastMoveAt;
      const newProgress = Math.max(0, Math.min(100, (elapsed / moveCooldownMs()) * 100));
      if (Math.abs(newProgress - ctx.moveProgress) > 0.5) {
        ctx.moveProgress = newProgress;
        ctx.zone.run(() => ctx.cd.markForCheck());
      }

      // Direction
      let vx = 0, vy = 0;
      const k = ctx.keys;
      if (k.has('w') || k.has('z') || k.has('arrowup'))    vy -= 1;
      if (k.has('s') || k.has('arrowdown'))                vy += 1;
      if (k.has('a') || k.has('q') || k.has('arrowleft'))  vx -= 1;
      if (k.has('d') || k.has('arrowright'))               vx += 1;
      const mag = Math.hypot(vx, vy);
      if (mag > 0) { vx /= mag; vy /= mag; }

      // Pas discret si prêt
      if (ctx.uid && moveReady() && mag > 0) {
        const step = stepUnits();
        const nx = Math.max(-50, Math.min(50, ctx.me.x + Math.round(vx * step)));
        const ny = Math.max(-50, Math.min(50, ctx.me.y + Math.round(vy * step)));
        ctx.me.x = nx; ctx.me.y = ny;
        ctx.positions.writeSelf(ctx.matchId, ctx.uid, nx, ny);
        ctx.lastMoveAt = performance.now();
      }

      // Tag (chasseur)
      if (ctx.role === 'chasseur'
          && (performance.now() - ctx.lastTagMs) >= GAME_CONSTANTS.TAG_COOLDOWN_MS) {
        const victim = findVictimWithinRadius(ctx);
        if (victim) {
          const projected = ctx.myScore + 1;
          ctx.match.emitTag(ctx.matchId, ctx.me.x, ctx.me.y, victim.uid)
            .then(() => {
              ctx.lastTagMs = performance.now();
              ctx.match.endIfTargetReached(ctx.matchId, projected);
            })
            .catch((e: unknown) => {
              // OK d’ignorer si la victime est bot et non-supportée par Firestore
              console.error('[emitTag]', e);
            });
        }
      }

      // Rendu
      ctx.renderer.draw(ctx.canvasRef.nativeElement, {
        me: ctx.me,
        others: ctx.others,
        role: ctx.role,
        invulnerableUntil: ctx.invulnerableUntil,
        tagRadius: GAME_CONSTANTS.TAG_RADIUS,
      });

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  };

  // Auth → bootstrap
  runInInjectionContext(ctx.env, () => {
    ctx.auth.onAuthStateChanged((u) => {
      if (!u) { ctx.router.navigate(['/auth']); return; }
      const first = !ctx.uid;
      ctx.uid = u.uid;
      ctx.debug.uid = ctx.uid;
      if (first) bootstrap();
    });
    if (ctx.uid) bootstrap();
  });

  // Clean-up
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    mySub?.unsubscribe?.();
    roomSub?.unsubscribe?.();
    eventsSub?.unsubscribe?.();
    playersSub?.unsubscribe?.();
    ctx.positions.stop();
    if (timerId) clearInterval(timerId);
    handledEventIds.clear();

    // Nettoyage bots si owner (évite bots fantômes)
    if (isOwnerNow()) ctx.bots.stopAll(ctx.matchId);
  };
}

// --- Utils ---
function findVictimWithinRadius(ctx: PlayCtx): { uid: string; dist: number } | null {
  let best: { uid: string; dist: number } | null = null;
  for (const [uid, p] of ctx.others) {
    const d = Math.hypot(p.x - ctx.me.x, p.y - ctx.me.y);
    if (d <= GAME_CONSTANTS.TAG_RADIUS && (!best || d < best.dist)) best = { uid, dist: d };
  }
  return best;
}
