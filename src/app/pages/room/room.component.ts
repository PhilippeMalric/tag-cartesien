// src/app/pages/room/room.component.ts
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  EnvironmentInjector,
  ChangeDetectorRef,
  NgZone,
  DestroyRef,
  inject,
  runInInjectionContext,
  input,
} from '@angular/core';

import { Router, ActivatedRoute } from '@angular/router';
import { AsyncPipe, CommonModule } from '@angular/common';

import {
  Observable,
  Subscription,
  Subject,
  combineLatest,
  firstValueFrom,
  of,
} from 'rxjs';
import {
  map,
  shareReplay,
  debounceTime,
  distinctUntilChanged,
  startWith,
  tap,
  auditTime,
} from 'rxjs/operators';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// Angular Material
import { MatSnackBar } from '@angular/material/snack-bar';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Firebase Auth
import { Auth as FirebaseAuth, signInAnonymously } from '@angular/fire/auth';

// Tes éléments/app spécifiques (ok de garder le barrel pour ceux-ci)
import {
  MapPickerComponent,
  SpawnCoordService,
  OwnerActionsService,
  RoomLogger,
} from './room.imports';

// Types & services locaux
import type { Player } from './player.model';
import type { RoomDoc } from '@tag/types';
import { RoomService } from './room.service';
import { PositionsService } from '../play';

// --- UI role mapping (FR <-> EN d’affichage) ---
type HunterScope = 'all' | 'ready';
type RoleFR = 'chasseur' | 'chassé';
type RoleAny = RoleFR | 'hunter' | 'prey';

function toFR(r: RoleAny | null | undefined): RoleFR | null {
  if (!r) return null;
  const s = String(r).toLowerCase();
  if (s === 'hunter' || s === 'chasseur') return 'chasseur';
  if (s === 'prey'   || s === 'chassé')   return 'chassé';
  return null;
}

@Component({
  selector: 'app-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [
    CommonModule, AsyncPipe,
    MatToolbarModule, MatButtonModule, MatIconModule,
    MatCardModule, MatListModule, MatProgressBarModule, MatTooltipModule,
    MatMenuModule, MatSelectModule, MatDividerModule, MatProgressSpinnerModule,
    MapPickerComponent,
  ],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.scss'],
})
export class RoomComponent implements OnInit, OnDestroy {
  // --- Injections
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly env          = inject(EnvironmentInjector);
  protected readonly auth       = inject(FirebaseAuth);
  private readonly roomSvc      = inject(RoomService);
  private readonly snack        = inject(MatSnackBar);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly zone         = inject(NgZone);
  private readonly destroyRef   = inject(DestroyRef);
  private readonly ownerActions = inject(OwnerActionsService);
  readonly positions            = inject(PositionsService);

  // --- Inputs (APIs fonctionnelles)
  roomId  = input<string>('');     // fourni par parent (optionnel)
  isOwner = input<boolean>(false); // fallback éventuel

  /** Résolution interne de l’ID effectif de room (input ou URL). */
  private roomIdResolved = '';

  // --- Services exposés au template
  public readonly spawn = inject(SpawnCoordService);

  // --- Observables exposés au template
  public players$:   Observable<Player[]>       = of([]);
  public room$:      Observable<RoomDoc | null> = of(null);
  public playersVM$: Observable<PlayerVM[]>     = of([]);
  public isOwner$!:  Observable<boolean>;
  public canStart$!: Observable<boolean>;

  public myRole$!: Observable<RoleFR | null>;

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
  myRole!: RoleFR | null;

  private log(msg: string) { this.logger.log(msg); }

