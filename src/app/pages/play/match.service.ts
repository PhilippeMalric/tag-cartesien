import { Injectable, inject } from '@angular/core';
import { authState, Auth as FirebaseAuth } from '@angular/fire/auth';
import { Firestore, doc, docData, collection, collectionData, updateDoc, query, orderBy, limit, getDoc, addDoc, serverTimestamp } from '@angular/fire/firestore';

import { Observable, firstValueFrom, map, shareReplay } from 'rxjs';
import { MyPlayerDoc,  TagEvent } from './play.models';
import { RoomDoc } from '../../models/room.model';

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

  events$ = (matchId: string): Observable<TagEvent[]> => {
    const eventsCol = collection(this.fs, `rooms/${matchId}/events`);
    const qEvents = query(eventsCol, orderBy('ts', 'desc'), limit(20));
    return collectionData(qEvents, { idField: 'id' }).pipe(
      map(list => [...(list as TagEvent[])].reverse()),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  private async getPlayer(matchId: string, uid: string) {
    const ref = doc(this.fs, `rooms/${matchId}/players/${uid}`);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as MyPlayerDoc) : undefined;
  }

  async emitTag(matchId: string, x: number, y: number, victimUid: string) {
    const uid = this.uid;
    if (!uid) return;
    const now = Date.now();

    // ⛔️ NEW: règle "sans retag"
    const me = await this.getPlayer(matchId, uid); // déjà existant chez toi
    if (me?.noRetagUid === victimUid && me?.noRetagUntilMs && now < me.noRetagUntilMs) {
      const err: any = new Error('no-retag');
      err.retryInMs = me.noRetagUntilMs - now;
      throw err; // à gérer côté UI (petit toast)
    }

    // (garde "lock" globale existante)
    if (me?.cantTagUntilMs && now < me.cantTagUntilMs) {
      const err: any = new Error('cant-tag-cooldown');
      err.retryInMs = me.cantTagUntilMs - now;
      throw err;
    }
console.log("me?.role",me?.role);

    // (optionnel) vérifie rôle chasseur
    if (me?.role !== 'chasseur' && me?.role !== 'hunter') {
      throw new Error('not-hunter');
    }

    // 🔒 Garde LOCALE anti double-émission
    const lastLocal = this._lastEmitByHunter.get(uid) ?? 0;
    if (now - lastLocal < this.EMIT_COOLDOWN_MS) {
      const err: any = new Error('emit-cooldown');
      err.retryInMs = this.EMIT_COOLDOWN_MS - (now - lastLocal);
      throw err;
    }

    // 🟢 Arme le cooldown local tout de suite, rollback si échec
    this._lastEmitByHunter.set(uid, now);
    try {
      console.log(`[Match] emitTag ${uid} → ${victimUid} @${x.toFixed(1)},${y.toFixed(1)}`);
      
      await addDoc(collection(this.fs, `rooms/${matchId}/events`), {
        type: 'tag',
        hunterUid: uid,
        victimUid,
        x, y,
        ts: serverTimestamp(),
      });
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
    
    // essaie d’abord le courant
    const cur = this.auth.currentUser?.uid;
    if (cur) return cur;
    // sinon attends le prochain authState
    const u = await firstValueFrom(authState(this.auth));
    return u?.uid ?? '';
  }

  topPlayers$(roomId: string, top = 8): Observable<Array<{ uid: string; score: number; displayName?: string; combo?: number }>> {
    const col = collection(this.fs, `rooms/${roomId}/players`);
    const q = query(col, orderBy('score', 'desc'), limit(top));
    return collectionData(q, { idField: 'uid' }) as any;
  }


}
