import { Injectable, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  doc, getDoc, setDoc, updateDoc, writeBatch,
  collection, getDocs, collectionData, docData,
  serverTimestamp
} from '@angular/fire/firestore';
import { Observable, defer } from 'rxjs';
import { Player } from '../room/player.model'; // Assure-toi que Player { uid: string; ... }

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

  /** Flux temps réel des joueurs (idField → injecte 'uid' côté client) */
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

  /** Crée/merge mon doc joueur — n'écrit PAS `uid` (interdit par règles) */
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

  /** Helper interne: détecte s'il existe déjà un chasseur */
  private hasHunter(room: Partial<RoomDoc> | null | undefined, players: Player[]): boolean {
    if (!players?.length) return false;
    if (players.some(p => p.role === 'chasseur')) return true;
    const roles = room?.roles ?? {};
    return Object.values(roles).some(r => r === 'chasseur');
  }

  /** Helper interne: owner > ready > premier (sync) */
  private pickHunterUidSync(room: RoomDoc, players: Player[]): string {
    if (room.ownerUid && players.some(p => p.uid === room.ownerUid)) return room.ownerUid;
    const ready = players.filter(p => !!p.ready);
    if (ready.length) return ready[0].uid;
    return players[0].uid;
  }

  /** Garanti: >=1 chasseur. (Batch non-transactionnel) */
  async ensureAtLeastOneHunter(roomId: string): Promise<void> {
    return runInInjectionContext(this.env, async () => {
      const roomSnap = await getDoc(this.roomRef(roomId));
      if (!roomSnap.exists()) return;
      const room = roomSnap.data() as RoomDoc;

      const playersSnap = await getDocs(collection(this.fs, `rooms/${roomId}/players`));
      const players = playersSnap.docs
        .map(d => ({  ...(d.data() as Player) }))
        .filter(p => !!p.uid);

      if (!players.length) return;
      if (this.hasHunter(room, players)) return;

      const hunterUid = this.pickHunterUidSync(room, players);
      const roles: Record<string, Role> = {};
      for (const p of players) roles[p.uid] = (p.uid === hunterUid ? 'chasseur' : 'chassé');

      const batch = writeBatch(this.fs);
      batch.update(this.roomRef(roomId), { roles, rolesUpdatedAt: serverTimestamp() });
      for (const p of players) {
        batch.set(this.playerRef(roomId, p.uid), { role: roles[p.uid] }, { merge: true });
      }
      await batch.commit();
    });
  }

  /** Démarre: garantit un chasseur puis passe la room à 'running' avec timer/score */
  async start(roomId: string, opts?: { targetScore?: number; roundMs?: number }) {
    return runInInjectionContext(this.env, async () => {
      await this.ensureAtLeastOneHunter(roomId);

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

  /**
   * Applique des rôles fournis (construits côté composant avec playersVM$).
   * Owner-only (tes règles). N'effectue AUCUNE lecture Firestore.
   */
 async applyRoles(roomId: string, roles: Record<string, 'chasseur' | 'chassé'>): Promise<void> {
  return runInInjectionContext(this.env, async () => {
    await updateDoc(this.roomRef(roomId), { roles, rolesUpdatedAt: serverTimestamp() });
  });
}
}
