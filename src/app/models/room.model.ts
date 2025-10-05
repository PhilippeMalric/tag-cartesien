import { Role } from "../pages/room";

// src/app/models/room.model.ts
export type GameMode = 'classic' | 'transmission' | 'infection';

export type RoomState = 'idle' | 'running' | 'in-progress' | 'ended';

export interface RoomDoc {
  /** Injecté par AngularFire docData({ idField: 'id' }) */
  id?: string;

  /** Propriétaire de la room (UID Firebase Auth) */
  ownerUid: string;

  /** État courant de la partie */
  state?: RoomState;

  /** Mode de jeu (facultatif) */
  mode?: GameMode;

  /**
   * Mapping des rôles par UID (humains et bots).
   * Exemple: { "uidA": "chasseur", "bot-123": "runner" }
   */
  roles?: Record<string, Role>;

  /** Option legacy si tu as encore un unique chasseur */
  hunterUid?: string;

  /** Libellé humain pour l’UI (optionnel) */
  name?: string;

  /** Dernier événement dans cette room (Timestamp Firestore ou Date ISO) */
  lastEventAt?: any;

  /** Touche générique de maj (Timestamp Firestore) */
  updatedAt?: any;

  /** Divers champs que tu as mentionnés dans les règles */
  players?: number;      // si tu comptes encore les joueurs
  targetScore?: number;
  timeLimit?: number;
  displayNameOwner?: string;
   roundEndAtMs?: number;
}

export type Mode = 'classic' | 'infection' | 'transmission';