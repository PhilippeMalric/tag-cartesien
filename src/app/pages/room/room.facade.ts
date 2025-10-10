import {
  Injectable, EnvironmentInjector, DestroyRef, inject, runInInjectionContext
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Observable, Subject, Subscription, combineLatest, firstValueFrom, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, shareReplay, take, auditTime } from 'rxjs/operators';

import { Auth as FirebaseAuth, signInAnonymously } from '@angular/fire/auth';

import { RoomService } from './room.service';
import type { Role, GameMode, RoomDoc } from '@tag/types';
import type { Player } from './player.model';
import type { HunterScope, PlayerVM } from './room.models';

import { SpawnCoordService } from '../../services/spawn-coord.service';
import { byUid } from './room.selectors';
import { toRoleMap } from './roles.util';

@Injectable({ providedIn: 'root' })
export class RoomFacade {
  // === Injections
  private readonly router   = inject(Router);
  private readonly route    = inject(ActivatedRoute);
  private readonly env      = inject(EnvironmentInjector);
  private readonly auth     = inject(FirebaseAuth);
  private readonly roomSvc  = inject(RoomService);
  private readonly snack    = inject(MatSnackBar);
  readonly        spawn     = inject(SpawnCoordService);
  private readonly destroy  = inject(DestroyRef);

  // === State interne
  private subs = new Subscription();
  private _roomId = '';
  private _sentToPlay = false; // évite la redirection multiple

  // Streams bruts
  players$: Observable<Player[]> = of([]);
  room$:    Observable<RoomDoc | null> = of(null);

  // Dérivés
  /** NOTE: `PlayerVM[] | null` — `null` = loading (tant que room n’a pas émis) */
  playersVM$:   Observable<PlayerVM[] | null> = of(null);
  isOwner$!:    Observable<boolean>;
  canStart$!:   Observable<boolean>;
  readyCount$!: Observable<number>;
  totalCount$!: Observable<number>;
  startHint$!:  Observable<string>;

  // UI: états simples
  myReady = false;
  isStarting = false;
  pickingHunter = false;
  lastPickedHunter: { uid: string; displayName?: string } | null = null;

  // Mode local (reflet du doc)
  mode: GameMode = 'classic';

  // Logs optionnels (debug UI)
  writes: string[] = [];
  private log(msg: string) {
    const t = new Date().toLocaleTimeString();
    this.writes = [`[${t}] ${msg}`, ...this.writes].slice(0, 30);
  }

  // Sauvegarde spawn (debounced)
  private saveSpawn$ = new Subject<{ x: number; y: number }>();

  /** Paramètre d’URL pour désactiver l’auto-redirect vers /play */
  private get noAutoPlayParam(): boolean {
    return this.route.snapshot.queryParamMap.get('noAutoPlay') === '1';
  }

  /** Est-ce qu'on est sur la page room de CETTE room ? */
  private isOnRoomPage(): boolean {
    const url = this.router.url.split('?')[0];
    return url.startsWith(`/room/${this._roomId}`);
  }

  /** Navigation vers le lobby */
  public goLobby(): void {
    this.router.navigate(['/lobby']);
  }

