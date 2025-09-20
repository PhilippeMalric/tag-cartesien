// Types partagés du lobby

import { GameMode } from "../../models/room.model";

export type RoomVM = {
  id: string;
  ownerUid: string;
  players?: number;
  targetScore: number;
  timeLimit: number;
  state: 'idle' | 'running' | 'in-progress' | 'done';
  updatedAt?: any;
  mode: GameMode; 
  createdAtMs: number;   // ← ajout: timestamp ms de création
};