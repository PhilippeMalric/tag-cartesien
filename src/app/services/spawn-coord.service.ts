import { inject, Injectable, signal } from '@angular/core';
import { RoomService } from '../pages/room';

@Injectable({ providedIn: 'root' })
export class SpawnCoordService {
  private _x = signal<number>(0);
  private _y = signal<number>(0);
private readonly roomSvc  = inject(RoomService);


  xy() { return { x: this._x(), y: this._y() }; }
  set(v: { x: number; y: number }) {
    this._x.set(Math.max(-50, Math.min(50, Math.round(v.x))));
    this._y.set(Math.max(-50, Math.min(50, Math.round(v.y))));
  }
  setX(x: number) { this.set({ x, y: this._y() }); }
  setY(y: number) { this.set({ x: this._x(), y }); }
}
