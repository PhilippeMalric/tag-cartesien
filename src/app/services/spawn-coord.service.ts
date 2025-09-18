import { Injectable, computed, signal } from '@angular/core';

export type XY = { x: number; y: number };
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

@Injectable({ providedIn: 'root' })
export class SpawnCoordService {
  /** Source de vérité: coord. de départ en -50..50 (entiers) */
  private _xy = signal<XY>({ x: 0, y: 0 });

  /** Lecture réactive depuis les templates/components */
  readonly xy = computed(() => this._xy());

  set(xy: XY) {
    this._xy.set({
      x: clamp(Math.round(xy.x), -50, 50),
      y: clamp(Math.round(xy.y), -50, 50),
    });
  }
  setX(x: number) { this.set({ x, y: this._xy().y }); }
  setY(y: number) { this.set({ x: this._xy().x, y }); }
}
