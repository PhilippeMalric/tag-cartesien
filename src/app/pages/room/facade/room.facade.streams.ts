// FILE: src/app/pages/room/facade/room.facade.streams.ts
import { inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Auth } from '@angular/fire/auth';
import { debounceTime, distinctUntilChanged, filter, map, shareReplay, auditTime, take } from 'rxjs/operators';
import { Observable, Subject, Subscription, combineLatest, firstValueFrom, of } from 'rxjs';

import type { GameMode, Role } from '@tag/types';
import type { Player } from '../player.model';
import type { PlayerVM } from '../room.models';
import { RoomFacadeState } from './room.facade.state';
import { RoomService } from '../room.service';
import { byUid } from '../room.selectors';
import { toRoleMap } from '../roles.util';

export class RoomFacadeStreams {
  private subs = new Subscription();

  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);
  private readonly env    = inject(EnvironmentInjector);
  private readonly auth   = inject(Auth);
  private readonly roomSvc = inject(RoomService);
  private readonly snack   = inject(MatSnackBar);
  private readonly state   = inject(RoomFacadeState);

  /** À appeler après que state.roomId soit défini */
  wireStreams() {
    runInInjectionContext(this.env, () => {
      const roomId = this.state.roomId;
      const uid = this.auth.currentUser?.uid ?? '';

      this.state.players$ = this.roomSvc.players$(roomId);
      this.state.room$    = this.roomSvc.room$(roomId);

      this.state.isOwner$ = this.state.room$.pipe(
        map(r => !!r && r.ownerUid === uid),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.state.canStart$ = combineLatest([this.state.players$, this.state.room$]).pipe(
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

      this.state.playersVM$ = combineLatest([this.state.players$, this.state.room$]).pipe(
        map(([players, room]) => {
          if (!room) return null;
          const roles = toRoleMap(room.roles);
          const humans: PlayerVM[] = (players ?? [])
            .slice()
            .sort(byUid)
            .map(p => ({
              ...p,
              roleResolved: (p.role ?? roles[p.uid] ?? null) as PlayerVM['roleResolved'],
            }));
          return humans;
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.state.readyCount$ = this.state.players$.pipe(
        map(ps => ps.filter(p => !!p.ready).length),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.state.totalCount$ = this.state.players$.pipe(
        map(ps => ps.length),
        shareReplay({ bufferSize: 1, refCount: true })
      );

      this.state.startHint$ = combineLatest([this.state.players$, this.state.room$]).pipe(
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

      // Suivre mon état ready (MAJ locale)
      this.subs.add(
        this.state.players$.subscribe(ps => {
          const myUid = this.auth.currentUser?.uid;
          if (!myUid) return;
          const me = ps.find(p => p.uid === myUid);
          if (typeof me?.ready === 'boolean') this.state.myReady.set(!!me.ready);
        })
      );

      // Navigation auto vers /play quand la room démarre + synchro du mode
      this.subs.add(
        this.state.room$.subscribe(r => {
          if (!r) return;

          const m = r.mode as GameMode | undefined;
          if (m && this.state.mode() !== m) this.state.mode.set(m);

          if (!this.noAutoPlayParam() && !this.state.sentToPlay && this.isOnRoomPage()) {
            if (r.state === 'running') {
              this.state.sentToPlay = true;
              this.state.log(`NAV → /play/${roomId}`);
              this.router.navigate(['/play', roomId]);
            }
          }
        })
      );
    });
  }

  stop() {
    this.subs.unsubscribe();
    this.subs = new Subscription();
  }

  // helpers
  private noAutoPlayParam(): boolean {
    return this.route.snapshot.queryParamMap.get('noAutoPlay') === '1';
  }

  private isOnRoomPage(): boolean {
    const url = this.router.url.split('?')[0];
    return url.startsWith(`/room/${this.state.roomId}`);
  }
}
