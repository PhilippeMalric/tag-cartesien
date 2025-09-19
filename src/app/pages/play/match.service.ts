import { Injectable, inject } from '@angular/core';
import { authState, Auth as FirebaseAuth } from '@angular/fire/auth';
import { Firestore, doc, docData, collection, collectionData, updateDoc } from '@angular/fire/firestore';
import { addDoc, getDoc, increment, limit, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { Observable, firstValueFrom, map, shareReplay } from 'rxjs';
import { MyPlayerDoc, RoomDoc, TagEvent } from './play.models';

@Injectable({ providedIn: 'root' })
export class MatchService {
  // expo interne pour Play (update iFrame)
  readonly fs = inject(Firestore);
  private auth = inject(FirebaseAuth);
  get uid(): string | undefined { return this.auth.currentUser?.uid || undefined; }
  
  private readonly EMIT_COOLDOWN_MS = 5000;
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

    // 🔒 Garde locale (évite double émission en < 1 s)
    const lastLocal = this._lastEmitByHunter.get(uid) ?? 0;
    
    
    if (now - lastLocal < this.EMIT_COOLDOWN_MS) {
      const err: any = new Error('emit-cooldown');
      err.retryInMs = this.EMIT_COOLDOWN_MS - (now - lastLocal);
      console.log("now - lastLocal",now - lastLocal,this.EMIT_COOLDOWN_MS);
     // throw err;
    }

    

    // 🟢 On "arme" le cooldown local tout de suite, et on revert en cas d'échec
    this._lastEmitByHunter.set(uid, now);
    try {
      await addDoc(collection(this.fs, `rooms/${matchId}/events`), {
        type: 'tag',
        hunterUid: uid,
        victimUid,
        x, y,
        ts: serverTimestamp(),
      });
    } catch (e) {
      // Rollback si l'écriture échoue
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
