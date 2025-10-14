import type { Role } from '@tag/types';

/** Map typé des rôles par uid */
export type RoleMap = Record<string, Role | undefined>;

/** Type guard pour une valeur Role valide */
function isRole(v: unknown): v is Role | null | undefined {
  return v === 'hunter' || v === 'prey' || v === null || typeof v === 'undefined';
}

/** 
 * Coerce tout input (y compris any[]) en RoleMap sûr.
 * - Rejette les tableaux (pas d’index string) → renvoie {}.
 * - Ne conserve que les valeurs Role valides.
 */
export function toRoleMap(input: unknown): RoleMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return Object.freeze({}) as RoleMap;
  }
  const out: RoleMap = {};
  for (const [uid, val] of Object.entries(input as Record<string, unknown>)) {
    if (isRole(val)) out[uid] = val as Role | undefined;
  }
  return out;
}
