import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Auth as FirebaseAuth } from '@angular/fire/auth';
import {
  Firestore, doc, docData, collection, collectionData, setDoc,
} from '@angular/fire/firestore';
import { serverTimestamp as fsServerTimestamp } from 'firebase/firestore';
import { Observable, defer, firstValueFrom } from 'rxjs';
import { Player } from './player.model';

@Injectable({ providedIn: 'root' })
export class RoomService {
  private fs = inject(Firestore);
  private auth = inject(FirebaseAuth);
private env = inject(EnvironmentInjector);
  get uid(): string | undefined {
    return this.auth.currentUser?.uid || undefined;
  }

  players$ = (roomId: string): Observable<Player[]> => {
    return defer(() =>
      runInInjectionContext(this.env, () => {
        const coll = collection(this.fs, `rooms/${roomId}/players`);
        return collectionData(coll, { idField: 'uid' }) as Observable<Player[]>;
      })
    );
  };

  room$(roomId: string): Observable<any> {
    const roomRef = doc(this.fs, `rooms/${roomId}`);
    return docData(roomRef) as Observable<any>;
  }

  /** Crée/merge mon doc joueur pour éviter les échecs de update. */
  async ensureSelfPlayerDoc(roomId: string) {
    const uid = this.uid;
    if (!uid) return;
    const meRef = doc(this.fs, `rooms/${roomId}/players/${uid}`);
    await setDoc(meRef, {
      displayName: this.auth.currentUser?.displayName || null,
      ready: false,
      role: null,
      score: 0,
      joinedAt: fsServerTimestamp(),
    }, { merge: true }).catch(() => {});
  }

  async toggleReady(roomId: string, currentReady: boolean) {
    const uid = this.uid;
    if (!uid) throw new Error('Non connecté');
    const meRef = doc(this.fs, `rooms/${roomId}/players/${uid}`);
    await setDoc(meRef, { ready: !currentReady }, { merge: true });
  }

  /**
   * Lancement par l’owner : n’écrit QUE dans rooms/{roomId}.
   * roles est un map uid → 'chasseur' | 'chassé'
   */
  async start(roomId: string, players: Player[]) {
    const TARGET_SCORE = 5;
    const DURATION_SEC = 120;
    const roundEndAtMs = Date.now() + DURATION_SEC * 1000;

    if (players.length < 2) throw new Error('Il faut au moins 2 joueurs.');
    if (players.some(p => !p.ready)) throw new Error('Tous les joueurs doivent être prêts.');

    const hunterIdx = Math.floor(Math.random() * players.length);
    const roles: Record<string, 'chasseur' | 'chassé'> = {};
    players.forEach((p, i) => { roles[p.id] = (i === hunterIdx ? 'chasseur' : 'chassé'); });

    const roomRef = doc(this.fs, `rooms/${roomId}`);
    await setDoc(roomRef, {
      state: 'in-progress',
      isOpen: false,
      currentMatchId: roomId,
      roles,
      targetScore: TARGET_SCORE,
      roundEndAtMs,
      startedAt: fsServerTimestamp(),
    }, { merge: true });
  }

  /** Utilitaire : récupère une photographie instantanée de la liste des joueurs. */
  async getPlayersSnapshot(roomId: string): Promise<Player[]> {
    return await firstValueFrom(this.players$(roomId));
    // (equiv. à "first value" sans toPromise déprécié)
  }
}
