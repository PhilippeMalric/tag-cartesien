// functions/src/modes/index.ts
import classic from './impl/classic';
import transmission from './impl/transmission';
import { GameModeHandler } from './types';

export const handlers: Record<string, GameModeHandler> = {
  classic,
  transmission,
};
