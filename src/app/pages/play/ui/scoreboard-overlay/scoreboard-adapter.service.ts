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
import type { RoomDoc, PlayerDoc, EventItem, Role, GameMode } from '@tag/types';

export type PlayerVM = {
  uid: string;
  displayName: string;
  score: number;
  isBot: boolean;
  isSelf: boolean;
  role: Role | null;     // ← 'hunter' | 'prey' | null (depuis @tag/types)
  isHunter: boolean;
  justScored: boolean;
};

type HeaderVM = {
  mode: GameMode;        // ← typé @tag/types
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

  // On récupère les joueurs avec un idField 'uid' pour que l'UI l'ait directement.
  private players$(roomId: string): Observable<Array<PlayerDoc & { uid: string }>> {
    const col = collection(this.fs, `rooms/${roomId}/players`);
    const q = query(col, orderBy('score', 'desc'), limit(50));
    return collectionData(q, { idField: 'uid' }) as unknown as Observable<
      Array<PlayerDoc & { uid: string }>
    >;
  }

  // Les événements utilisent @tag/types :
  // - type: 'tag/hit'
  // - createdAt: Firestore Timestamp (unknown côté types)
  // - payload: { byUid, targetUid, mode }
  private events$(roomId: string): Observable<EventItem[]> {
    const col = collection(this.fs, `rooms/${roomId}/events`);
    const q = query(col, orderBy('createdAt', 'desc'), limit(150));
    return collectionData(q) as unknown as Observable<EventItem[]>;
  }

  /** VM d’en-tête (mode, objectif, etc.) */
  header$(roomId: string): Observable<HeaderVM> {
    return combineLatest([this.room$(roomId), this.players$(roomId)]).pipe(
      map(([room, players]) => {
        const roles = room?.roles ?? {};
        const hunterUid =
          Object.keys(roles).find((k) => roles[k] === 'hunter') ?? null;
        return {
          mode: (room?.mode ?? 'classic') as GameMode,
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
        // Détermine qui a scoré récemment (dans ~5s) à partir d'EventItem 'tag/hit'
        const now = Date.now();
        const RECENT_MS = 5000;
        const recentScorers = new Set<string>();

        for (const e of events ?? []) {
          // createdAt peut être un Timestamp Firestore → toMillis() si dispo
          const createdMs =
            (e as any)?.createdAt?.toMillis?.() ??
            ((e as any)?.createdAt?.seconds ? (e as any).createdAt.seconds * 1000 : 0);

          if (e?.type === 'tag/hit' && createdMs && now - createdMs <= RECENT_MS) {
            const by = (e as any)?.payload?.byUid as string | undefined;
            if (by) recentScorers.add(by);
          }
        }

        // Récup rôle/chasseur depuis l’en-tête
        const hunterUid = header.hunterUid ?? null;

        const rows: PlayerVM[] = (players ?? []).map((p) => {
          const score = Number((p as any)?.score ?? 0);
          const isBot =
            typeof (p as any)?.uid === 'string' &&
            ((p as any).uid.startsWith('bot-') ||
              ((p as any).displayName ?? '').includes('🤖'));
          const isSelf = !!uid && (p as any)?.uid === uid;
          const role = ((p as any)?.role as Role | undefined) ?? null;
          const isHunter = !!hunterUid && (p as any)?.uid === hunterUid;

          const uidStr = (p as any)?.uid ?? 'unknown';
          const name = (p as any)?.displayName || uidStr.slice(0, 6) || 'Joueur';

          return {
            uid: uidStr,
            displayName: name,
            score,
            isBot,
            isSelf,
            role,
            isHunter,
            justScored: !!(uidStr && recentScorers.has(uidStr)),
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
