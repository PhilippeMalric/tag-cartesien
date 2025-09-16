export type Player = {
  id: string;
  displayName?: string;
  ready?: boolean;
  role?: 'chasseur' | 'chassé' | null;
  score?: number;
};
