import { runInInjectionContext } from '@angular/core';
import type { PlayCtx } from './play.types';
import { attachKeyboard, detachKeyboard } from './setup/keyboard';
import { createLocalState, isOwnerNow } from './setup/local-state';
import { startGameLoop, stopGameLoop } from './setup/loop';
import { attachSubscriptions } from './setup/attach';
import { detachSubscriptions } from './setup/detach';


export function setupPlay(ctx: PlayCtx): () => void {
  const ls = createLocalState(); // état local encapsulé

  const bootstrap = () => {
    // clavier
    attachKeyboard(ctx, ls);
    // streams + timers + presence + positions
    attachSubscriptions(ctx, ls);
    // boucle de rendu + gameplay
    startGameLoop(ctx, ls);
  };

  // Auth → bootstrap
  runInInjectionContext(ctx.env, () => {
    ctx.auth.onAuthStateChanged((u) => {
      if (!u) {
        ctx.router.navigate(['/auth']);
        return;
      }
      const first = !ctx.uid;
      ctx.uid = u.uid;
      ctx.debug.uid = ctx.uid;
      if (first) bootstrap();
    });
    if (ctx.uid) bootstrap();
  });

  // Disposeur (inchangé fonctionnellement)
  return () => {
    stopGameLoop(ls);
    detachKeyboard(ls);
    detachSubscriptions(ctx, ls);

    // Nettoyage bots si owner (évite bots fantômes)
    if (isOwnerNow(ctx)) ctx.bots.stopAll(ctx.matchId);
  };
}
