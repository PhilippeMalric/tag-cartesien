// src/app/pages/lobby/lobby.component.ts
import { Component, inject, OnInit, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { Observable, map, startWith } from 'rxjs';

// AngularFire
import { Auth as FirebaseAuth } from '@angular/fire/auth';
import {
  Firestore,
  doc, setDoc,
  collection, collectionData,
  query, orderBy, limit,
  CollectionReference,
} from '@angular/fire/firestore';
import { serverTimestamp as fsServerTimestamp } from 'firebase/firestore';

// ✅ RTDB (AngularFire, pas 'firebase/database')
import { Database, ref, set } from '@angular/fire/database';

// Services
import { ThemeService } from '../../services/theme.service';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

type RoomVM = {
  id: string;
  ownerUid: string;
  players?: number;
  targetScore: number;
  timeLimit: number;
  state: 'idle' | 'running' | 'in-progress' | 'done';
  updatedAt?: any;
};

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    FormsModule, AsyncPipe,
    MatToolbarModule, MatCardModule, MatButtonModule, MatIconModule,
    MatListModule, MatProgressBarModule, MatFormFieldModule, MatInputModule,
    MatTooltipModule, MatDividerModule,
  ],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss'],
})
export class LobbyComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(FirebaseAuth);
  private db = inject(Firestore);
  private rtdb = inject(Database);
  private env = inject(EnvironmentInjector);

  readonly theme = inject(ThemeService);

  displayName = '';
  joinCode = '';
  loading = false;

  rooms$!: Observable<RoomVM[]>;

  ngOnInit(): void {
    // Charger le displayName persistant si présent
    this.displayName = localStorage.getItem('displayName') ?? '';

    // ⚠️ AngularFire dans un contexte d’injection
    runInInjectionContext(this.env, () => {
      const roomsCol = collection(this.db, 'rooms') as CollectionReference<any>;
      const q = query(roomsCol, orderBy('updatedAt', 'desc'), limit(50));
      this.rooms$ = collectionData(q, { idField: 'id' }).pipe(
        startWith([] as any[]),
        map((rows: any[]) =>
          rows.map(r => ({
            id: r.id,
            ownerUid: r.ownerUid,
            players: r.players ?? 0,
            targetScore: r.targetScore ?? 5,
            timeLimit: r.timeLimit ?? 120,
            state: (r.state ?? 'idle') as RoomVM['state'],
            updatedAt: r.updatedAt ?? r.createdAt,
          }))
        )
      );
    });
  }

  async refresh() {
    this.loading = true;
    setTimeout(() => (this.loading = false), 350);
  }

  async createRoom() {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    // Persister le nom localement
    const name = (this.displayName || '').trim();
    if (name) localStorage.setItem('displayName', name);

    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();

    await runInInjectionContext(this.env, async () => {
      // Firestore: création de la room
      const refFS = doc(this.db, `rooms/${roomId}`);
      await setDoc(
        refFS,
        {
          ownerUid: uid,
          targetScore: 5,
          timeLimit: 120,
          state: 'idle',
          players: 1,
          createdAt: fsServerTimestamp(),
          updatedAt: fsServerTimestamp(),
          displayNameOwner: name || null,
        },
        { merge: true }
      );

      // ✅ RTDB: ownerUid pour règles "bots"
      try {
        await set(ref(this.rtdb, `roomsMeta/${roomId}/ownerUid`), uid);
      } catch { /* ignore */ }
    });

    await this.router.navigate(['/room', roomId]);
  }

  // Si tu veux binder (ngModelChange)="onJoinCodeInput($event)"
  onJoinCodeInput(v: string) {
    this.joinCode = (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  async quickJoin() {
    const code = (this.joinCode || '').trim().toUpperCase();
    if (!code) return;
    await this.router.navigate(['/room', code]);
  }

  async join(r: RoomVM) {
    await this.router.navigate(['/room', r.id]);
  }
}
