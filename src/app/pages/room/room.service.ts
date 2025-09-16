import { Injectable, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  doc, getDoc, setDoc, updateDoc, writeBatch,
  collection, getDocs, collectionData, docData,
  serverTimestamp
} from '@angular/fire/firestore';
import { Observable, defer } from 'rxjs';
import { Player } from './player.model';

export type RoomState = 'idle' | 'in-progress' | 'running' | 'ended';
export type Role = 'chasseur' | 'chassé';

export interface RoomDoc {
  ownerUid?: string;
  state?: RoomState;
  targetScore?: number;
  roundEndAtMs?: number;
  roles?: Record<string, Role>;
  timestamps?: any;
  startedAt?: any;
  rolesUpdatedAt?: any;
}



@Injectable({ providedIn: 'root' })
export class RoomService {
  constructor(
    private env: EnvironmentInjector,
    private fs: Firestore,
  ) {}

  /** Flux temps réel du document room */
  room$(roomId: string): Observable<RoomDoc | null> {
    return defer(() =>
      runInInjectionContext(this.env, () => {
        return docData(doc(this.fs, `rooms/${roomId}`)) as Observable<RoomDoc>;
      })
    );
  }

  /** Flux temps réel des joueurs (idField -> uid injecté côté client) */
  players$ = (roomId: string): Observable<Player[]> => {
    return defer(() =>
      runInInjectionContext(this.env, () => {
        const coll = collection(this.fs, `rooms/${roomId}/players`);
        return collectionData(coll, { idField: 'uid' }) as Observable<Player[]>;
      })
    );
  };

  private roomRef(roomId: string) {
    return doc(this.fs, `rooms/${roomId}`);
  }
  private playerRef(roomId: string, uid: string) {
    return doc(this.fs, `rooms/${roomId}/players/${uid}`);
  }

  /** Crée/merge mon doc joueur — n'écrit PAS `uid` (les règles l’interdisent) */
  async ensureSelfPlayerDoc(roomId: string, uid: string, displayName: string) {
    return runInInjectionContext(this.env, async () => {
      await setDoc(this.playerRef(roomId, uid), { displayName }, { merge: true });
    });
  }

  /** Met à jour uniquement le champ `ready` de ce joueur */
  async toggleReady(roomId: string, uid: string, ready: boolean) {
    return runInInjectionContext(this.env, async () => {
      await updateDoc(this.playerRef(roomId, uid), { ready });
    });
  }

  /** Choisit un chasseur s'il n'en existe pas (préfère l'owner si présent) */
  private async pickHunterUid(roomId: string, preferOwner = true): Promise<string | null> {
    return runInInjectionContext(this.env, async () => {
      const roomSnap = await getDoc(this.roomRef(roomId));
      const room = roomSnap.data() as RoomDoc | undefined;
      if (!room) return null;

      const playersSnap = await getDocs(collection(this.fs, `rooms/${roomId}/players`));
      const players = playersSnap.docs.map(d => ({  ...(d.data() as Player) }));
      if (players.length === 0) return null;

      const existing = players.find(p => p.role === 'chasseur');
      if (existing?.uid) return existing.uid;

      if (room.roles) {
        const found = Object.entries(room.roles).find(([, r]) => r === 'chasseur');
        if (found) return found[0];
      }

      if (preferOwner && room.ownerUid && players.some(p => p.uid === room.ownerUid)) {
        return room.ownerUid;
      }

      const ready = players.filter(p => !!p.ready);
      const pool = ready.length ? ready : players;
      return pool[Math.floor(Math.random() * pool.length)].uid!;
    });
  }

  /** Assigne >=1 chasseur et marque les autres en chassé */
  async ensureRoles(roomId: string): Promise<void> {
    return runInInjectionContext(this.env, async () => {
      const [roomSnap, playersSnap] = await Promise.all([
        getDoc(this.roomRef(roomId)),
        getDocs(collection(this.fs, `rooms/${roomId}/players`)),
      ]);
      if (!roomSnap.exists()) return;

      const players = playersSnap.docs.map(d => ({  ...(d.data() as Player) }));
      if (!players.length) return;

      const already = players.find(p => p.role === 'chasseur');
      const hunterUid = already?.uid ?? await this.pickHunterUid(roomId, true);
      if (!hunterUid) return;

      const roles: Record<string, Role> = {};
      for (const p of players) roles[p.uid!] = (p.uid === hunterUid ? 'chasseur' : 'chassé');

      const batch = writeBatch(this.fs);
      batch.update(this.roomRef(roomId), { roles, rolesUpdatedAt: serverTimestamp() });
      for (const p of players) {
        batch.update(this.playerRef(roomId, p.uid!), { role: roles[p.uid!] });
      }
      await batch.commit();
    });
  }

  /** Démarre: garantit un chasseur puis passe la room à 'running' avec timer/score */
  async start(roomId: string, opts?: { targetScore?: number; roundMs?: number }) {
    return runInInjectionContext(this.env, async () => {
      await this.ensureRoles(roomId);

      const roundMs = opts?.roundMs ?? 60_000;
      const roundEndAtMs = Date.now() + roundMs;

      await updateDoc(this.roomRef(roomId), {
        state: 'running' as RoomState,
        targetScore: opts?.targetScore ?? 5,
        roundEndAtMs,
        startedAt: serverTimestamp(),
      });
    });
  }
}
