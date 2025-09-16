import { Injectable, inject } from '@angular/core';
import { Auth as FirebaseAuth } from '@angular/fire/auth';
import { Firestore, doc, docData, collection, collectionData, updateDoc } from '@angular/fire/firestore';
import { addDoc, getDoc, increment, limit, orderBy, query } from 'firebase/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { MyPlayerDoc, RoomDoc, TagEvent } from './play.models';

@Injectable({ providedIn: 'root' })
export class MatchService {
  // expo interne pour Play (update iFrame)
  readonly fs = inject(Firestore);
  private auth = inject(FirebaseAuth);

  get uid(): string | undefined { return this.auth.currentUser?.uid || undefined; }

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
    const uid = this.uid; if (!uid) return;

    // iFrame côté victime (anti retri)
    const victim = await this.getPlayer(matchId, victimUid);
    const now = Date.now();
    if (victim?.iFrameUntilMs && now < victim.iFrameUntilMs) {
      throw new Error('victim-invulnerable');
    }

    const eventsCol = collection(this.fs, `rooms/${matchId}/events`);
    await addDoc(eventsCol, {
      type: 'tag', hunterUid: uid, victimUid, x, y,
      ts: (await import('firebase/firestore')).serverTimestamp(),
    });

    await updateDoc(doc(this.fs, `rooms/${matchId}/players/${uid}`), { score: increment(1) });
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
}
