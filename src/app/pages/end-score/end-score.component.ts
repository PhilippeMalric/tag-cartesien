import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, AsyncPipe, NgForOf, NgIf } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { map, shareReplay, combineLatest, Observable } from 'rxjs';
import { MatchService } from '../play/match.service';

import {
  Firestore, collection, collectionData, orderBy, limit, query
} from '@angular/fire/firestore';

/* === Types minimaux et sûrs pour le template === */

type RoomInfo = {
  mode?: string;
  targetScore?: number;
};

type TopPlayer = {
  uid: string;
  displayName?: string;
  score?: number;
};

type FirestoreTs = { toMillis?: () => number; seconds?: number };
type TagEvent = {
  id: string;
  type?: string;
  hunterUid?: string;
  ts?: FirestoreTs | Date | number | null;
};

type Metrics = {
  tagsByPlayer: Map<string, number>;
  bestStreakByPlayer: Map<string, number>;
};

type PlayerRow = {
  uid: string;
  displayName: string;
  score: number;
  tags: number;
  bestStreak: number;
  rank: number; // 1-based
};

type EndScoreVM = {
  winner: PlayerRow | null;
  rows: PlayerRow[];
};

/* Utils */
function toMillis(ts: FirestoreTs | Date | number | null | undefined): number | null {
  if (!ts) return null;
  if (typeof (ts as any)?.toMillis === 'function') return (ts as any).toMillis();
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof (ts as any)?.seconds === 'number') return (ts as any).seconds * 1000;
  return null;
}

@Component({
  selector: 'app-end-score',
  standalone: true,
  imports: [
    CommonModule,
    AsyncPipe, NgForOf, NgIf,
    MatCardModule, MatButtonModule, MatIconModule, MatDividerModule, MatChipsModule,
  ],
  templateUrl: './end-score.component.html',
  styleUrls: ['./end-score.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EndScoreComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private match = inject(MatchService);
  private fs = inject(Firestore);

  readonly matchId = this.route.snapshot.paramMap.get('matchId') || '';

  /** Room (mode, target, etc.) — typée pour éviter unknown dans le template */
  room$: Observable<RoomInfo | undefined> = this.match.room$(this.matchId).pipe(
    map((r: any): RoomInfo | undefined => (r ? { mode: r.mode, targetScore: r.targetScore } : undefined)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** Top joueurs (déjà triés score desc par ton service) */
  top$: Observable<TopPlayer[]> = this.match.topPlayers$(this.matchId, 50).pipe(
    map((arr: any[]): TopPlayer[] =>
      (arr ?? []).map(p => ({
        uid: String(p?.uid ?? ''),
        displayName: p?.displayName,
        score: typeof p?.score === 'number' ? p.score : Number(p?.score ?? 0),
      }))
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** Events (jusqu’à 500 récents) — typés */
  private events$: Observable<TagEvent[]> = (() => {
    const col = collection(this.fs, `rooms/${this.matchId}/events`);
    const q = query(col, orderBy('ts', 'desc'), limit(500));
    return collectionData(q, { idField: 'id' }).pipe(
      map((rows: any[]): TagEvent[] => rows as TagEvent[])
    );
  })();

  /**
   * Calcule:
   * - tagsByPlayer: total de tags par joueur
   * - bestStreakByPlayer: meilleure série de tags consécutifs
   */
  private metrics$: Observable<Metrics> = this.events$.pipe(
    map((list: TagEvent[]) => {
      const eventsAsc = [...(list ?? [])].sort((a, b) => {
        const ams = toMillis(a?.ts) ?? 0;
        const bms = toMillis(b?.ts) ?? 0;
        return ams - bms;
      });

      const tagsByPlayer = new Map<string, number>();
      const bestStreakByPlayer = new Map<string, number>();
      let prevHunter: string | null = null;
      let currentStreak = 0;

      for (const ev of eventsAsc) {
        if (ev?.type !== 'tag' || !ev?.hunterUid) continue;
        const h = ev.hunterUid;

        tagsByPlayer.set(h, (tagsByPlayer.get(h) ?? 0) + 1);

        if (h === prevHunter) currentStreak += 1;
        else { prevHunter = h; currentStreak = 1; }

        if ((bestStreakByPlayer.get(h) ?? 0) < currentStreak) {
          bestStreakByPlayer.set(h, currentStreak);
        }
      }

      return { tagsByPlayer, bestStreakByPlayer };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** ViewModel final (vainqueur + classement enrichi) — typé */
  vm$: Observable<EndScoreVM> = combineLatest([this.top$, this.metrics$]).pipe(
    map(([players, metrics]) => {
      const rows: PlayerRow[] = (players ?? []).map((p, i) => ({
        uid: p.uid,
        displayName: p.displayName || p.uid.slice(0, 6) || 'Joueur',
        score: Number(p.score ?? 0),
        tags: metrics.tagsByPlayer.get(p.uid) ?? 0,
        bestStreak: metrics.bestStreakByPlayer.get(p.uid) ?? 0,
        rank: i + 1,
      }));
      const winner = rows[0] || null;
      return { winner, rows };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  backToLobby() {
    this.router.navigateByUrl('/lobby');
  }

  trackByUid = (_: number, p: PlayerRow) => p.uid;
}
