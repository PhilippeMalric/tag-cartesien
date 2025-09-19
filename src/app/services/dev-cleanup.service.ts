import { Injectable, inject } from '@angular/core';
import { Firestore, collection, getDocs, deleteDoc, doc } from '@angular/fire/firestore';
import { Database, ref, get, remove } from '@angular/fire/database';
import { environment } from '../../environments/environment';

function tsToMillis(ts: any, fallback: number): number {
  if (!ts) return fallback;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class DevCleanupService {
  private fs = inject(Firestore);
  private rtdb = inject(Database);

  async cleanOldRoomsFirestore(maxAgeMs = 1000 * 60 * 60 * 6) {
    if (environment.production) return;
    const now = Date.now();
    const snap = await getDocs(collection(this.fs, 'rooms'));
    const jobs: Promise<any>[] = [];
    snap.forEach((d) => {
      const data: any = d.data() || {};
      const created = tsToMillis(data?.createdAt, now);
      if (now - created > maxAgeMs) {
        jobs.push(deleteDoc(doc(this.fs, 'rooms', d.id)));
      }
    });
    await Promise.allSettled(jobs);
  }

  async cleanOldRoomsRtdb(_maxAgeMs = 1000 * 60 * 60 * 6) {
    if (environment.production) return;
    const paths = ['positions', 'bots', 'roomsMeta', 'presence'];
    const jobs: Promise<any>[] = [];
    for (const p of paths) {
      const s = await get(ref(this.rtdb, p));
      const val = s.val() || {};
      for (const k of Object.keys(val)) {
        jobs.push(remove(ref(this.rtdb, `${p}/${k}`)));
      }
    }
    await Promise.allSettled(jobs);
  }

  async deleteRoomFirestore(roomId: string) {
    await deleteDoc(doc(this.fs, `rooms/${roomId}`));
  }
}
