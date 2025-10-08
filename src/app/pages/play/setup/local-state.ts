import type { PlayCtx } from '../play.types';

export interface LocalState {
  playersById: Record<string, any>;
  mySub?: { unsubscribe(): void };
  roomSub?: { unsubscribe(): void };
  eventsSub?: { unsubscribe(): void };
  playersSub?: { unsubscribe(): void };
  positionsSub?: { unsubscribe(): void };
  timerId: any;
  rafId: number;
  handledEventIds: Set<string>;
  didInitialSpawn: boolean;
  mode: string;
}

export function createLocalState(): LocalState {
  return {
    playersById: {},
    timerId: null,
    rafId: 0,
    handledEventIds: new Set<string>(),
    didInitialSpawn: false,
    mode: '',
  };
}

export const WORLD = { minX: -50, maxX: 50, minY: -50, maxY: 50 };

export function isOwnerNow(ctx: PlayCtx) {
  return !!ctx.uid && !!ctx.roomOwnerUid && ctx.uid === ctx.roomOwnerUid;
}
