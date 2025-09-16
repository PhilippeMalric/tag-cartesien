// src/app/pages/score/score.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, collection, collectionData, doc, updateDoc, orderBy, query } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Auth as FirebaseAuth } from '@angular/fire/auth';

@Component({
  selector: 'app-score',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h2>Fin de manche</h2>
    <ul>
      <li *ngFor="let p of (players$ | async)">
        <strong>{{ p.displayName }}</strong> — {{ p.score ?? 0 }}
      </li>
    </ul>
    <div style="margin-top:12px;">
      <button (click)="backToLobby()">Retour au lobby</button>
      <button *ngIf="isOwner" (click)="reopen()">Réouvrir la salle</button>
    </div>
  `,
})
export class Score {
  private route = inject(ActivatedRoute);
  private fs = inject(Firestore);
  private router = inject(Router);
  private auth = inject(FirebaseAuth);

  roomId = this.route.snapshot.paramMap.get('matchId')!; // même id
  players$: Observable<any[]>;
  isOwner = false;

  constructor() {
    const qPlayers = query(
      collection(this.fs, `rooms/${this.roomId}/players`),
      orderBy('score', 'desc')
    );
    this.players$ = collectionData(qPlayers, { idField: 'id' }) as Observable<any[]>;

    // détermine owner rapidement
    doc(this.fs, `rooms/${this.roomId}`);
    // Optionnel : fais un docData(roomRef).subscribe(r => this.isOwner = r.ownerUid === this.auth.currentUser?.uid)
  }

  backToLobby() { this.router.navigate(['/lobby']); }

  async reopen() {
    const roomRef = doc(this.fs, `rooms/${this.roomId}`);
    await updateDoc(roomRef, { state: 'idle', isOpen: true, currentMatchId: null });
    this.router.navigate(['/room', this.roomId]);
  }
}
