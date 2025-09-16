import { Injectable, inject } from '@angular/core';
import {
  Observable, combineLatest, map, shareReplay, of, defer, switchMap,
  filter, distinctUntilChanged
} from 'rxjs';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Router, NavigationEnd } from '@angular/router';
import { RoomService } from '../../../room';
import { MatchService } from '../../match.service';

// ----- Types (ajuste si tu as déjà tes interfaces) -----
export type PlayerVM = {
  uid: string;
  displayName: string;
  score: number;
  isBot: boolean;
  isSelf: boolean;
};

export type TagEvent = {
  type: 'tag';
  hunterUid: string;
  victimUid: string;
  ts: number;
};
// -------------------------------------------------------

function authUid$(): Observable<string | null> {
  return new Observable<string | null>((sub) => {
    const auth = getAuth();
    const off = onAuthStateChanged(auth, (u) => sub.next(u ? u.uid : null), (err) => sub.error(err));
    return () => off();
  }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
}

/** Fallback robuste: extrait roomId de l'URL (/room/:id ou /play/:id) */
function roomIdFromUrl$(router: Router): Observable<string> {
  const extract = (url: string): string | null => {
    const m = url.match(/\/(?:room|play)\/([^/?#]+)/i);
    return m?.[1] ?? null;
  };
  return new Observable<string>((sub) => {
    const first = extract(router.url);
    if (first) sub.next(first);
    const subNav = router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        const id = extract(e.urlAfterRedirects);
        if (id) sub.next(id);
      }
    });
    return () => subNav.unsubscribe();
  }).pipe(
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true })
  );
}

/** Normalise source joueur/events: Observable<T[]> OU (roomId)=>Observable<T[]> -> Observable<T[]> */
function normalizeRoomScopedStream<T>(
  source: any,
  roomId$: Observable<string>
): Observable<T[]> {
  // Observable direct
  if (source && typeof source.subscribe === 'function') {
    return source as Observable<T[]>;
  }
  // Fonction -> on attend un roomId
  if (typeof source === 'function') {
    return roomId$.pipe(
      distinctUntilChanged(),
      switchMap((id) => {
        const out = source(id);
        if (!out || typeof out.subscribe !== 'function') {
          throw new Error(`[Scoreboard] La fonction fournie n'a pas retourné un Observable pour roomId="${id}".`);
        }
        return out as Observable<T[]>;
      })
    );
  }
  // Rien: flux vide
  return of([] as T[]);
}

@Injectable({ providedIn: 'root' })
export class ScoreboardAdapterService {
  private router = inject(Router);

  // ⚠️ Remplace "any" par tes vrais services si tu veux du strict
  private roomService = inject<any>(RoomService );
  private matchService = inject<any>(MatchService );

  // 1) roomId uniquement depuis l'URL (élimine l'erreur .pipe)
  private roomId$ = roomIdFromUrl$(this.router);

  // 2) Players: accepte Observable OU (roomId)=>Observable depuis RoomService ou MatchService
  private _playersSource: any =
    (this.roomService && (this.roomService.players$ ?? this.roomService.players))
    ?? (this.matchService && (this.matchService.players$ ?? this.matchService.players));

  private players$ = defer(() =>
    normalizeRoomScopedStream<any>(this._playersSource, this.roomId$)
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  // 3) Events: accepte Observable OU (roomId)=>Observable depuis MatchService
  private _eventsSource: any =
    (this.matchService && (this.matchService.events$ ?? this.matchService.events));

  private events$ = defer(() =>
    normalizeRoomScopedStream<TagEvent>(this._eventsSource, this.roomId$)
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  // 4) UID courant via Firebase Auth (SDK modulaire)
  private uid$ = authUid$();

  // 5) ViewModel combinée
  vm$: Observable<PlayerVM[]> = combineLatest([this.players$, this.events$, this.uid$]).pipe(
    map(([players, events, uid]) => {
      const base = new Map<string, number>();
      for (const p of players ?? []) base.set(p.uid, Number(p?.score ?? 0));

      const hunterCounts = new Map<string, number>();
      for (const e of events ?? []) {
        if (e?.type === 'tag' && e?.hunterUid) {
          hunterCounts.set(e.hunterUid, (hunterCounts.get(e.hunterUid) ?? 0) + 1);
        }
      }

      const rows: PlayerVM[] = (players ?? []).map((p: any) => {
        const fromPlayers = Number(p?.score ?? 0);
        const fromEvents = hunterCounts.get(p.uid) ?? 0;
        const score = base.size ? fromPlayers : fromEvents;
        const isBot = typeof p?.uid === 'string' && (p.uid.startsWith('bot-') || p.displayName?.includes('🤖'));
        const isSelf = !!uid && p?.uid === uid;
        return {
          uid: p.uid,
          displayName: p.displayName || p.uid?.slice(0, 6) || 'Joueur',
          score,
          isBot,
          isSelf
        };
      });

      rows.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
      return rows;
    })
  );
}
