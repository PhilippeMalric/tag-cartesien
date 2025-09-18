import {Injectable, inject} from '@angular/core';
import {Auth, authState} from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  query,
  orderBy,
  limit,
} from '@angular/fire/firestore';
import {Observable, combineLatest, map, shareReplay} from 'rxjs';

export type PlayerDoc = {
  uid?: string;
  displayName?: string;
  score?: number;
  combo?: number;
};

export type TagEvent = {
  type?: 'tag';
  hunterUid?: string;
  ts?: unknown; // Timestamp Firestore
};

export type PlayerVM = {
  uid: string;
  displayName: string;
  score: number;
  isBot: boolean;
  isSelf: boolean;
};

@Injectable({providedIn: 'root'})
export class ScoreboardAdapterService {
  private fs = inject(Firestore);
  private auth = inject(Auth);

  private uid$: Observable<string | null> = authState(this.auth).pipe(
    map((u) => u?.uid ?? null),
    shareReplay({bufferSize: 1, refCount: true}),
  );

  private players$(roomId: string): Observable<PlayerDoc[]> {
    const col = collection(this.fs, `rooms/${roomId}/players`);
    // tri côté serveur (utile si tu affiches "top" ailleurs)
    const q = query(col, orderBy('score', 'desc'), limit(50));
    return collectionData(q, {idField: 'uid'}) as Observable<PlayerDoc[]>;
  }

  private events$(roomId: string): Observable<TagEvent[]> {
    const col = collection(this.fs, `rooms/${roomId}/events`);
    // on limite pour ne pas charger trop (peux monter si besoin)
    const q = query(col, orderBy('ts', 'desc'), limit(300));
    return collectionData(q) as Observable<TagEvent[]>;
  }

  /** VM finale pour l’overlay */
  vm$(roomId: string): Observable<PlayerVM[]> {
    return combineLatest([
      this.players$(roomId),
      this.events$(roomId),
      this.uid$,
    ]).pipe(
      map(([players, events, uid]) => {

        console.log("players, events, uid",players, events, uid);
        

        const rows: PlayerVM[] = (players ?? []).map((p) => {
          const score = Number(p?.score ?? 0)
          const isBot =
            typeof p?.uid === 'string' &&
            (p.uid.startsWith('bot-') ||
              (p.displayName ?? '').includes('🤖'));
          const isSelf = !!uid && p?.uid === uid;

          return {
            uid: p?.uid ?? 'unknown',
            displayName: p?.displayName || p?.uid?.slice(0, 6) || 'Joueur',
            score,
            isBot,
            isSelf,
          };
        });

        rows.sort(
          (a, b) =>
            b.score - a.score || a.displayName.localeCompare(b.displayName),
        );
console.log("rows",rows);

        return rows;
      }),
      shareReplay({bufferSize: 1, refCount: true}),
    );
  }
}
