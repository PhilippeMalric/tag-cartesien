import {
  Component, ChangeDetectionStrategy, inject, Input, OnInit, OnDestroy,
  EnvironmentInjector, runInInjectionContext, ChangeDetectorRef, NgZone, DestroyRef
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AsyncPipe, CommonModule } from '@angular/common';
import {
  Observable, Subscription, combineLatest, of, Subject, firstValueFrom
} from 'rxjs';
import {
  map, filter, take, shareReplay, debounceTime, distinctUntilChanged,
  switchMap, startWith,
  tap,
  auditTime
} from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
import { authState } from '@angular/fire/auth';

// Modèles & services
import { Player } from './player.model';
import { Role, RoomService } from './room.service';
import { RoomDoc } from '../../models/room.model';

// UI
import { MapPickerComponent } from './ui/map-picker.component';

// Spawn (signals partagés)
import { SpawnCoordService } from '../../services/spawn-coord.service';
import { OwnerActionsService } from './owner-actions.service';
import { RoomLogger } from './room-logger';
import { inZone } from './in-zone.operator';

// Utils (extraits pour nettoyer le composant)

type HunterScope = 'all' | 'ready';
type PlayerVM = Player & { roleResolved: Role | null };

@Component({
  selector: 'app-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
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
  private readonly cdr      = inject(ChangeDetectorRef);
  private readonly zone     = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ownerActions = inject(OwnerActionsService);

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

  // Logs (public pour le template)
  public writes: string[] = [];

  // Internes
  private logger = new RoomLogger(w => (this.writes = w));
  private saveSpawn$ = new Subject<{ x: number; y: number }>();
  private subs = new Subscription();

  private log(msg: string) { this.logger.log(msg); }




  async ngOnInit(): Promise<void> {
    // --- Helpers log ----------------------------------------------------------
    const tag = (phase: string) => `[RoomInit/${phase}]`;
    const logI = (...a: any[]) => console.info(...a);
    const logW = (...a: any[]) => console.warn(...a);
    const logE = (...a: any[]) => console.error(...a);

    // --- 0) Param route -------------------------------------------------------
    if (!this.roomId) this.roomId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.roomId) {
      logW(tag('route'), 'Aucun roomId dans l’URL → redirect /lobby');
      this.router.navigate(['/lobby']);
      return;
    }
    logI(tag('route'), 'roomId =', this.roomId);

    // --- 1) Auth + ensure player doc -----------------------------------------
    try {
      await runInInjectionContext(this.env, async () => {
        if (!this.auth.currentUser) {
          logI(tag('auth'), 'Pas d’utilisateur → signInAnonymously()...');
          await signInAnonymously(this.auth);
        }
        const uid = this.auth.currentUser!.uid;
        const displayName = this.auth.currentUser?.displayName || 'Joueur';

        logI(tag('player.ensure'), `ensureSelfPlayerDoc(room=${this.roomId}, uid=${uid}, name=${displayName})`);
        await this.roomSvc.ensureSelfPlayerDoc(this.roomId, uid, displayName);
        logI(tag('player.ensure'), 'OK');
      });
    } catch (e: any) {
      logE(tag('player.ensure'), 'ERREUR →', e?.message || e);
    }

    // --- 2) Flux réactifs (création + logs + subscriptions) ------------------
    runInInjectionContext(this.env, () => {
      // Flux bruts
     this.room$ = this.roomSvc.room$(this.roomId).pipe(
      startWith({ roles: {}, state: 'idle' } as any), // évite d’attendre la 1ʳᵉ valeur
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.players$ = this.roomSvc.players$(this.roomId).pipe(
      startWith([] as Player[]),                      // idem
      shareReplay({ bufferSize: 1, refCount: true })
    );

      // Propriétaire ?
      const uid = this.auth.currentUser?.uid ?? '';
      this.isOwner$ = this.room$.pipe(
        map(room => !!room && room.ownerUid === uid),
        tap(isOwner => logI(tag('isOwner$'), isOwner ? 'Tu es OWNER de la room' : 'Tu N’ES PAS OWNER')),
        startWith(false),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      // Peut démarrer ?
      this.canStart$ = combineLatest([this.players$, this.room$]).pipe(
        map(([players, room]) =>
          !!room &&
          room.state !== 'running' &&
          room.state !== 'in-progress' &&
          Array.isArray(players) &&
          players.length >= 2 &&
          players.every(p => !!p.ready)
        ),
        tap(can => logI(tag('canStart$'), can ? '✅ prêt à démarrer' : '⏳ conditions non remplies')),
        startWith(false),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      // Vue joueurs (humains + bots déduits)
      this.playersVM$ = combineLatest([this.players$, this.room$]).pipe(
          map(([players, room]) => {
            const roles = (room?.roles ?? {}) as Record<string, Role | undefined>;

            // Humains avec rôle résolu
            const humans = (players ?? []).map(p => ({
              ...p,
              roleResolved: (p.role ?? roles[p.uid] ?? null) as Role | null,
            }));

            // Bots déduits de room.roles
            const humanUids = new Set(humans.map(p => p.uid));
            const botUids = Object.keys(roles)
              .filter(uid => uid.startsWith('bot-') && !humanUids.has(uid));

            const bots = botUids.map(uid => ({
              uid,
              displayName: `🤖 Bot ${uid.slice(-4).toUpperCase()}`,
              ready: true,
              role: roles[uid],
              roleResolved: (roles[uid] ?? null) as Role | null,
              score: 0,
            }));

            humans.sort((a, b) => (a.displayName || a.uid).localeCompare(b.displayName || b.uid));
            bots.sort((a, b) => (a.displayName || a.uid).localeCompare(b.displayName || b.uid));

            return [...humans, ...bots];
          }),
          // regroupe les rafraîchissements qui arrivent en rafale (Firestore/RTDB)
          auditTime(16) // ~1 frame; retire-le si tu veux *absolument* chaque tick
        );
    });

    // Déclenche CD quand playersVM$ émet (utile pour les templates OnPush)
    this.playersVM$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        logI(tag('cd'), 'detectChanges()');
        this.cdr.detectChanges();
      });

    // Suivre mon état ready
    this.subs.add(
      this.players$.subscribe(ps => {
        const myUid = this.auth.currentUser?.uid;
        if (!myUid) return;
        const me = ps.find(p => p.uid === myUid);
        if (typeof me?.ready === 'boolean') {
          this.myReady = me.ready;
          logI(tag('self.ready'), `myReady = ${this.myReady}`);
        }
      })
    );

    // Navigation auto quand la partie démarre
    this.subs.add(
      this.room$.subscribe(r => {
        if (!r) return;
        const oldMode = this.mode;
        if (r.mode && r.mode !== oldMode) {
          this.mode = r.mode;
          logI(tag('mode'), `mode: ${oldMode ?? '∅'} → ${this.mode}`);
        }
        if (r.state === 'running' || r.state === 'in-progress') {
          logI(tag('nav'), `state=${r.state} → /play/${this.roomId}`);
          this.router.navigate(['/play', this.roomId]);
        }
      })
    );

    // Sauvegarde du spawn (debounce)
    this.subs.add(
      this.saveSpawn$
        .pipe(
          debounceTime(250),
          distinctUntilChanged((a, b) => a.x === b.x && a.y === b.y)
        )
        .subscribe(async (xy) => {
          const uid = this.auth.currentUser?.uid; if (!uid) return;
          try {
            logI(tag('spawn'), `setMySpawn(${xy.x}, ${xy.y})`);
            await this.roomSvc.setMySpawn(this.roomId, uid, xy);
            logI(tag('spawn'), 'OK');
          } catch (e: any) {
            logE(tag('spawn'), 'ERREUR →', e?.message || e);
          }
        })
    );

    logI(tag('done'), 'Initialisation terminée ✔️');
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
      const players = await firstValueFrom(this.playersVM$);
      const picked = await this.ownerActions.applyRandomHunter(this.roomId, players ?? [], scope);
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

  /** Bouton toggle chasseur (owner) */
  public async onToggleHunter(targetUid: string, isCurrentlyHunter: boolean): Promise<void> {
    const roomId = this.roomId;
    if (!roomId) return;

    const getAllPlayers = async () => {
      const vm = await firstValueFrom(this.playersVM$);
      return (vm ?? []).map(p => ({ uid: p.uid, displayName: p.displayName, ready: (p as any).ready, role: p.roleResolved })) as any;
    };

    const getCurrentRoles = async () => {
      const r = await firstValueFrom(this.room$);
      return (r?.roles ?? null) as Record<string, 'chasseur' | 'chassé'> | null;
    };

    try {
      const newRole = await this.ownerActions.toggleHunterMulti(
        roomId,
        targetUid,
        isCurrentlyHunter,
        getAllPlayers,
        getCurrentRoles
      );

      const msg = (newRole === 'chasseur') ? 'Défini comme chasseur' : 'Rendu chassé';
      this.snack.open(msg, 'OK', { duration: 2000 });
      this.log(`Owner: toggle hunter → ${targetUid} = ${newRole}`);
    } catch (e: any) {
      this.snack.open(String(e?.message || e), 'OK', { duration: 3000 });
      this.log(`toggleHunterMulti — ERREUR: ${e?.message || e}`);
    }
  }
  trackByUid = (_: number, item: { uid?: string; id?: string }) =>
    item?.uid ?? item?.id ?? _;
}
