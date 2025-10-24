// src/app/pages/room/room.types.ts
import type { Role, RolesMap, RoomDoc, PlayerDoc } from '@tag/types';

/** Alias sémantique pour l’UI (le FR est identique aux valeurs Role) */
export type RoleFR = Role;                  // 'hunter' | 'prey'
export type RoleAny = Role;                 // aligné sur @tag/types
export type HunterScope = 'all' | 'ready';

export interface PlayerVM {
  uid: string;
  displayName: string;
  ready: boolean;
  /** Rôle brut (s’il vient du player doc ou de la room) */
  role?: RoleAny;
  /** Rôle normalisé pour l’affichage */
  roleResolved: RoleFR | null;
  score: number;
  iFrameUntilMs?: number;
  spawn?: { x: number; y: number };
  cantTagUntilMs?: number;
}

/** Types de domaine ré-exportés quand utile dans le module Room */
export type { Role, RolesMap, RoomDoc, PlayerDoc };