  async ngOnInit(): Promise<void> {
    const tag  = (phase: string) => `[RoomInit/${phase}]`;
    const logI = (...a: any[]) => console.info(...a);
    const logW = (...a: any[]) => console.warn(...a);
    const logE = (...a: any[]) => console.error(...a);

    // 0) Param route + résolution de l'id effectif
    this.roomIdResolved = this.roomId() || this.route.snapshot.paramMap.get('id') || '';
    if (!this.roomIdResolved) {
      logW(tag('route'), 'Aucun roomId dans l’URL → redirect /lobby');
      this.router.navigate(['/lobby']);
      return;
    }
    logI(tag('route'), 'roomId =', this.roomIdResolved);

    // 1) Auth + ensure player doc
    try {
      await runInInjectionContext(this.env, async () => {
        if (!this.auth.currentUser) {
          logI(tag('auth'), 'Pas d’utilisateur → signInAnonymously()...');
          await signInAnonymously(this.auth);
        }
        const uid = this.auth.currentUser!.uid;
        const displayName = this.auth.currentUser?.displayName || 'Joueur';

        logI(tag('player.ensure'), `ensureSelfPlayerDoc(room=${this.roomIdResolved}, uid=${uid}, name=${displayName})`);
        await this.roomSvc.ensureSelfPlayerDoc(this.roomIdResolved, uid, displayName);
        logI(tag('player.ensure'), 'OK');
      });
    } catch (e: any) {
      logE(tag('player.ensure'), 'ERREUR →', e?.message || e);
    }

    // 2) Flux réactifs
    runInInjectionContext(this.env, () => {
      // Flux bruts
      this.room$ = this.roomSvc.room$(this.roomIdResolved).pipe(
        startWith({ roles: {}, state: 'idle' } as any),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.players$ = this.roomSvc.players$(this.roomIdResolved).pipe(
        startWith([] as Player[]),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      // Propriétaire ?
      const uid = this.auth.currentUser?.uid ?? '';
      this.isOwner$ = this.room$.pipe(
        map(room => !!room && room.ownerUid === uid),      // boolean
        startWith<boolean>(false),
        tap((isOwner: boolean) =>
          logI(tag('isOwner$'), isOwner ? 'Tu es OWNER de la room' : 'Tu N’ES PAS OWNER')
        ),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      // Peut démarrer ?
      this.canStart$ = combineLatest([this.players$, this.room$]).pipe(
        map(([players, room]) =>
          !!room &&
          room.state !== 'running' &&
          Array.isArray(players) &&
          players.length >= 2 &&
          players.every(p => !!p.ready)
        ),
        startWith<boolean>(false),
        tap((can: boolean) =>
          logI(tag('canStart$'), can ? '✅ prêt à démarrer' : '⏳ conditions non remplies')
        ),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      // Vue joueurs (humains + bots déduits)
      this.playersVM$ = combineLatest([this.players$, this.room$]).pipe(
        map(([players, room]): PlayerVM[] => {
          const rolesRaw = (room?.roles ?? {}) as Record<string, RoleAny | undefined>;

          // HUMANS → roleResolved = toFR(p.role) uniquement
          const humans: PlayerVM[] = (players ?? []).map(p => ({
            uid: p.uid,
            displayName: p.displayName ?? p.uid,
            ready: !!p.ready,
            role: p.role as RoleAny | undefined,
            roleResolved: toFR(p.role),
            score: p.score ?? 0,
            iFrameUntilMs: (p as any).iFrameUntilMs,
            spawn: (p as any).spawn,
            cantTagUntilMs: (p as any).cantTagUntilMs,
          }));

          // BOTS → pas de doc player, on garde room.roles
          const humanUids = new Set(humans.map(p => p.uid));
          const botUids = Object.keys(rolesRaw).filter(uid => uid.startsWith('bot-') && !humanUids.has(uid));

          const bots: PlayerVM[] = botUids.map(uid => {
            const role = rolesRaw[uid];
            return {
              uid,
              displayName: `🤖 Bot ${uid.slice(-4).toUpperCase()}`,
              ready: true,
              role,
              roleResolved: toFR(role),
              score: 0,
            };
          });

          humans.sort((a, b) => (a.displayName || a.uid).localeCompare(b.displayName || b.uid));
          bots.sort((a, b) => (a.displayName || a.uid).localeCompare(b.displayName || b.uid));
          return humans.concat(bots);
        }),
        auditTime(16)
      );
    });

    // Déclenche CD quand playersVM$ émet (utile pour les templates OnPush)
    this.playersVM$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.cdr.detectChanges();
      });

    // Mon rôle (FR) basé sur players$
    {
      const uid = this.auth.currentUser!.uid;
      this.myRole$ = this.players$.pipe(
        map(players => toFR(players?.find(p => p.uid === uid)?.role)),
        startWith(null),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.subs.add(this.myRole$.subscribe(r => this.myRole = r));
    }

    // Suivre mon état ready
    this.subs.add(
      this.players$.subscribe(ps => {
        const myUid = this.auth.currentUser?.uid;
        if (!myUid) return;
        const me = ps.find(p => p.uid === myUid);
        if (typeof me?.ready === 'boolean') {
          this.myReady = me.ready;
        }
      })
    );

    // Navigation auto quand la partie démarre + sync mode
    this.subs.add(
      this.room$.subscribe(r => {
        if (!r) return;
        const oldMode = this.mode;
        if (r.mode && r.mode !== oldMode) this.mode = r.mode;
        if (r.state === 'running') this.router.navigate(['/play', this.roomIdResolved]);
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
            await this.roomSvc.setMySpawn(this.roomIdResolved, uid, xy);
          } catch (e: any) {
            this.log(`spawn — ERREUR: ${e?.message || e}`);
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
      await this.roomSvc.toggleReady(this.roomIdResolved, uid, !this.myReady);
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
      await this.roomSvc.start(this.roomIdResolved); // assigne les rôles + passe à running
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
      const picked = await this.ownerActions.applyRandomHunter(this.roomIdResolved, players ?? [], scope);
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
      await this.roomSvc.setMode(this.roomIdResolved, m);
      this.mode = m;
      this.log(`FS setMode(${m})`);
    } catch (e: any) {
      this.log(`setMode — ERREUR: ${e?.message || e}`);
    }
  }

  public async endNow() {
    try {
      await this.roomSvc.setState(this.roomIdResolved, 'ended');
      this.log('FS setState(ended)');
    } catch (e: any) {
      this.log(`endNow — ERREUR: ${e?.message || e}`);
    }
  }

  /** Appel depuis le MapPicker (xyChange) */
  public onSpawnChange(xy: { x:number; y:number }) {
    this.spawn.set(xy);
    this.saveSpawn$.next(xy); // sauvegarde Firestore du spawn

    const uid = this.auth.currentUser?.uid;
    if (uid) {
      // rôle affiché (FR) stocké localement → on le transmet tel quel à PositionsService
      this.positions.writeSelf(this.roomIdResolved, uid, xy.x, xy.y, this.myRole as string);
    }
  }

  /** Bouton toggle chasseur (owner) */
  public async onToggleHunter(targetUid: string, isCurrentlyHunter: boolean): Promise<void> {
    const roomId = this.roomIdResolved;
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

// ---- Types UI pour l’affichage ----
export interface PlayerVM {
  uid: string;
  displayName: string;
  ready: boolean;
  role?: RoleAny;              // brut tel que stocké au player/room (optionnel)
  roleResolved: RoleFR | null; // normalisé FR (affichage)
  score: number;
  iFrameUntilMs?: number;
  spawn?: { x: number; y: number };
  cantTagUntilMs?: number;
}
