// src/app/models/room.model.ts
export type GameMode = 'classic' | 'transmission' | 'infection';

export type RoomState = 'idle' | 'running' | 'in-progress' | 'ended';

export interface RoomDoc {
  id?: string;
  ownerUid: string;
  state: RoomState;
  mode: GameMode;
  targetScore?: number;   // utilisé pour classic
  timeLimit?: number;     // optionnel (secondes)
  players?: number;
  createdAt?: any;
  updatedAt?: any;
  roles:any[];
  roundEndAtMs?:any
}

export type Mode = 'classic' | 'infection' | 'transmission';