import {
  Component, ChangeDetectionStrategy, inject, Input, OnInit, OnDestroy,
  EnvironmentInjector, runInInjectionContext
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AsyncPipe, CommonModule } from '@angular/common';
import {
  Observable, Subscription, combineLatest, map, of, firstValueFrom,
  filter, take, shareReplay, Subject, debounceTime, distinctUntilChanged
} from 'rxjs';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Auth
import { Auth as FirebaseAuth, signInAnonymously } from '@angular/fire/auth';

// Modèles & services
import { Player } from './player.model';
import { Role, RoomService } from './room.service';
import { RoomDoc } from '../../models/room.model';

// UI
import { MapPickerComponent } from './ui/map-picker.component';

// Spawn (signals partagés)
import { SpawnCoordService } from '../../services/spawn-coord.service';

type HunterScope = 'all' | 'ready';
type PlayerVM = Player & { roleResolved: Role | null };

@Component({
  selector: 'app-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe, CommonModule,
    MatToolbarModule, MatButtonModule, MatIconModule,
    MatCardModule, MatListModule, MatProgressBarModule, MatTooltipModule,
    MatMenuModule, MatSelectModule, MatDividerModule, MatProgressSpinnerModule,
    MapPickerComponent
  ],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.scss'],
})
export class RoomComponent implements OnInit, OnDestroy {
  // --- Injections
  private readonly router   = inject(Router);
  private readonly route    = inject(ActivatedRoute);
  private readonly env      = inject(EnvironmentInjector);
  protected readonly auth   = inject(FirebaseAuth);
  private readonly roomSvc  = inject(RoomService);
  private readonly snack    = inject(MatSnackBar);

  // --- Entrées
  @Input() roomId = '';
  @Input() isOwner = false; // fallback si fourni par parent

  // --- Services exposés au template
  public readonly spawn = inject(SpawnCoordService);

  // --- Observables exposés au template
  public players$: Observable<Player[]> = of([]);
  public room$:    Observable<RoomDoc | null> = of(null);
  public playersVM$: Observable<PlayerVM[]> = of([]);
  public isOwner$!: Observable<boolean>;
  public canStart$!: Observable<boolean>;

  // --- État UI exposé
  public myReady = false;
  public isStarting = false;
  public mode: 'classic' | 'infection' | 'transmission' = 'classic';

  public pickingHunter = false;
  public lastPickedHunter: { uid: string; displayName?: string } | null = null;

  // Logs (optionnels)
  public writes: string[] = [];
  private log(msg: string) {
    const t = new Date().toLocaleTimeString();
    this.writes = [`[${t}] ${msg}`, ...this.writes].slice(0, 30);
  }

  // Sauvegarde spawn (debounced)
  private saveSpawn$ = new Subject<{x:number;y:number}>();
  private subs = new Subscription();

  async ngOnInit(): Promise<void> {
    if (!this.roomId) this.roomId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.roomId) { this.router.navigate(['/lobby']); return; }

    // Auth + ensure player doc
    await runInInjectionContext(this.env, async () => {
      if (!this.auth.currentUser) await signInAnonymously(this.auth);
      const uid = this.auth.currentUser!.uid;
      const displayName = this.auth.currentUser?.displayName || 'Joueur';
      try {
        await this.roomSvc.ensureSelfPlayerDoc(this.roomId, uid, displayName);
        this.log(`FS ensureSelfPlayerDoc(${this.roomId}, ${uid})`);
      } catch (e: any) {
        this.log(`FS ensureSelfPlayerDoc — ERREUR: ${e?.message || e}`);
      }
    });

