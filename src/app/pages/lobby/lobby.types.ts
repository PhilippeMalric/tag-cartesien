// Types partagés du lobby

export type RoomVM = {
  id: string;
  ownerUid: string;
  players?: number;
  targetScore: number;
  timeLimit: number;
  state: 'idle' | 'running' | 'in-progress' | 'done';
  updatedAt?: any;
  createdAtMs: number;   // ← ajout: timestamp ms de création
};