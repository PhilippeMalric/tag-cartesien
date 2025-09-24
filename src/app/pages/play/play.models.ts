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
  spawn?: { x: number; y: number }; // ← ajout
  
  cantTagUntilMs?: number;
  // NEW (pour SANS RETAG)
  noRetagUid?: string;         // uid que je n'ai pas le droit de retag pour l'instant
  noRetagUntilMs?: number; 
};



export const GAME_CONSTANTS = {
  TAG_RADIUS: 5,                 // un peu plus large si déplacements par pas
  TAG_COOLDOWN_MS: 5000,
  INVULN_MS: 1000,
  RESPAWN_BOUNDS: { minX: -45, maxX: 45, minY: -45, maxY: 45, minDistFromHunter: 12 },

  // NOUVEAU: déplacements par pas
  MOVE_COOLDOWN_MS_CHASSEUR: 100, // 1s
  MOVE_COOLDOWN_MS_CHASSE: 150,   // 1.5s (tu peux mettre 2000 si tu veux)
  STEP_UNITS_CHASSEUR: 6,
  STEP_UNITS_CHASSE: 5,
} as const;


export interface RenderState {
  me: { x: number; y: number };
  role: 'chasseur' | 'chassé' | null;
  others: Map<string, { x: number; y: number }>;
  tagRadius: number;
  invulnerableUntil: number;
  hunterUid: string | null;   // ← NEW
  hunterIFrameUntilMs?: number;
}

export const PLAY_COLORS = {
  self: '#3fa7ff',           // toi-même (si tu en as un)
  other: '#9aa0a6',          // autres joueurs “neutres” (gris)
  hunter: '#ff7a00',         // 🔶 chasseur (orange)
  victim: '#34a853',         // chassé (optionnel)
};
