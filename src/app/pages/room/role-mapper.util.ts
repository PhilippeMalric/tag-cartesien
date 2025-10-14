import type { Role } from '@tag/types';

/** Normalise un libellé potentiel (FR/EN) vers Role EN. */
export function frToRole(v: unknown): Role | null {
  if (v === 'hunter' || v === 'prey') return v;
  if (v === 'hunter') return 'hunter';
  if (v === 'prey') return 'prey';
  return null;
}

/** Assure un Record<string, Role> (ignore les valeurs invalides). */
export function toRoleMap(input?: Record<string, any> | null): Record<string, Role> {
  const out: Record<string, Role> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) {
    const r = frToRole(v);
    if (r) out[k] = r;
  }
  return out;
}

/** Label FR pour affichage. */
export function roleLabelFR(role?: Role | null): string {
  if (role === 'hunter') return 'hunter';
  if (role === 'prey') return 'prey';
  return '—';
}
