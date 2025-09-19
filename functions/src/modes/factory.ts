import type { GameModeHandler, ModeName } from "./types.js";



// Registre des modes implémentés (extensions .js obligatoires en NodeNext)
export const REGISTRY = Object.freeze({
  classic:      () => import("./impl/classic.js"),
  transmission: () => import("./impl/transmission.js"),
  infection:    () => import("./impl/infection.js"),
} as const);

type RegistryKey = keyof typeof REGISTRY;

const CACHE = new Map<RegistryKey, GameModeHandler>();

export async function getModeHandler(name?: ModeName): Promise<GameModeHandler> {
  const requested = (name ?? "classic") as ModeName;
  const key: RegistryKey = (requested in REGISTRY ? requested : "classic") as RegistryKey;

  const cached = CACHE.get(key);
  if (cached) return cached;

  const mod = await REGISTRY[key]().catch(() => REGISTRY.classic());

  const handler: GameModeHandler =
    (mod.default as GameModeHandler) ??
    (Object.values(mod).find(
      (v) => v && typeof v === "object" && "onTag" in (v as any)
    ) as GameModeHandler);

  if (!handler) {
    throw new Error(`Mode handler not found in module for "${key}".`);
  }

  CACHE.set(key, handler);
  return handler;
}
