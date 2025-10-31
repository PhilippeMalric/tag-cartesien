// src/app/pages/room/room.component.ts
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  input,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AsyncPipe, CommonModule } from '@angular/common';
import { MapPickerComponent, MAT, MatSnackBar } from './room.imports';

import type { PlayerVM } from './room.models';
import type { RoomDoc, GameMode } from '@tag/types';
import { Observable, of } from 'rxjs';
import { MonitorBotsService } from 'src/app/core/monitor-bots.service';

// ✅ nouvelle façade refactorisée (state/streams/actions) + enterRoom()
import { RoomFacade } from './facade/room.facade';

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
  isOwner = input<boolean>(false); // info redondante: on lit facade.isOwner$ pour l’UI

  // Injections
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack  = inject(MatSnackBar);
  private readonly botsSvc = inject(MonitorBotsService);

  // Façade
  private readonly facade = inject(RoomFacade);

  // Expositions → HTML
  public playersVM$: Observable<PlayerVM[] | null> = of(null);
  public isOwner$!:  Observable<boolean>;
  public canStart$!: Observable<boolean>;

  // MapPicker : on expose le service de spawn de la façade (inchangé côté template)
  public readonly spawn = this.facade.spawn;

  // ---- Propriétés « simples » exposées via getters/setters pour rester réactif ----
  get mode(): GameMode { return this.facade.mode; }
  set mode(m: GameMode) { this.facade.mode = m; }

  get myReady(): boolean { return this.facade.myReady; }

  get pickingHunter(): boolean { return this.facade.pickingHunter; }
  set pickingHunter(_v: boolean) {
    // no-op: la valeur réelle est gérée par la façade; on garde le setter pour compat template
  }

  get lastPickedHunter(): { uid: string; displayName?: string } | null {
    return this.facade.lastPickedHunter;
  }
  set lastPickedHunter(_v: { uid: string; displayName?: string } | null) {
    // no-op (compat)
  }

  // ===== Cycle de vie =====
  async ngOnInit(): Promise<void> {
    const id = this.roomId() || this.route.snapshot.paramMap.get('id') || '';
    // ➜ nouvelle entrée : reset + auth + wiring + (optionnel) spawn aléatoire écrit FS/RTDB
    await this.facade.enterRoom(id, { randomOnEnter: true });

    // branchement des flux exposés par la façade
    this.playersVM$ = this.facade.playersVM$;
    this.isOwner$   = this.facade.isOwner$;
    this.canStart$  = this.facade.canStart$;
  }

  ngOnDestroy(): void {
    // Rien à faire ici : la façade nettoie ses subs via DestroyRef
  }

  // ===== Proxies pour garder le HTML inchangé =====
  goLobby() { this.facade.goLobby(); }

  onSpawnChange(xy: { x:number; y:number }) {
    this.facade.onSpawnChange(xy);
  }

  async toggleReady() {
    await this.facade.toggleReady();
  }

  async start() {
    await this.facade.start();
  }

  async setMode(m: GameMode) {
    await this.facade.setMode(m);
    // `mode` est déjà synchronisé via le getter/setter
  }

  async endNow() {
    await this.facade.endNow();
  }

  async pickHunter(scope: 'all'|'ready') {
    // le flag réel est dans la façade; on conserve la signature
    try {
      await this.facade.pickHunter(scope);
      // lastPickedHunter est lu via le getter
    } catch (e: any) {
      this.snack.open(String(e?.message || e), 'OK', { duration: 3000 });
    }
  }

  /**
   * Toggle chasseur multi (bouton par joueur) — signature inchangée.
   */
  public async onToggleHunter(targetUid: string, isCurrentlyHunter: boolean): Promise<void> {
    try {
      const newRole = await this.facade.toggleHunter(targetUid, isCurrentlyHunter);
      const msg = (newRole === 'hunter') ? 'Défini comme chasseur' : 'Rendu chassé';
      this.snack.open(msg, 'OK', { duration: 2000 });
    } catch (e: any) {
      this.snack.open(`Erreur: ${String(e?.message || e)}`, 'OK', { duration: 3000 });
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
    return (typeof this.roomId === 'function' ? this.roomId() : (this.roomId as any))
        || this.route.snapshot.paramMap.get('id')
        || '';
  }
}
