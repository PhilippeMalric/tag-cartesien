import type { Role } from './room';

export interface PlayerDoc {
  /** Nom d’affichage (peut être null selon ton flux d’inscription) */
  displayName?: string | null;

  /** Rôle courant du joueur */
  role?: Role | null; // 'hunter' | 'prey' | 'bot'

  /** Score cumulé du joueur */
  score?: number; // défaut attendu: 0

  /** Début de la période “safe” (ms epoch) pour le timer de survie */
  safeSinceMs?: number;

  /** Nombre de paliers de 10 s déjà comptés depuis safeSinceMs */
  survivalTicks?: number;

  /** Invulnérabilité (“i-frame”) jusqu’à cette époque (ms epoch) */
  iFrameUntilMs?: number;

  /** Cooldown général pour tag (ms epoch) */
  cantTagUntilMs?: number;

  /** Anti-retag: dernière victime interdite à retoucher */
  noRetagUid?: string;

  /** Anti-retag actif jusqu’à cette époque (ms epoch) */
  noRetagUntilMs?: number;

  /** Timestamps serveur (si tu les écris) */
  createdAt?: any;  // FieldValue | Timestamp
  updatedAt?: any;  // FieldValue | Timestamp
}
