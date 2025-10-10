import { Injectable, inject } from '@angular/core';
import { authState, Auth as FirebaseAuth } from '@angular/fire/auth';
import {
  Firestore,
  doc, docData, collection, collectionData,
  updateDoc, query, orderBy, limit, getDoc, addDoc, serverTimestamp
} from '@angular/fire/firestore';

import { Observable, firstValueFrom, map, shareReplay } from 'rxjs';
import { MyPlayerDoc } from './play.models'; // on garde ton type UI local
import type { RoomDoc, GameMode, Role, EventItem } from '@tag/types';

@Injectable({ providedIn: 'root' })
export class MatchService {
  // expo interne pour Play (update iFrame)
  readonly fs = inject(Firestore);
  private auth = inject(FirebaseAuth);
  get uid(): string | undefined { return this.auth.currentUser?.uid || undefined; }
  
  private readonly EMIT_COOLDOWN_MS = 200;
  private _lastEmitByHunter = new Map<string, number>(); // key = uid

  myPlayer$(matchId: string): Observable<MyPlayerDoc> {
    const uid = this.uid!;
    const meRef = doc(this.fs, `rooms/${matchId}/players/${uid}`);
    return docData(meRef).pipe(
      map(d => (d ?? {}) as MyPlayerDoc),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  room$(matchId: string): Observable<RoomDoc> {
    const roomRef = doc(this.fs, `rooms/${matchId}`);
    return docData(roomRef).pipe(
      map(d => (d ?? {}) as RoomDoc),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /** Flux d'événements typés @tag/types (ordre récent → ancien dans la collection) */
events$ = (matchId: string): Observable<EventItem[]> => {
  const col = collection(this.fs, `rooms/${matchId}/events`);
  const q  = query(col, orderBy('ts', 'desc'), limit(50));
  return collectionData(q, { idField: 'id' }).pipe(
    map(list => (list as EventItem[]).slice().reverse()),
    shareReplay({ bufferSize: 1, refCount: true })
  );
};

  private async getPlayer(matchId: string, uid: string) {
    const ref = doc(this.fs, `rooms/${matchId}/players/${uid}`);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as MyPlayerDoc) : undefined;
  }

  async emitTag(matchId: string, x: number, y: number, victimUid: string) {
    const uid = this.uid;
    if (!uid) return;
    const now = Date.now();

    // ⛔️ règle "sans retag"
    const me = await this.getPlayer(matchId, uid);
    if (me?.noRetagUid === victimUid && me?.noRetagUntilMs && now < me.noRetagUntilMs) {
      const err: any = new Error('no-retag');
      err.retryInMs = me.noRetagUntilMs - now;
      throw err;
    }

    // cooldown côté joueur
    if (me?.cantTagUntilMs && now < me.cantTagUntilMs) {
      const err: any = new Error('cant-tag-cooldown');
      err.retryInMs = me.cantTagUntilMs - now;
      throw err;
    }

    // rôle chasseur (tolère ancien FR mais cible EN)
    if (me?.role !== 'hunter') {
      throw new Error('not-hunter');
    }

    // 🔒 anti double-émission locale
    const lastLocal = this._lastEmitByHunter.get(uid) ?? 0;
    if (now - lastLocal < this.EMIT_COOLDOWN_MS) {
      const err: any = new Error('emit-cooldown');
      err.retryInMs = this.EMIT_COOLDOWN_MS - (now - lastLocal);
      throw err;
    }

    // 🟢 armer le cooldown local tout de suite
    this._lastEmitByHunter.set(uid, now);
    try {
      // lire le mode pour payload
      const roomSnap = await getDoc(doc(this.fs, `rooms/${matchId}`));
      const mode = (roomSnap.data()?.['mode'] ?? 'classic') as GameMode;

      await addDoc(collection(this.fs, `rooms/${matchId}/events`), {
        type: 'tag/hit',
        createdAt: serverTimestamp(),
        payload: {
          byUid: uid,
          targetUid: victimUid,
          mode,
          // si utile: inclure la position dans le payload
          x, y,
        },
      } as any);
    } catch (e) {
      this._lastEmitByHunter.delete(uid);
      throw e;
    }
  }

  async endIfTargetReached(matchId: string, projectedMyScore: number) {
    const uid = this.uid; if (!uid) return;
    const roomRef = doc(this.fs, `rooms/${matchId}`);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as RoomDoc;
    if (room.ownerUid !== uid) return;
    if (!room?.targetScore || projectedMyScore < room.targetScore) return;
    await updateDoc(roomRef, { state: 'ended' });
  }

  endByTimer = async (matchId: string) =>  {
    const uid = this.uid; if (!uid) return;
    const roomRef = doc(this.fs, `rooms/${matchId}`);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as RoomDoc;
    if (room.ownerUid !== uid) return;
    await updateDoc(roomRef, { state: 'ended' });
  }

  async getMyPlayerIdFromAuth(): Promise<string> {
    const cur = this.auth.currentUser?.uid;
    if (cur) return cur;
    const u = await firstValueFrom(authState(this.auth));
    return u?.uid ?? '';
  }

  topPlayers$(roomId: string, top = 8): Observable<Array<{ uid: string; score: number; displayName?: string; combo?: number }>> {
    const col = collection(this.fs, `rooms/${roomId}/players`);
    const q = query(col, orderBy('score', 'desc'), limit(top));
    return collectionData(q, { idField: 'uid' }) as any;
  }
}
