import {
  Component, ChangeDetectionStrategy, inject, Input, OnInit, OnDestroy,
  EnvironmentInjector, runInInjectionContext
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { Observable, Subscription, combineLatest, map, startWith, of } from 'rxjs';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

// Auth
import { Auth as FirebaseAuth } from '@angular/fire/auth';

// Modèles & services
import { Player } from './player.model';
import { RoomService } from './room.service';

type PlayerVM = Player & { roleResolved: 'chasseur' | 'chassé' | null };

@Component({
  selector: 'app-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    MatToolbarModule, MatButtonModule, MatIconModule,
    MatCardModule, MatListModule, MatProgressBarModule, MatTooltipModule,
  ],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.scss'],
})
export class RoomComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);
  private readonly env    = inject(EnvironmentInjector);
  private readonly auth   = inject(FirebaseAuth);
  private readonly roomSvc = inject(RoomService);

  @Input() roomId = '';
  @Input() isOwner = false; // fallback si fourni par parent

  // Flux bruts
  players$: Observable<Player[]> = of([]);
  room$:    Observable<any>      = of(null);

  // Flux dérivés
  playersVM$: Observable<PlayerVM[]> = of([]);
  isOwner$!: Observable<boolean>;
  canStart$!: Observable<boolean>;

  // UI
  myReady = false;
  isStarting = false;

  // Debug
  writes: string[] = [];
  private subs = new Subscription();
  private log(msg: string) {
    const t = new Date().toLocaleTimeString();
    this.writes = [`[${t}] ${msg}`, ...this.writes].slice(0, 30);
  }

  ngOnInit(): void {
    if (!this.roomId) this.roomId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.roomId) { this.router.navigate(['/lobby']); return; }

    this.roomSvc.ensureSelfPlayerDoc(this.roomId)
      .then(() => this.log(`FS ensureSelfPlayerDoc(${this.roomId})`))
      .catch(() => this.log('FS ensureSelfPlayerDoc — ERREUR'));

    runInInjectionContext(this.env, () => {
      this.players$ = this.roomSvc.players$(this.roomId).pipe(startWith([] as Player[]));
      this.room$    = this.roomSvc.room$(this.roomId).pipe(startWith<any | null>(null));

      const uid = this.auth.currentUser?.uid ?? '';

      // 👑 owner ?
      this.isOwner$ = this.room$.pipe(map(r => !!r && r.ownerUid === uid));

      // ✅ peut démarrer ?
      this.canStart$ = combineLatest([this.players$, this.room$]).pipe(
        map(([players, room]) =>
          !!room &&
          room.state !== 'running' &&
          room.state !== 'in-progress' &&
          Array.isArray(players) &&
          players.length >= 2 &&
          players.every(p => !!p.ready)
        )
      );

      // 👤 joueurs avec rôle résolu (doc joueur.role OU room.roles[uid])
      this.playersVM$ = combineLatest([this.players$, this.room$]).pipe(
        map(([players, room]) => {
          const roles = (room?.roles ?? {}) as Record<string, 'chasseur' | 'chassé' | undefined>;
          return players.map(p => ({
            ...p,
            roleResolved: (p.role ?? roles[p.id] ?? null) as PlayerVM['roleResolved'],
          }));
        })
      );
    });

    // Suivre mon état ready
    this.subs.add(
      this.players$.subscribe(ps => {
        const uid = this.auth.currentUser?.uid;
        if (!uid) return;
        const me = ps.find(p => p.id === uid);
        if (typeof me?.ready === 'boolean') this.myReady = me.ready;
      })
    );

    // Naviguer quand la room démarre
    this.subs.add(
      this.room$.subscribe(r => {
        if (!r) return;
        if (r.state === 'running' || r.state === 'in-progress') {
          this.log(`NAV → /play/${this.roomId}`);
          this.router.navigate(['/play', this.roomId]);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  goLobby(): void {
    this.router.navigate(['/lobby']);
  }

  async toggleReady(): Promise<void> {
    try {
      await this.roomSvc.toggleReady(this.roomId, this.myReady);
      this.log(`FS toggleReady -> ${!this.myReady}`);
      this.myReady = !this.myReady; // MAJ optimiste
    } catch {
      this.log('FS toggleReady — ERREUR');
    }
  }

  async start(): Promise<void> {
    if (this.isStarting) return;
    this.isStarting = true;
    try {
      const players = await this.roomSvc.getPlayersSnapshot(this.roomId);
      await this.roomSvc.start(this.roomId, players); // écrit roles map + state
      this.log('FS start() → state="in-progress"');
      // La navigation est déclenchée par room$
    } catch (e: any) {
      this.log(`start() — ERREUR: ${e?.message || e}`);
    } finally {
      this.isStarting = false;
    }
  }
}
