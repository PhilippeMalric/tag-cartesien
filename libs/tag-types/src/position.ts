/** Position stockée en RTDB (coordonnées carte) */
export interface Position {
  x: number;
  y: number;
  updatedAt?: number; // epoch ms
}
export type PositionMap = Record<string, Position>;
