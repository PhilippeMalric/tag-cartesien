import { Injectable, inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  limit,
  orderBy,
  query,
} from '@angular/fire/firestore';
import { Observable, combineLatest, map, shareReplay } from 'rxjs';

export type PlayerDoc = {
  uid?: string;
  displayName?: string;
  score?: number;
  role?: 'chasseur' | 'chassé';
  combo?: number; // (optionnel si tu l’ajoutes plus tard)
};

export type TagEvent = {
  type?: 'tag';
  hunterUid?: string;
  victimUid?: string;
  ts?: any; // Firestore Timestamp
};

export type RoomDoc = {
  mode?: 'classic' | 'transmission' | 'infection' | string;
  targetScore?: number;
  roles?: Record<string, 'chasseur' | 'chassé'>;
  playersCount?: number;
};

export type PlayerVM = {
  uid: string;
  displayName: string;
  score: number;
  isBot: boolean;
  isSelf: boolean;
  role: 'chasseur' | 'chassé' | null;
  isHunter: boolean;
  justScored: boolean;
};

type HeaderVM = {
  mode: string;
  targetScore?: number;
  playersCount: number;
  hunterUid?: string | null;
};

@Injectable({ providedIn: 'root' })
export class ScoreboardAdapterService {
  private fs = inject(Firestore);
  private auth = inject(Auth);

  private uid$: Observable<string | null> = authState(this.auth).pipe(
    map((u) => u?.uid ?? null),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  private room$(roomId: string): Observable<RoomDoc & { id?: string }> {
    const r = doc(this.fs, `rooms/${roomId}`);
    return docData(r).pipe(
      map((d) => (d ?? {}) as RoomDoc),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  private players$(roomId: string): Observable<PlayerDoc[]> {
    const col = collection(this.fs, `rooms/${roomId}/players`);
    const q = query(col, orderBy('score', 'desc'), limit(50));
    return collectionData(q, { idField: 'uid' }) as Observable<PlayerDoc[]>;
  }

  private events$(roomId: string): Observable<TagEvent[]> {
    const col = collection(this.fs, `rooms/${roomId}/events`);
    const q = query(col, orderBy('ts', 'desc'), limit(150));
    return collectionData(q) as Observable<TagEvent[]>;
  }

  /** VM d’en-tête (mode, objectif, etc.) */
  header$(roomId: string): Observable<HeaderVM> {
    return combineLatest([this.room$(roomId), this.players$(roomId)]).pipe(
      map(([room, players]) => {
        const roles = room?.roles ?? {};
        const hunterUid =
          Object.keys(roles).find((k) => roles[k] === 'chasseur') ?? null;
        return {
          mode: room?.mode ?? 'classic',
          targetScore: room?.targetScore,
          playersCount: players?.length ?? 0,
          hunterUid,
        };
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  /** VM du tableau de scores (joueurs) */
  vm$(roomId: string): Observable<PlayerVM[]> {
    return combineLatest([
      this.players$(roomId),
      this.events$(roomId),
      this.uid$,
      this.header$(roomId),
    ]).pipe(
      map(([players, events, uid, header]) => {
        // Détermine qui a scoré récemment (dans les ~5 dernières secondes)
        const now = Date.now();
        const RECENT_MS = 5000;
        const recentScorers = new Set<string>();
        for (const e of events ?? []) {
          const tsMs =
            (e as any)?.ts?.toMillis?.() ??
            ((e as any)?.ts?.seconds ? (e as any).ts.seconds * 1000 : 0);
          if (e?.type === 'tag' && tsMs && now - tsMs <= RECENT_MS && e.hunterUid) {
            recentScorers.add(e.hunterUid);
          }
        }

        // Récup rôle/chasseur depuis l’en-tête
        const hunterUid = header.hunterUid ?? null;

        const rows: PlayerVM[] = (players ?? []).map((p) => {
          const score = Number(p?.score ?? 0);
          const isBot =
            typeof p?.uid === 'string' &&
            (p.uid.startsWith('bot-') || (p.displayName ?? '').includes('🤖'));
          const isSelf = !!uid && p?.uid === uid;
          const role = (p?.role as any) ?? null;
          const isHunter = !!hunterUid && p?.uid === hunterUid;

          return {
            uid: p?.uid ?? 'unknown',
            displayName: p?.displayName || p?.uid?.slice(0, 6) || 'Joueur',
            score,
            isBot,
            isSelf,
            role,
            isHunter,
            justScored: !!(p?.uid && recentScorers.has(p.uid)),
          };
        });

        // Tri : chasseur en haut, puis score desc, puis alpha
        rows.sort(
          (a, b) =>
            (b.isHunter ? 1 : 0) - (a.isHunter ? 1 : 0) ||
            b.score - a.score ||
            a.displayName.localeCompare(b.displayName),
        );

        return rows;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
