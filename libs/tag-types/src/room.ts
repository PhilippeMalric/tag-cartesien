import type { GameMode } from './game-mode';

export type Role = 'hunter' | 'prey';
export type RolesMap = Record<string, Role>;

/** Marqueurs pour timestamps (on évite la dépendance directe à Firebase ici) */
export type FirestoreTimestamp = unknown; // ex. firebase.firestore.Timestamp
export type RtdbEpochMs = number;         // Date.now()

export interface RoomDoc {
  name: string;
  ownerUid: string;
  state: 'idle' | 'running' | 'ended';
  mode: GameMode;
  targetScore: number;
  timeLimit: number | null;
  /** Map UID -> role (optionnelle pour alléger l’écriture) */
  roles?: RolesMap;
  /** UID du chasseur courant (peut être null/undefined selon le mode) */
  hunterUid?: string | null;
  roundEndAtMs?: number | null;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}
