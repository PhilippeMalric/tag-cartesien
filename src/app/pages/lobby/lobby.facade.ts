import { Injectable, EnvironmentInjector, inject, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, map, startWith } from 'rxjs';
import { RoomVM } from './lobby.types';

// AngularFire
import { Auth as FirebaseAuth } from '@angular/fire/auth';
import {
  Firestore, CollectionReference,
  collection, collectionData, doc, setDoc, query, orderBy, limit
} from '@angular/fire/firestore';
import { serverTimestamp as fsServerTimestamp } from 'firebase/firestore';
import { Database, ref, set as rtdbSet } from '@angular/fire/database';

// Services
import { DevCleanupService } from '../../services/dev-cleanup.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { GameMode } from '../../models/room.model';

@Injectable({ providedIn: 'root' })
export class LobbyFacade {
  // DI (façade utilisable hors composant)
  private router = inject(Router);
  private auth = inject(FirebaseAuth);
  private db = inject(Firestore);
  private rtdb = inject(Database);
  private env = inject(EnvironmentInjector);
  private devCleanup = inject(DevCleanupService);
  private snack = inject(MatSnackBar);

  private _mode = signal<GameMode>('classic');       // 👈 NEW
  private _targetScore = signal<number>(5);          // 👈 NEW

  // getters/setters (proxies pour le composant)
  get mode(): GameMode { return this._mode(); }      // 👈 NEW
  set mode(v: GameMode) { this._mode.set(v ?? 'classic'); }   // 👈 NEW

  get targetScore(): number { return this._targetScore(); }   // 👈 NEW
  set targetScore(v: number) { this._targetScore.set(+v || 1); } // 👈 NEW

  // UI state (signals)
  cleaning = signal(false);
  deletingId = signal<string | null>(null);
  loading = signal(false);

  // champs liés au template (via getters/setters dans le composant)
  private _displayName = signal<string>(localStorage.getItem('displayName') ?? '');
  private _joinCode = signal<string>('');

  rooms$!: Observable<RoomVM[]>;
  readonly showDevCleanup = !environment.production;
  readonly TWO_HOURS = 2 * 60 * 60 * 1000;

 // helper local
 toMillis(ts: any): number {
  if (!ts) return Date.now();
  // Firestore Timestamp
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  // { seconds: number }
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  // Date | number
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  return Date.now();
}

init(): void {
  runInInjectionContext(this.env, () => {
    const roomsCol = collection(this.db, 'rooms') as CollectionReference<any>;
    const q = query(roomsCol, orderBy('updatedAt', 'desc'), limit(50));
    // rooms$ mapping → inclure le mode
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
          createdAtMs: this.toMillis(r.createdAt ?? r.updatedAt),
          mode: (r.mode ?? 'classic') as GameMode,         // 👈 NEW
        }))
      )
    );
  });
}

  // Proxies pour [(ngModel)]
  get displayName(): string { return this._displayName(); }
  set displayName(v: string) { this._displayName.set(v ?? ''); }

  get joinCode(): string { return this._joinCode(); }
  set joinCode(v: string) { this._joinCode.set(v ?? ''); }

  onJoinCodeInput(v: string) {
    this.joinCode = (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  refresh() {
    this.loading.set(true);
    setTimeout(() => this.loading.set(false), 350);
  }

  // createRoom() → écrire le mode + targetScore si classic
  async createRoom() {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    const name = (this.displayName || '').trim();
    if (name) localStorage.setItem('displayName', name);

    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();

    await runInInjectionContext(this.env, async () => {
      const refFS = doc(this.db, `rooms/${roomId}`);
      const isClassic = this.mode === 'classic';
      await setDoc(refFS, {
        ownerUid: uid,
        mode: this.mode,                                    // 👈 NEW
        targetScore: isClassic ? this.targetScore : null,   // 👈 NEW
        timeLimit: 120,
        state: 'idle',
        players: 1,
        createdAt: fsServerTimestamp(),
        updatedAt: fsServerTimestamp(),
        displayNameOwner: name || null,
      }, { merge: true });

      try { await rtdbSet(ref(this.rtdb, `roomsMeta/${roomId}/ownerUid`), uid); } catch {}
    });

    await this.router.navigate(['/room', roomId]);
  }

  async quickJoin() {
    const code = (this.joinCode || '').trim().toUpperCase();
    if (!code) return;
    await this.router.navigate(['/room', code]);
  }

  async join(r: RoomVM) {
    await this.router.navigate(['/room', r.id]);
  }

  async cleanLobby() {
    //console.log("cleanLobby");
    
    this.cleaning.set(true);
    try {
      await Promise.allSettled([
        this.devCleanup.cleanOldRoomsFirestore(),
        this.devCleanup.cleanOldRoomsRtdb(this.TWO_HOURS),
      ]);
    } finally {
      this.cleaning.set(false);
    }
  }

  async deleteRoom(roomId: string) {
    if (!confirm(`Supprimer la salle "${roomId}" ?`)) return;
    this.deletingId.set(roomId);
    try {
      await this.devCleanup.deleteRoomFirestore(roomId);
      this.snack.open('Salle supprimée', 'OK', { duration: 2500 });
      this.refresh();
    } catch (e: any) {
      this.snack.open(`Erreur: ${e?.message ?? e}`, 'Fermer', { duration: 4000 });
    } finally {
      this.deletingId.set(null);
    }
  }
}
