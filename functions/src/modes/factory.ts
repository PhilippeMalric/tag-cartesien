import type { GameModeHandler, ModeName } from './types';

type LazyModule = () => Promise<{ default?: GameModeHandler } & Record<string, any>>;

const REGISTRY: Record<ModeName, LazyModule> = {
  classic:      () => import('./impl/classic'),
  transmission: () => import('./impl/transmission'),
  infection:    () => import('./impl/infection'),
  freeze:       () => import('./impl/freeze'),
  'hot-potato': () => import('./impl/hot-potato'),
  assassin:     () => import('./impl/assassin'),
  elimination:  () => import('./impl/elimination'),
  koth:         () => import('./impl/koth'),
} as const;

const CACHE = new Map<ModeName, GameModeHandler>();

export async function getModeHandler(name?: ModeName): Promise<GameModeHandler> {
  const key = (name ?? 'classic') as ModeName;
  const cached = CACHE.get(key);
  if (cached) return cached;

  const mod = await REGISTRY[key]().catch(() => REGISTRY['classic']());
  const handler: GameModeHandler =
    (mod.default as GameModeHandler) ??
    (Object.values(mod).find(v => v && typeof v === 'object' && 'onTag' in (v as any)) as GameModeHandler);

  if (!handler) throw new Error(`Mode handler introuvable: ${key}`);
  CACHE.set(key, handler);
  return handler;
}
