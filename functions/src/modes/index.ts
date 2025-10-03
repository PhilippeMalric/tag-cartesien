// functions/src/modes/index.ts
import classic from './impl/classic.js';
import transmission from './impl/transmission.js';
import infection from './impl/infection.js';     // 🔸 NEW
import type  { GameModeHandler } from './types.js';

export const handlers: Record<string, GameModeHandler> = {
  classic,
  transmission,
  infection,                                  // 🔸 NEW
};
