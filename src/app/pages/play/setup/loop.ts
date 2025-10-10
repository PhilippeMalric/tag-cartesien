import { inject, runInInjectionContext } from '@angular/core';
import type { PlayCtx } from '../play.types';
import { GAME_CONSTANTS } from '../play.models';
import { findVictimWithinRadius, remainingInvulnMs } from '../play.helpers';
import { ToastService } from '../../../services/toast.service';
import { LocalState } from './local-state';

export function startGameLoop(ctx: PlayCtx, ls: LocalState) {
  let last = performance.now();

  const loop = (t: number) => {
    const _dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    // Cooldown déplacement → jauge
    const elapsed = performance.now() - ctx.lastMoveAt;
    const newProgress = Math.max(0, Math.min(100, (elapsed / moveCooldownMs(ctx)) * 100));
    if (Math.abs(newProgress - ctx.moveProgress) > 0.5) {
      ctx.moveProgress = newProgress;
      ctx.zone.run(() => ctx.cd.markForCheck());
    }

   // Direction (WASD/ZQSD/flèches)
    let vx = 0, vy = 0;
    const k = ctx.keys;
    if (k.has('w') || k.has('z') || k.has('arrowup'))    vy += 1;
    if (k.has('s') || k.has('arrowdown'))                 vy -= 1;
    if (k.has('a') || k.has('q') || k.has('arrowleft'))   vx -= 1;
    if (k.has('d') || k.has('arrowright'))                vx += 1;
    const mag = Math.hypot(vx, vy);
    if (mag > 0) { vx /= mag; vy /= mag; }

    // Tick de mouvement => on envoie une INTENTION (Δx, Δy) au serveur
    if (ctx.uid && moveReady(ctx) && mag > 0) {
      const step = stepUnits(ctx);                       // taille du pas par tick
      const dx = Math.round(vx * step);
      const dy = Math.round(vy * step);

      // 🔮 PRÉDICTION LOCALE (facultative mais recommandée)
      const nx = Math.max(-50, Math.min(50, ctx.me.x + dx));
      const ny = Math.max(-50, Math.min(50, ctx.me.y + dy));
      ctx.me.x = nx;
      ctx.me.y = ny;

      // 🚀 ENVOI D’INTENTION au serveur autoritaire (Cloud Function onIntent)
      // -> Assure-toi d’avoir implémenté PositionsService.sendIntent(...)
      ctx.positions.sendIntent(ctx.matchId, ctx.uid, dx, dy, ctx.role as string)
        .catch(() => { /* best-effort, on ne bloque pas l’UI */ });

      ctx.lastMoveAt = performance.now();
    }

    //console.log("ctx.role", ctx.role);
    
    // Tag (chasseur)
    if ((ctx.role === 'hunter' ) && performance.now() - ctx.lastTagMs >= GAME_CONSTANTS.TAG_COOLDOWN_MS) {
      const victim = findVictimWithinRadius(ctx);
      if (victim) {
        console.log("victim", victim);
        
        const projected = ctx.myScore + 1;
        const invMs = remainingInvulnMs(victim as any);
        if (invMs > 0) {
          runInInjectionContext(ctx.env, () => {
            const toast = inject(ToastService);
            toast.toast(`Invulnérable encore ${(invMs / 1000).toFixed(1)} s`);
          });
        } else {
          ctx.lastTagMs = performance.now();
          ctx.match.emitTag(ctx.matchId, ctx.me.x, ctx.me.y, victim.uid)
            .then(() => ctx.match.endIfTargetReached(ctx.matchId, projected))
            .catch((e: unknown) => console.error('[emitTag]', e));
        }
      }
    }

    // Rendu
    ctx.renderer.draw(ctx.canvasRef.nativeElement, {
      me: ctx.me,
      others: ctx.others,
      role: ctx.role,
      invulnerableUntil: ctx.invulnerableUntil,
      tagRadius: GAME_CONSTANTS.TAG_RADIUS,
      hunterUid: ctx.hunterUid,
      hunterIFrameUntilMs: ctx.hunterIFrameUntilMs,
    });

    ls.rafId = requestAnimationFrame(loop);
  };

  ls.rafId = requestAnimationFrame(loop);
}

export function stopGameLoop(ls: LocalState) {
  cancelAnimationFrame(ls.rafId);
}

/* === Helpers locaux === */
function moveCooldownMs(ctx: PlayCtx) {
  return ctx.role === 'hunter'
    ? GAME_CONSTANTS.MOVE_COOLDOWN_MS_CHASSEUR
    : GAME_CONSTANTS.MOVE_COOLDOWN_MS_CHASSE;
}
function stepUnits(ctx: PlayCtx) {
  return ctx.role === 'hunter'
    ? GAME_CONSTANTS.STEP_UNITS_CHASSEUR
    : GAME_CONSTANTS.STEP_UNITS_CHASSE;
}
function moveReady(ctx: PlayCtx) {
  return (performance.now() - ctx.lastMoveAt) >= moveCooldownMs(ctx);
}
