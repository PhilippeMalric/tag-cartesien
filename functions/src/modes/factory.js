// Registre des modes implémentés (extensions .js obligatoires en NodeNext)
export const REGISTRY = Object.freeze({
    classic: () => import("./impl/classic.js"),
    transmission: () => import("./impl/transmission.js"),
    infection: () => import("./impl/infection.js"),
});
const CACHE = new Map();
export async function getModeHandler(name) {
    const requested = (name ?? "classic");
    const key = (requested in REGISTRY ? requested : "classic");
    const cached = CACHE.get(key);
    if (cached)
        return cached;
    const mod = await REGISTRY[key]().catch(() => REGISTRY.classic());
    const handler = mod.default ??
        Object.values(mod).find((v) => v && typeof v === "object" && "onTag" in v);
    if (!handler) {
        throw new Error(`Mode handler not found in module for "${key}".`);
    }
    CACHE.set(key, handler);
    return handler;
}
