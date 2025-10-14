// libs/tag-types/src/events.ts

import { GameMode } from "./game-mode";

// 1) (recommandé) assure que 'tag/hit' est bien dans EventType
export type EventType =
  | 'room/created'
  | 'room/updated'
  | 'player/join'
  | 'player/leave'
  | 'tag/hit'; // ← ajouté

// 2) BaseEvent générique (T par défaut = EventType)
// (laisse cette définition dans son fichier d'origine si déjà existante)
export interface BaseEvent<T extends string = EventType> {
  id: string;
  type: T;
  ts: number;        // timestamp (ms)
  roomId: string;
  actorUid?: string;
  // ... autres champs communs
}


/** Charge utile standardisée pour un tag */
export interface TagHitPayload {
  /** chasseur */
  byUid: string;
  /** victime */
  targetUid: string;
  mode: GameMode;
  x: number;
  y: number;
}

/** Événement tag/hit (lecture/écriture)
 *  Remarque: `createdAt` est optionnel et typé en `unknown` pour ne pas
 *  coupler cette lib à Firebase; selon le contexte, ce sera un `Timestamp`
 *  (lecture) ou un `FieldValue` (écriture avec serverTimestamp()).
 */
export interface TagHitEvent extends BaseEvent<'tag/hit'> {
  payload: TagHitPayload;
  createdAt?: unknown;
}

// 4) Union d'events
export type EventItem =
  | TagHitEvent
  // | RoomCreatedEvent
  // | PlayerJoinEvent
  // ... ajoute tes autres événements spécifiques ici ...
  | BaseEvent; // fallback générique (optionnel)

// 5) Type guard pratique
export function isTagHitEvent(ev: BaseEvent): ev is TagHitEvent {
  return ev.type === 'tag/hit';
}
