// libs/tag-types/src/events.ts

// 1) (facultatif mais recommandé) assure que 'tag/hit' est bien dans EventType
export type EventType =
  | 'room/created'
  | 'room/updated'
  | 'player/join'
  | 'player/leave'
  | 'tag/hit'; // ← ajouté

// 2) BaseEvent devient générique (T par défaut = EventType)
export interface BaseEvent<T extends string = EventType> {
  id: string;
  type: T;
  ts: number;         // timestamp (ms)
  roomId: string;
  actorUid?: string;
  // ... autres champs communs
}

// 3) Spécialise les événements
export interface TagHitEvent extends BaseEvent<'tag/hit'> {
  hunterUid: string;
  preyUid: string;
  x: number;
  y: number;
}

export type EventItem =
  | TagHitEvent
  // | RoomCreatedEvent
  // | PlayerJoinEvent
  // ...ajoute tes autres événements spécifiques ici...
  | BaseEvent; // fallback générique (optionnel)

export function isTagHitEvent(ev: BaseEvent): ev is TagHitEvent {
  return ev.type === 'tag/hit';
}