export type Pos = { x: number; y: number };

export type TagEvent = {
  id?: string;
  type: 'tag';
  hunterUid: string;
  victimUid: string;
  x?: number;
  y?: number;
  ts?: any;
};

export type MyPlayerDoc = {
  role?: 'chasseur' | 'chassé' | null;
  score?: number;
  iFrameUntilMs?: number;
};

export type RoomDoc = {
  ownerUid?: string | null;
  targetScore?: number;
  roundEndAtMs?: number;
  state?: 'idle' | 'in-progress' | 'ended';
  currentMatchId?: string | null;
  roles?: Record<string, 'chasseur' | 'chassé'>;
};

export const GAME_CONSTANTS = {
  TAG_RADIUS: 5,                 // un peu plus large si déplacements par pas
  TAG_COOLDOWN_MS: 800,
  INVULN_MS: 1200,
  RESPAWN_BOUNDS: { minX: -45, maxX: 45, minY: -45, maxY: 45, minDistFromHunter: 12 },

  // NOUVEAU: déplacements par pas
  MOVE_COOLDOWN_MS_CHASSEUR: 1000, // 1s
  MOVE_COOLDOWN_MS_CHASSE: 1500,   // 1.5s (tu peux mettre 2000 si tu veux)
  STEP_UNITS_CHASSEUR: 6,
  STEP_UNITS_CHASSE: 5,
} as const;


export type RenderState = {
  me: Pos;
  others: Map<string, Pos>;
  role: 'chasseur' | 'chassé' | null;
  invulnerableUntil: number;
  tagRadius: number;
};


