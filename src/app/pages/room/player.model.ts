import type { PlayerDoc, Role } from '@tag/types';

export type Player = PlayerDoc & {
  uid: string;                   // idField injecté côté client
  displayName: string;           // si tu veux forcer required côté UI
  ready?: boolean;
  role?: Role;
  score?: number;
  spawn?: { x: number; y: number };
};
