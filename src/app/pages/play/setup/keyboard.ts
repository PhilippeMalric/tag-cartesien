import type { PlayCtx } from '../play.types';
import { LocalState } from './local-state';

const onKeyDown = (ctx: PlayCtx) => (e: KeyboardEvent) => ctx.keys.add(e.key.toLowerCase());
const onKeyUp   = (ctx: PlayCtx) => (e: KeyboardEvent) => ctx.keys.delete(e.key.toLowerCase());

export function attachKeyboard(ctx: PlayCtx, _ls: LocalState) {
  // délégués fixés pour pouvoir les retirer
  (attachKeyboard as any)._down = onKeyDown(ctx);
  (attachKeyboard as any)._up   = onKeyUp(ctx);
  window.addEventListener('keydown', (attachKeyboard as any)._down);
  window.addEventListener('keyup',   (attachKeyboard as any)._up);
}

export function detachKeyboard(_ls: LocalState) {
  const down = (attachKeyboard as any)._down;
  const up   = (attachKeyboard as any)._up;
  if (down) window.removeEventListener('keydown', down);
  if (up)   window.removeEventListener('keyup', up);
}
