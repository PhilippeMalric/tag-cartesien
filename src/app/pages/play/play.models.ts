// Position de base (x, y)
export type Pos = { x: number; y: number };

/** Position d'un autre joueur, avec données d'anneau (invulnérabilité / cooldown chasseur) */
export type OtherPos = Pos & {
  /** Deadline epoch (ms) pour dessiner l’anneau */
  iFrameUntilMs?: number;
  /** (Optionnel) Type d’anneau pour styler différemment si besoin */
  ringKind?: 'victim' | 'hunter';
};

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
  spawn?: { x: number; y: number };

  // Cooldown / retag control
  cantTagUntilMs?: number;
  noRetagUid?: string;
  noRetagUntilMs?: number;
};

export const GAME_CONSTANTS = {
  TAG_RADIUS: 5,                 // rayon de tag
  TAG_COOLDOWN_MS: 5000,
  INVULN_MS: 1000,
  RESPAWN_BOUNDS: { minX: -45, maxX: 45, minY: -45, maxY: 45, minDistFromHunter: 12 },

  // Déplacements par pas
  MOVE_COOLDOWN_MS_CHASSEUR: 100, // (ms)
  MOVE_COOLDOWN_MS_CHASSE: 150,   // (ms)
  STEP_UNITS_CHASSEUR: 6,
  STEP_UNITS_CHASSE: 5,
} as const;

export interface RenderState {
  me: { x: number; y: number };
  role: 'chasseur' | 'chassé' | null;
  /** Autres joueurs : accepte l’anneau via iFrameUntilMs */
  others: Map<string, OtherPos>;
  tagRadius: number;
  /** Deadline perf.now() (ms) pour l’anneau du joueur local */
  invulnerableUntil: number;
  hunterUid: string | null;
  /** (Optionnel) feedback local temporaire, si tu le conserves */
  hunterIFrameUntilMs?: number;
}

export const PLAY_COLORS = {
  self: '#3fa7ff',    // toi-même
  other: '#9aa0a6',   // autres joueurs (neutres)
  hunter: '#ff7a00',  // chasseur
  victim: '#34a853',  // chassé
};