    // Streams Firestore
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
        ),
        shareReplay({bufferSize:1, refCount:true})
      );

      this.playersVM$ = combineLatest([this.players$, this.room$]).pipe(
        map(([players, room]) => {
          const roles = (room?.roles ?? {}) as Record<string, Role | undefined>;
          return (players ?? []).map(p => ({
            ...p,
            roleResolved: (p.role ?? roles[p.uid] ?? null) as PlayerVM['roleResolved'],
          }));
        }),
        shareReplay({bufferSize:1, refCount:true})
      );
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

    // Navigation auto vers /play quand la partie démarre
    this.subs.add(
      this.room$.subscribe(r => {
        if (!r) return;
        const m = (r as any).mode as any;
        if (m && this.mode !== m) this.mode = m;

        if (r.state === 'running' || r.state === 'in-progress') {
          this.log(`NAV → /play/${this.roomId}`);
          this.router.navigate(['/play', this.roomId]);
        }
      })
    );

    // Sauvegarde spawn debounce
    this.subs.add(
      this.saveSpawn$
        .pipe(
          debounceTime(250),
          distinctUntilChanged((a, b) => a.x === b.x && a.y === b.y)
        )
        .subscribe(async (xy) => {
          const uid = this.auth.currentUser?.uid; if (!uid) return;
          try {
            await this.roomSvc.setMySpawn(this.roomId, uid, xy);
            this.log(`FS setMySpawn(${xy.x}, ${xy.y})`);
          } catch (e:any) {
            this.log(`setMySpawn — ERREUR: ${e?.message || e}`);
          }
        })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  // --- Méthodes appelées par le template (publiques) ---

  public goLobby(): void {
    this.router.navigate(['/lobby']);
  }

  public async toggleReady(): Promise<void> {
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

  public async start(): Promise<void> {
    if (this.isStarting) return;
    this.isStarting = true;
    try {
      await this.roomSvc.start(this.roomId); // assigne les rôles + passe à running
      this.log('FS start() → state="running"');
    } catch (e: any) {
      this.log(`start() — ERREUR: ${e?.message || e}`);
    } finally {
      this.isStarting = false;
    }
  }

  /** Owner: tirage du chasseur depuis l’état courant */
  public async pickHunter(scope: HunterScope): Promise<void> {
    if (this.pickingHunter) return;
    this.pickingHunter = true;
    try {
      const picked = await this.chooseRandomHunter(scope);
      this.lastPickedHunter = picked || null;
      const name = picked?.displayName || picked?.uid || 'inconnu';
      this.snack.open(`Chasseur choisi : ${name}`, 'OK', { duration: 2500 });
    } catch (e: any) {
      this.snack.open(`Impossible de choisir le chasseur : ${e?.message || e}`, 'OK', { duration: 3500 });
    } finally {
      this.pickingHunter = false;
    }
  }

  public async setMode(m: 'classic'|'infection'|'transmission') {
    try {
      await this.roomSvc.setMode(this.roomId, m);
      this.mode = m;
      this.log(`FS setMode(${m})`);
    } catch (e: any) {
      this.log(`setMode — ERREUR: ${e?.message || e}`);
    }
  }

  public async endNow() {
    try {
      await this.roomSvc.setState(this.roomId, 'ended');
      this.log('FS setState(ended)');
    } catch (e: any) {
      this.log(`endNow — ERREUR: ${e?.message || e}`);
    }
  }

  /** Appel depuis le MapPicker (xyChange) */
  public onSpawnChange(xy: {x:number;y:number}) {
    this.spawn.set(xy);
    this.saveSpawn$.next(xy);
  }

  // --- Détails privés ---
  private async chooseRandomHunter(among: 'all' | 'ready' = 'all') {
    try {
      const list = await firstValueFrom(
        this.playersVM$.pipe(filter(arr => Array.isArray(arr) && arr.length > 0), take(1))
      );

      const allPlayers = list.filter(p => p?.uid && !String(p.uid).startsWith('bot-'));
      const readyPlayers = allPlayers.filter(p => !!p.ready);

      let pool = allPlayers;
      if (among === 'ready') pool = readyPlayers.length ? readyPlayers : allPlayers;

      if (!pool.length) {
        this.log(`Owner: tirage chasseur impossible (joueurs: ${allPlayers.length}, prêts: ${readyPlayers.length}, pool: ${among})`);
        throw new Error('Aucun joueur éligible au tirage.');
      }

      const idx = Math.floor(Math.random() * pool.length);
      const hunterUid = pool[idx].uid;

      const roles: Record<string, 'chasseur' | 'chassé'> = {};
      for (const p of allPlayers) roles[p.uid] = (p.uid === hunterUid ? 'chasseur' : 'chassé');

      await this.roomSvc.applyRoles(this.roomId, roles);
      this.log(`Owner: chasseur tiré au sort → ${hunterUid} (joueurs: ${allPlayers.length}, prêts: ${readyPlayers.length}, pool: ${among})`);

      const chosen = pool[idx];
      return { uid: chosen.uid, displayName: chosen.displayName };
    } catch (e: any) {
      this.log(`Owner: tirage chasseur — ERREUR: ${e?.message || e}`);
      throw e;
    }
  }
}
