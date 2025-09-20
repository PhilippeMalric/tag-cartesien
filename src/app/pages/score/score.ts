// src/app/pages/score/score.ts
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Firestore, collection, query, orderBy, limit, collectionData } from '@angular/fire/firestore';
import { AsyncPipe, NgFor } from '@angular/common';
import { map } from 'rxjs';

type PlayerVM = { uid: string; displayName?: string; score?: number };

@Component({
  standalone: true,
  selector: 'app-score',
  imports: [RouterLink, AsyncPipe, NgFor],
  template: `
    <div style="padding:16px">
      <h2>Score – match {{ matchId }}</h2>

      <div *ngIf="top$ | async as top; else loading">
        <ol>
          <li *ngFor="let p of top">
            <strong>{{ p.displayName || p.uid.slice(0,6) }}</strong>
            — {{ p.score ?? 0 }}
          </li>
        </ol>
      </div>
      <ng-template #loading>Chargement…</ng-template>

      <div style="margin-top:16px; display:flex; gap:8px;">
        <a routerLink="/lobby">Retour lobby</a>
        <a [routerLink]="['/room', matchId]">Rejouer dans la même room</a>
      </div>
    </div>
  `
})
export class Score implements OnInit {
  route = inject(ActivatedRoute);
  router = inject(Router);
  fs = inject(Firestore);

  matchId = '';
  top$: any;

  

  ngOnInit() {
    this.matchId = this.route.snapshot.paramMap.get('matchId') || '';
    // reconstruire l'observable avec le bon matchId
    this.top$ = collectionData(
      query(
        collection(this.fs, `rooms/${this.matchId}/players`),
        orderBy('score', 'desc'),
        limit(12)
      ),
      { idField: 'uid' }
    ).pipe(map(list => list as PlayerVM[]));
  }
}
