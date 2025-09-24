import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { AsyncPipe, NgForOf, NgIf } from '@angular/common';
import { map, shareReplay, combineLatest, Observable } from 'rxjs';
import { MatchService } from '../play/match.service';

// 🔽 NEW: on lit les events pour calculer tags & streak
import {
  Firestore, collection, collectionData, orderBy, limit, query
} from '@angular/fire/firestore';

type Metrics = {
  tagsByPlayer: Map<string, number>;
  bestStreakByPlayer: Map<string, number>;
};

type PlayerRow = {
  uid: string;
  displayName: string;
  score: number;
  tags: number;         // total de tags (events où hunterUid = uid)
  bestStreak: number;   // max de tags consécutifs (sans qu’un autre marque entre)
  rank: number;         // 1-based
};

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

  // Room (mode, target, etc.)
  room$ = this.match.room$(this.matchId).pipe(shareReplay({bufferSize:1, refCount:true}));

  // Top joueurs (score desc) — suppose que tu as déjà cette méthode.
  // Sinon, on peut remplacer par une lecture Firestore de /players triés par score desc.
  top$ = this.match.topPlayers$(this.matchId, 50).pipe(shareReplay({bufferSize:1, refCount:true}));

  // 🔽 NEW: events pour calculer tags + streak
  private events$ = (() => {
    const col = collection(this.fs, `rooms/${this.matchId}/events`);
    const q = query(col, orderBy('ts', 'desc'), limit(500)); // on prend jusqu'à 500 events récents
    return collectionData(q, { idField: 'id' }) as any;
  })();

  /**
   * Calcule:
   * - tagsByPlayer: nombre total de tags par joueur
   * - bestStreakByPlayer: meilleur streak (suite de tags consécutifs sans interruption par un autre joueur)
   *
   * Algo streak:
   *   On parcourt les events du plus ancien au plus récent.
   *   Si hunterUid est le même que le précédent event → streak++ pour ce joueur, sinon streak = 1 pour ce joueur.
   *   On mémorise le max atteint pour chaque joueur.
   */
  private metrics$: Observable<Metrics> = this.events$.pipe(
    map((list: any[]) => {
      const eventsAsc = [...(list ?? [])].sort((a, b) => {
        const ams = a?.ts?.toMillis?.() ?? a?.ts?.seconds * 1000 
        const bms = b?.ts?.toMillis?.() ?? b?.ts?.seconds * 1000 
        return ams - bms;
      });

      const tagsByPlayer = new Map<string, number>();
      const bestStreakByPlayer = new Map<string, number>();
      let prevHunter: string | null = null;
      let currentStreak = 0;

      for (const ev of eventsAsc) {
        if (ev?.type !== 'tag' || !ev?.hunterUid) continue;
        const h = ev.hunterUid as string;

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

  /**
   * Vue finale: vainqueur + classement enrichi (tags, bestStreak)
   */
  vm$ = combineLatest([this.top$, this.metrics$]).pipe(
    map(([players, metrics]) => {
      const rows: PlayerRow[] = (players ?? []).map((p: any, i: number) => ({
        uid: p?.uid,
        displayName: p?.displayName || p?.uid?.slice(0, 6) || 'Joueur',
        score: Number(p?.score ?? 0),
        tags: metrics.tagsByPlayer.get(p?.uid) ?? 0,
        bestStreak: metrics.bestStreakByPlayer.get(p?.uid) ?? 0,
        rank: i + 1,
      }));
      const winner = rows[0] || null;
      return { winner, rows };
    }),
    shareReplay({bufferSize:1, refCount:true})
  );

  backToLobby() {
    this.router.navigateByUrl('/lobby');
  }

  trackByUid = (_: number, p: PlayerRow) => p.uid;
}
