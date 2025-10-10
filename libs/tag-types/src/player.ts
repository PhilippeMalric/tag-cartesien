import type { Role } from './room';

export interface PlayerDoc {
  displayName?: string;
  role?: Role;
  /** Invulnérabilité “iframe” (ms epoch côté client/serveur) */
  iFrameUntilMs?: number;
  /** Anti-retag (ms epoch) */
  cantTagUntilMs?: number;
}
