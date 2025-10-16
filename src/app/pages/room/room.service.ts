import { Injectable, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  doc, getDoc, setDoc, updateDoc, writeBatch,
  collection, getDocs, collectionData, docData,
  serverTimestamp,
  query,
  where,
  getDocFromCache
} from '@angular/fire/firestore';
import { Observable, defer, map, tap, shareReplay } from 'rxjs';

import type { RoomDoc, Role, GameMode } from '@tag/types';
import type { Player } from '../room/player.model';

export type RoomState = RoomDoc['state']; // 'idle' | 'running' | 'ended'

@Injectable({ providedIn: 'root' })
export class RoomService {
  constructor(
    private env: EnvironmentInjector,
    private fs: Firestore,
  ) {}
  private ensureInFlight = new Map<string, Promise<void>>();

  /** Flux temps réel du document room */
  room$(roomId: string): Observable<RoomDoc | null> {
    return defer(() =>
      runInInjectionContext(this.env, () => {
        const r = doc(this.fs, `rooms/${roomId}`);
        return docData(r).pipe(
          map(d => (d ?? null) as RoomDoc | null),
          shareReplay({ bufferSize: 1, refCount: true }),
        );
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

  ensureSelfPlayerDoc(roomId: string, uid: string, displayName?: string): Promise<void> {
    const key = `${roomId}/${uid}`;
    const name = (displayName ?? '').trim();
    if (!name) return Promise.resolve();

    const inflight = this.ensureInFlight.get(key);
    if (inflight) return inflight;

    const p = runInInjectionContext(this.env, async () => {
      const ref = this.playerRef(roomId, uid);

      try {
        const snap = await getDocFromCache(ref);
        if (snap.exists()) {
          const curr = (snap.data()?.['displayName'] ?? '').trim();
          if (curr === name) return;
        }
      } catch {}

      await setDoc(ref, { displayName: name }, { merge: true });
    }).finally(() => {
      this.ensureInFlight.delete(key);
    });

    this.ensureInFlight.set(key, p);
    return p;
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
    if (players.some(p => p.role === 'hunter')) return true;
    const roles = room?.roles ?? {};
    return Object.values(roles).some(r => r === 'hunter');
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
        .map(d => ({ ...(d.data() as Player) }))
        .filter(p => !!p.uid);

      if (!players.length) return;
      if (this.hasHunter(room, players)) return;

      const hunterUid = this.pickHunterUidSync(room, players);
      const roles: Record<string, Role> = {};
      for (const p of players) roles[p.uid] = (p.uid === hunterUid ? 'hunter' : 'prey');

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

  /** Sauvegarde mon point de départ (dans mon doc player) */
  async setMySpawn(roomId: string, uid: string, spawn: { x: number; y: number }) {
    return runInInjectionContext(this.env, async () => {
      await updateDoc(this.playerRef(roomId, uid), {
        spawn: {
          x: Math.max(-50, Math.min(50, Math.round(spawn.x))),
          y: Math.max(-50, Math.min(50, Math.round(spawn.y))),
        },
      });
    });
  }

  async setSpawn(roomId: string, uid: string, spawn: { x: number; y: number }) {
    return runInInjectionContext(this.env, async () => {
      await updateDoc(this.playerRef(roomId, uid), { spawn: { x: spawn.x, y: spawn.y } });
    });
  }

  /**
   * Applique des rôles fournis (construits côté composant avec playersVM$).
   * Owner-only (tes règles). N'effectue AUCUNE lecture Firestore ici.
   */
  async applyRoles(roomId: string, roles: Record<string, Role>): Promise<void> {
    return runInInjectionContext(this.env, async () => {
      await updateDoc(this.roomRef(roomId), { roles, rolesUpdatedAt: serverTimestamp() });
      // Optionnel: refléter sur chaque player
      const batch = writeBatch(this.fs);
      for (const [uid, role] of Object.entries(roles)) {
        batch.set(this.playerRef(roomId, uid), { role }, { merge: true });
      }
      await batch.commit();
    });
  }

  async setMode(roomId: string, mode: GameMode) {
    const ref = doc(this.fs, `rooms/${roomId}`);
    await updateDoc(ref, { mode, updatedAt: serverTimestamp() });
  }

  getMode$(roomId: string): Observable<GameMode | undefined> {
    return defer(() =>
      runInInjectionContext(this.env, () => {
        const ref = doc(this.fs, `rooms/${roomId}`);
        return (docData(ref) as Observable<RoomDoc>).pipe(
          map(room => room?.mode as GameMode | undefined)
        );
      })
    );
  }

  async setState(roomId: string, state: RoomState | 'in-progress') {
    const ref = doc(this.fs, `rooms/${roomId}`);
    await updateDoc(ref, { state, updatedAt: serverTimestamp() });
  }

  /** Seul le owner devrait appeler cette méthode (les rules le garantissent) */
  async setHunter(roomId: string, targetUid: string): Promise<void> {
    const roomRef = doc(this.fs, 'rooms', roomId);
    await updateDoc(roomRef, {
      hunterUid: targetUid,
      [`roles.${targetUid}`]: 'hunter',
      updatedAt: serverTimestamp(),
    });
  }

  /** Fallback si le chasseur quitte: remettre au owner */
  async ensureHunter(roomId: string, ownerUid: string, currentHunterUid: string | null, players: Player[]): Promise<void> {
    if (currentHunterUid && players.some(p => p.uid === currentHunterUid)) return;
    await this.setHunter(roomId, ownerUid);
  }

  async setRole(roomId: string, uid: string, role: Role): Promise<void> {
    // Écrit à la fois dans room.roles et dans le doc player
    return this.setPlayerRole(roomId, uid, role);
  }

  /** Écrit plusieurs rôles d'un coup (merge partiel) */
  async setRoles(roomId: string, roles: Record<string, Role>): Promise<void> {
    const roomRef = doc(this.fs, 'rooms', roomId);
    const payload: any = { updatedAt: serverTimestamp() };
    for (const [uid, role] of Object.entries(roles)) {
      payload[`roles.${uid}`] = role;
    }
    await updateDoc(roomRef, payload);
  }

  async setPlayerRole(roomId: string, uid: string, role: Role): Promise<void> {
    return runInInjectionContext(this.env, async () => {
      const now   = serverTimestamp();
      const batch = writeBatch(this.fs);

      // room.roles.<uid> + updatedAt
      batch.update(this.roomRef(roomId), {
        [`roles.${uid}`]: role,
        updatedAt: now,
      } as any);

      // players/<uid>.role (merge)
      batch.set(this.playerRef(roomId, uid), { role, updatedAt: now } as any, { merge: true });

      await batch.commit();
    });
  }
}
