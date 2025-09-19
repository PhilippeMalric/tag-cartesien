export type ModeName =
  | 'classic'
  | 'transmission'
  | 'infection'
  | 'freeze'
  | 'hot-potato'
  | 'assassin'
  | 'elimination'
  | 'koth';

export interface ModeContext {
  matchId: string;
  hunterUid: string;
  victimUid: string;
  now: number;
  db: FirebaseFirestore.Firestore;
  room: any;
  players: Map<string, any>; // uid -> player data
}

export interface GameModeHandler {
  onTag(ctx: ModeContext): Promise<void>;
  onTick?(ctx: { matchId: string; now: number; db: FirebaseFirestore.Firestore; room: any }): Promise<void>;
  isEnd?(room: any, players: Map<string, any>): boolean | { winnerUids: string[] };
}
