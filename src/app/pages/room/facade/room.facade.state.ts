// FILE: src/app/pages/room/facade/room.facade.state.ts
import { Injectable, signal } from '@angular/core';
import type { Observable, Subject } from 'rxjs';
import type { Role, GameMode, RoomDoc } from '@tag/types';
import type { Player } from '../player.model';
import type { PlayerVM } from '../room.models';

@Injectable({ providedIn: 'root' })
export class RoomFacadeState {
  // Identité / routing
  roomId = '';
  sentToPlay = false;

  // Flux bruts (alimentés par la façade)
  players$!: Observable<Player[]>;
  room$!:    Observable<RoomDoc | null>;

  // Flux dérivés
  playersVM$!:   Observable<PlayerVM[] | null>;
  isOwner$!:     Observable<boolean>;
  canStart$!:    Observable<boolean>;
  readyCount$!:  Observable<number>;
  totalCount$!:  Observable<number>;
  startHint$!:   Observable<string>;

  // UI simples
  myReady = signal(false);
  isStarting = signal(false);
  pickingHunter = signal(false);
  lastPickedHunter = signal<{ uid: string; displayName?: string } | null>(null);

  // Mode local
  mode = signal<GameMode>('classic');

  // Debounce “sauver spawn”
  saveSpawn$!: Subject<{ x: number; y: number }>;

  // Logs
  writes: string[] = [];
  log(msg: string) {
    const t = new Date().toLocaleTimeString();
    this.writes = [`[${t}] ${msg}`, ...this.writes].slice(0, 30);
  }

  reset() {
    this.roomId = '';
    this.sentToPlay = false;
    this.players$ = undefined as any;
    this.room$    = undefined as any;
    this.playersVM$ = undefined as any;
    this.isOwner$ = undefined as any;
    this.canStart$ = undefined as any;
    this.readyCount$ = undefined as any;
    this.totalCount$ = undefined as any;
    this.startHint$ = undefined as any;
    this.myReady.set(false);
    this.isStarting.set(false);
    this.pickingHunter.set(false);
    this.lastPickedHunter.set(null);
    this.mode.set('classic');
    this.writes = [];
  }
}
