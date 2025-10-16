import { ref, onValue, off } from '@angular/fire/database';
import type { PlayCtx } from '../play.types';
import type { LocalState } from './local-state';

export function attachBotsListener(ctx: PlayCtx, ls: LocalState) {
  let lastBots: Record<string, { x: number; y: number; t?: number; role?: string }> = {};

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
    (ls as any).lastBots = clean; // stocke dans ls pour positions.sub
    ctx.cd.markForCheck();
  };

  onValue(botsRef, botsHandler);

  // disposer pour detach
  (ls as any).stopBots = () => off(botsRef, 'value', botsHandler);
}
