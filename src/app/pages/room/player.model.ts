import { Role } from "./room.service";

export type Player = {
  uid: string;
  displayName: string;
  ready?: boolean;
  role?: Role;
  score?: number;
  iFrameUntilMs?: number;
  spawn?: { x: number; y: number }; // ← ajout
};
