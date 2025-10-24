// src/app/pages/room/room.component.ts
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  EnvironmentInjector,
  inject,
  input,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AsyncPipe, CommonModule } from '@angular/common';
import { MapPickerComponent, MAT, MatSnackBar } from './room.imports';

import { RoomFacade } from './room.facade';
import type { PlayerVM } from './room.models';
import type { RoomDoc, GameMode } from '@tag/types';
import { Observable, of } from 'rxjs';
import { MonitorBotsService } from 'src/app/core/monitor-bots.service';

@Component({
  selector: 'app-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, AsyncPipe, MapPickerComponent, ...MAT],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.scss'],
})
export class RoomComponent implements OnInit, OnDestroy {
  // Inputs (compat HTML)
  roomId  = input<string>('');
  isOwner = input<boolean>(false); // non utilisé directement (owner ⇒ via facade.isOwner$)

  // Injections
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly env    = inject(EnvironmentInjector);
  private readonly snack  = inject(MatSnackBar);

  // Façade (logique déplacée)
  private readonly facade = inject(RoomFacade);

  // Expositions → HTML (proxies sur la façade)
  public playersVM$: Observable<PlayerVM[] | null> = of(null);
  public isOwner$!:  Observable<boolean>;
  public canStart$!: Observable<boolean>;

  public mode: GameMode = 'classic';
  public myReady = false;
  public pickingHunter = false; // lu/écrit via facade, on expose get/set
  public lastPickedHunter: { uid: string; displayName?: string } | null = null;

  private readonly botsSvc = inject(MonitorBotsService);

  // Map Picker (le HTML utilise spawn.xy())
  public readonly spawn = this.facade.spawn;

  // ===== Cycle de vie =====
  async ngOnInit(): Promise<void> {
    const id = this.roomId() || this.route.snapshot.paramMap.get('id') || '';
    await this.facade.init(id);

    // brancher les streams/publics de la façade
    this.playersVM$       = this.facade.playersVM$;
    this.isOwner$         = this.facade.isOwner$;
    this.canStart$        = this.facade.canStart$;
    this.mode             = this.facade.mode;
    this.myReady          = this.facade.myReady;
    this.pickingHunter    = this.facade.pickingHunter;
    this.lastPickedHunter = this.facade.lastPickedHunter;
  }

  ngOnDestroy(): void {
    // RoomFacade s’auto-désabonne via DestroyRef
  }

  // ===== Proxies pour garder le HTML inchangé =====
  goLobby() { this.facade.goLobby(); }
  onSpawnChange(xy: { x:number; y:number }) { this.facade.onSpawnChange(xy); }
  async toggleReady() { await this.facade.toggleReady(); }
  async start() { await this.facade.start(); }
  async setMode(m: GameMode) { await this.facade.setMode(m); this.mode = this.facade.mode; }
  async endNow() { await this.facade.endNow(); }
  async pickHunter(scope: 'all'|'ready') {
    this.pickingHunter = true;
    try {
      await this.facade.pickHunter(scope);
      this.lastPickedHunter = this.facade.lastPickedHunter;
    } finally {
      this.pickingHunter = false;
    }
  }

  /**
   * Toggle chasseur multi (bouton par joueur) — le HTML appelle déjà cette signature.
   * On délègue à OwnerActionsService via facade (qui expose les helpers requis).
   */
  public async onToggleHunter(targetUid: string, isCurrentlyHunter: boolean): Promise<void> {
    try {
      const newRole = await this.facade.toggleHunter(targetUid, isCurrentlyHunter);
      const msg = (newRole === 'hunter') ? 'Défini comme chasseur' : 'Rendu chassé';
      this.snack.open(msg, 'OK', { duration: 2000 });
    } catch (e: any) {
      this.snack.open(String(e?.message || e), 'OK', { duration: 3000 });
    }
  }

 /** Crée 1 bot (rôle par défaut: 'prey') dans la room courante. */
  public async addBot(role: 'hunter'|'prey' = 'prey'): Promise<void> {
    const roomId = this.currentRoomId;
    if (!roomId) {
      this.snack.open('Room ID manquant', 'OK', { duration: 2000 });
      return;
    }
    try {
      const uid = await this.botsSvc.addBot(roomId, 'Bot', role);
      this.snack.open(`Bot créé: ${uid ?? 'inconnu'}`, 'OK', { duration: 2000 });
    } catch (e: any) {
      this.snack.open(`Erreur création bot: ${e?.message || e}`, 'OK', { duration: 3000 });
    }
  }

  private get currentRoomId(): string {
    return (typeof this.roomId === 'function' ? this.roomId() : this.roomId as any) 
          || this.route.snapshot.paramMap.get('id') 
          || '';
  }
}