  /** Init à partir d’un roomId (ou de l’URL si non fourni) */
  async init(roomId?: string): Promise<void> {
    this._roomId = roomId || (this.route.snapshot.paramMap.get('id') ?? '');
    if (!this._roomId) {
      this.log('roomId introuvable (init). Retour au lobby.');
      this.router.navigate(['/lobby']);
      return;
    }

    this._sentToPlay = false; // reset à chaque init

    // Auth + ensure player doc
    await runInInjectionContext(this.env, async () => {
      if (!this.auth.currentUser) await signInAnonymously(this.auth);
      const uid = this.auth.currentUser!.uid;
      const displayName = this.auth.currentUser?.displayName || 'Joueur';
      try {
        await this.roomSvc.ensureSelfPlayerDoc(this._roomId, uid, displayName);
        this.log(`FS ensureSelfPlayerDoc(${this._roomId}, ${uid})`);
      } catch (e: any) {
        this.log(`FS ensureSelfPlayerDoc — ERREUR: ${e?.message || e}`);
      }
    });

    // Streams + dérivés
    runInInjectionContext(this.env, () => {
      this.players$ = this.roomSvc.players$(this._roomId);
      this.room$    = this.roomSvc.room$(this._roomId);

      const uid = this.auth.currentUser?.uid ?? '';

      this.isOwner$ = this.room$.pipe(
        map(r => !!r && r.ownerUid === uid),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.canStart$ = combineLatest([this.players$, this.room$]).pipe(
        auditTime(16),
        map(([players, room]) =>
          !!room &&
          room.state !== 'running' &&
          Array.isArray(players) &&
          players.length >= 2 &&
          players.every(p => !!p.ready)
        ),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      // *** Anti-flicker: tant que room == null => VM == null (état "loading")
      this.playersVM$ = combineLatest([this.players$, this.room$]).pipe(
        map(([players, room]) => {
          if (!room) return null;

          const roles = toRoleMap(room.roles); // Record<string, Role>
          const humans: PlayerVM[] = (players ?? [])
            .slice()
            .sort(byUid)
            .map(p => ({
              ...p,
              // rôle résolu : priorise p.role, sinon rôle de la room
              roleResolved: (p.role ?? roles[p.uid] ?? null) as PlayerVM['roleResolved'],
            }));

          return humans;
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.readyCount$ = this.players$.pipe(
        map(ps => ps.filter(p => !!p.ready).length),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.totalCount$ = this.players$.pipe(
        map(ps => ps.length),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.startHint$ = combineLatest([this.players$, this.room$]).pipe(
        auditTime(16),
        map(([players, room]) => {
          if (!room) return 'Chargement de la salle…';
          if (room.state === 'running') return 'La partie est déjà en cours.';
          if (!players?.length) return 'Aucun joueur pour le moment…';
          const notReady = players.filter(p => !p.ready).map(p => p.displayName || p.uid);
          return notReady.length ? `En attente: ${notReady.join(', ')}` : '';
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    });

    // Suivre mon état ready (MAJ locale)
    this.subs.add(
      this.players$.subscribe(ps => {
        const myUid = this.auth.currentUser?.uid;
        if (!myUid) return;
        const me = ps.find(p => p.uid === myUid);
        if (typeof me?.ready === 'boolean') this.myReady = me.ready;
      })
    );

    // Naviguer quand la room démarre + synchro du mode (safe & one-shot)
    this.subs.add(
      this.room$.subscribe(r => {
        if (!r) return;

        // Synchro du mode local
        const m = r.mode as GameMode | undefined;
        if (m && this.mode !== m) this.mode = m;

        // Auto-redirect vers /play/:id (une seule fois)
        if (!this.noAutoPlayParam && !this._sentToPlay && this.isOnRoomPage()) {
          if (r.state === 'running') {
            this._sentToPlay = true;
            this.log(`NAV → /play/${this._roomId}`);
            this.router.navigate(['/play', this._roomId]);
          }
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
            await this.roomSvc.setMySpawn(this._roomId, uid, xy);
            this.log(`FS setMySpawn(${xy.x}, ${xy.y})`);
          } catch (e: any) {
            this.log(`setMySpawn — ERREUR: ${e?.message || e}`);
          }
        })
    );

    // Auto-nettoyage
    this.destroy.onDestroy(() => this.subs.unsubscribe());
  }

  // === Actions exposées au template ===

  trackPlayer = (_: number, p: Player) => p.uid;

  onSpawnChange(xy: { x: number; y: number }) {
    this.spawn.set(xy);
    this.saveSpawn$.next(xy);
  }

  async toggleReady(): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    try {
      await this.roomSvc.toggleReady(this._roomId, uid, !this.myReady);
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
      await this.roomSvc.start(this._roomId);
      this.log('FS start() → state="running"');
    } catch (e: any) {
      this.log(`start() — ERREUR: ${e?.message || e}`);
    } finally {
      this.isStarting = false;
    }
  }

  async setMode(m: GameMode) {
    try {
      await this.roomSvc.setMode(this._roomId, m);
      this.mode = m;
      this.log(`FS setMode(${m})`);
    } catch (e: any) {
      this.log(`setMode — ERREUR: ${e?.message || e}`);
    }
  }

  async endNow() {
    try {
      await this.roomSvc.setState(this._roomId, 'ended');
      this.log('FS setState(ended)');
    } catch (e: any) {
      this.log(`endNow — ERREUR: ${e?.message || e}`);
    }
  }

  async pickHunter(scope: HunterScope): Promise<void> {
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

  // === Détails privés ===

  private async chooseRandomHunter(scope: HunterScope = 'all') {
    try {
      const list = await firstValueFrom(
        this.playersVM$.pipe(filter(arr => Array.isArray(arr) && arr.length > 0), take(1))
      );
      if (list === null) throw new Error('Liste de joueurs introuvable.');

      const allPlayers = list.filter(p => p?.uid && !String(p.uid).startsWith('bot-'));
      const readyPlayers = allPlayers.filter(p => !!p.ready);

      let pool = allPlayers;
      if (scope === 'ready') pool = readyPlayers.length ? readyPlayers : allPlayers;

      if (!pool.length) throw new Error('Aucun joueur éligible au tirage.');

      const idx = Math.floor(Math.random() * pool.length);
      const hunterUid = pool[idx].uid;

      // 👉 Utiliser Role EN partout; accepte FR en entrée (si jamais)
      const roles: Record<string, Role> = {};
      for (const p of allPlayers) {
        roles[p.uid] = p.uid === hunterUid ? 'hunter' : 'prey';
      }

      await this.roomSvc.applyRoles(this._roomId, roles);

      const chosen = pool[idx];
      return { uid: chosen.uid, displayName: chosen.displayName };
    } catch (e: any) {
      this.log(`Owner: tirage chasseur — ERREUR: ${e?.message || e}`);
      throw e;
    }
  }

  // Entrées numériques directes
  onInputX(v: string) { const n = Number(v); if (Number.isFinite(n)) this.spawn.setX(n); }
  onInputY(v: string) { const n = Number(v); if (Number.isFinite(n)) this.spawn.setY(n); }
}
