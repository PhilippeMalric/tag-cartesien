// FILE: src/app/pages/room/facade/room.facade.ts
import {
  Injectable, inject, DestroyRef, EnvironmentInjector, runInInjectionContext
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Auth } from '@angular/fire/auth';

import { RoomFacadeState } from './room.facade.state';
import { RoomFacadeStreams } from './room.facade.streams';
import { RoomFacadeActions } from './room.facade.actions';
import { PositionsService } from '../../play';
import { SpawnCoordService } from '../room.imports';

@Injectable({ providedIn: 'root' })
export class RoomFacade {
  private readonly state   = inject(RoomFacadeState);
  private readonly streams = new RoomFacadeStreams();
  private readonly actions = new RoomFacadeActions();

  private readonly destroy = inject(DestroyRef);
  private readonly env     = inject(EnvironmentInjector);
  private readonly router  = inject(Router);
  private readonly auth    = inject(Auth);
  private readonly positions = inject(PositionsService);
 public readonly spawn = inject(SpawnCoordService);
  private saveSpawnSub = new Subscription();

  constructor() {
    // debounced saveSpawn wiring
    this.state.saveSpawn$ = new Subject<{ x: number; y: number }>();
    this.saveSpawnSub.add(
      this.state.saveSpawn$
        .pipe(debounceTime(250), distinctUntilChanged((a,b)=>a.x===b.x && a.y===b.y))
        .subscribe(({ x, y }) => this.actions.applySpawn(x, y).catch(e => this.state.log(`applySpawn — ${e?.message||e}`)))
    );

    this.destroy.onDestroy(() => {
      this.saveSpawnSub.unsubscribe();
      this.streams.stop();
    });
  }

  /** Nouveau point d’entrée : reset complet + init + spawn (optionnel) + wiring */
  async enterRoom(roomId: string, opts: { randomOnEnter?: boolean } = { randomOnEnter: true }) {
    // 1) stop + reset local
    this.streams.stop();
    this.state.reset();
    this.state.roomId = roomId;
    this.state.sentToPlay = false;

    // 2) auth + ensure player doc
    const uid = await this.actions.ensureAuthAndPlayerDoc(roomId);

    // 3) wiring des streams (players$, room$, dérivés, nav auto…)
    this.streams.wireStreams();

    // 4) optionnel : spawn aléatoire immédiat (écrit FS + RTDB + local)
    if (opts.randomOnEnter) {
      const s = this.actions.pickRandomSpawn();
      await this.actions.applySpawn(s.x, s.y);
    }
  }

  // ---- Expose l’API attendue par les templates (backwards compat) ----
  get players$()    { return this.state.players$; }
  get room$()       { return this.state.room$; }
  get playersVM$()  { return this.state.playersVM$; }
  get isOwner$()    { return this.state.isOwner$; }
  get canStart$()   { return this.state.canStart$; }
  get readyCount$() { return this.state.readyCount$; }
  get totalCount$() { return this.state.totalCount$; }
  get startHint$()  { return this.state.startHint$; }

  get mode()        { return this.state.mode(); }
  set mode(m)       { this.state.mode.set(m); }

  get writes()      { return this.state.writes; }
  get myReady()     { return this.state.myReady(); }
  get pickingHunter(){ return this.state.pickingHunter(); }
  get lastPickedHunter(){ return this.state.lastPickedHunter(); }

  trackPlayer      = this.actions.trackPlayer;
  onSpawnChange    = this.actions.onSpawnChange.bind(this.actions);
  toggleReady      = this.actions.toggleReady.bind(this.actions);
  start            = this.actions.start.bind(this.actions);
  setMode          = this.actions.setMode.bind(this.actions);
  endNow           = this.actions.endNow.bind(this.actions);
  pickHunter       = this.actions.pickHunter.bind(this.actions);

  async toggleHunter(targetUid: string, isCurrentlyHunter: boolean) {
    return this.actions.toggleHunter(targetUid, isCurrentlyHunter);
  }

  goLobby(): void {
    this.router.navigate(['/lobby']);
  }
}
