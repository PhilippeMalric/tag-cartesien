import {
  Component, ChangeDetectionStrategy, inject, Input, OnInit, OnDestroy,
  EnvironmentInjector, runInInjectionContext
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import {
  Observable, Subscription, combineLatest, map, startWith, of, firstValueFrom,
  filter,
  take,
  shareReplay
} from 'rxjs';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

// Auth (AngularFire fournit l’instance Auth modulaire)
import { Auth as FirebaseAuth, signInAnonymously } from '@angular/fire/auth';

// Modèles & services
import { Player } from './player.model';
import { Role, RoomService, RoomDoc } from './room.service';

type PlayerVM = Player & { roleResolved: Role | null };

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
  private readonly router   = inject(Router);
  private readonly route    = inject(ActivatedRoute);
  private readonly env      = inject(EnvironmentInjector);
  protected readonly auth   = inject(FirebaseAuth);
  private readonly roomSvc  = inject(RoomService);

  @Input() roomId = '';
  @Input() isOwner = false; // fallback si fourni par parent

  // Flux bruts
  players$: Observable<Player[]> = of([]);
  room$:    Observable<RoomDoc | null> = of(null);

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

    // Auth + ensure player doc
    runInInjectionContext(this.env, async () => {
      if (!this.auth.currentUser) {
        await signInAnonymously(this.auth);
      }
      const uid = this.auth.currentUser!.uid;
      const displayName = this.auth.currentUser?.displayName || 'Joueur';
      try {
        await this.roomSvc.ensureSelfPlayerDoc(this.roomId, uid, displayName);
        this.log(`FS ensureSelfPlayerDoc(${this.roomId}, ${uid})`);
      } catch (e: any) {
        this.log(`FS ensureSelfPlayerDoc — ERREUR: ${e?.message || e}`);
      }
    });

    // Streams
    runInInjectionContext(this.env, () => {
      this.players$   = this.roomSvc.players$(this.roomId).pipe(shareReplay({bufferSize:1, refCount:true}));
      this.room$      = this.roomSvc.room$(this.roomId).pipe(shareReplay({bufferSize:1, refCount:true}));

      const uid = this.auth.currentUser?.uid ?? '';

      this.isOwner$ = this.room$.pipe(map(r => !!r && r.ownerUid === uid));

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

      this.playersVM$ = combineLatest([this.players$, this.room$]).pipe(
        map(([players, room]) => {
          const roles = (room?.roles ?? {}) as Record<string, Role | undefined>;
          return (players ?? []).map(p => ({
            ...p,
            roleResolved: (p.role ?? roles[p.uid] ?? null) as PlayerVM['roleResolved'],
          }));
        })
      ).pipe(shareReplay({bufferSize:1, refCount:true}));;
    });

    // Suivre mon état ready
    this.subs.add(
      this.players$.subscribe(ps => {
        const myUid = this.auth.currentUser?.uid;
        if (!myUid) return;
        const me = ps.find(p => p.uid === myUid);
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
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    try {
      await this.roomSvc.toggleReady(this.roomId, uid, !this.myReady);
      this.log(`FS toggleReady(${!this.myReady})`);
      this.myReady = !this.myReady; // MAJ optimiste
    } catch (e: any) {
      this.log(`FS toggleReady — ERREUR: ${e?.message || e}`);
    }
  }

  async start(): Promise<void> {
    if (this.isStarting) return;
    this.isStarting = true;
    try {
      await this.roomSvc.start(this.roomId); // assigne les rôles + passe à running
      this.log('FS start() → state="running"');
      // Navigation déclenchée par room$
    } catch (e: any) {
      this.log(`start() — ERREUR: ${e?.message || e}`);
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Owner: tirer un chasseur depuis l'état courant (playersVM$)
   * among: 'all' | 'ready' (fallback auto sur all si aucun prêt)
   */
  async chooseRandomHunter(among: 'all' | 'ready' = 'all') {
    try {
      // 1) attendre la 1ʳᵉ valeur NON VIDE de playersVM$
      const list = await firstValueFrom(
        this.playersVM$.pipe(
          filter(arr => Array.isArray(arr) && arr.length > 0),
          take(1)
        )
      );

      // 2) construire le pool depuis CE snapshot UI
      const allPlayers = list.filter(p => p?.uid && !String(p.uid).startsWith('bot-'));
      const readyPlayers = allPlayers.filter(p => !!p.ready);

      let pool = allPlayers;
      if (among === 'ready') {
        pool = readyPlayers.length ? readyPlayers : allPlayers; // fallback auto
      }

      if (!pool.length) {
        this.log(`Owner: tirage chasseur impossible (joueurs: ${allPlayers.length}, prêts: ${readyPlayers.length}, pool: ${among})`);
        return;
      }

      // 3) tirage
      const idx = Math.floor(Math.random() * pool.length);
      const hunterUid = pool[idx].uid;

      // 4) construire les rôles à appliquer
      const roles: Record<string, 'chasseur' | 'chassé'> = {};
      for (const p of allPlayers) {
        roles[p.uid] = (p.uid === hunterUid ? 'chasseur' : 'chassé');
      }

      // 5) appliquer les rôles (owner-only selon tes règles)
      await this.roomSvc.applyRoles(this.roomId, roles);

      this.log(`Owner: chasseur tiré au sort → ${hunterUid} (joueurs: ${allPlayers.length}, prêts: ${readyPlayers.length}, pool: ${among})`);
    } catch (e: any) {
      this.log(`Owner: tirage chasseur — ERREUR: ${e?.message || e}`);
    }
  }
}
