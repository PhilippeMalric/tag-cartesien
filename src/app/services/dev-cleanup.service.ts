import { Injectable, EnvironmentInjector, runInInjectionContext, inject } from '@angular/core';
import {
  Firestore,
  collection, getDocs, writeBatch, doc
} from '@angular/fire/firestore';
import {
  Database, ref, remove
} from '@angular/fire/database';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DevCleanupService {
  private env = inject(EnvironmentInjector);
  private fs  = inject(Firestore);
  private rtdb = inject(Database);

  /** Purge TOUTES les rooms et leurs artefacts associés (DEV ONLY) */
  async purgeAllRoomsDev(): Promise<{ rooms: number; rtdbPaths: number }> {
    if (environment.production) {
      throw new Error('Refusé en production.');
    }

    return runInInjectionContext(this.env, async () => {
      const roomsSnap = await getDocs(collection(this.fs, 'rooms'));
      const roomIds = roomsSnap.docs.map(d => d.id);

      // --- Firestore: delete subcollections (players/events) + room doc
      let batch = writeBatch(this.fs);
      let ops = 0;

      for (const r of roomsSnap.docs) {
        const roomId = r.id;

        // players/*
        const playersSnap = await getDocs(collection(this.fs, `rooms/${roomId}/players`));
        for (const p of playersSnap.docs) {
          batch.delete(doc(this.fs, `rooms/${roomId}/players/${p.id}`));
          ops++;
          if (ops >= 450) {
            await batch.commit();
            batch = writeBatch(this.fs);
            ops = 0;
          }
        }

        // events/*
        const eventsSnap = await getDocs(collection(this.fs, `rooms/${roomId}/events`));
        for (const e of eventsSnap.docs) {
          batch.delete(doc(this.fs, `rooms/${roomId}/events/${e.id}`));
          ops++;
          if (ops >= 450) {
            await batch.commit();
            batch = writeBatch(this.fs);
            ops = 0;
          }
        }

        // room doc
        batch.delete(doc(this.fs, `rooms/${roomId}`));
        ops++;
        if (ops >= 450) {
          await batch.commit();
          batch = writeBatch(this.fs);
          ops = 0;
        }
      }

      if (ops > 0) {
        await batch.commit();
      }

      // --- RTDB: remove paths par room
      let rtdbCount = 0;
      for (const roomId of roomIds) {
        const paths = [
          `/positions/${roomId}`,
          `/presence/${roomId}`,
          `/bots/${roomId}`,
          `/roomsMeta/${roomId}`,
        ];
        for (const p of paths) {
          try {
            await remove(ref(this.rtdb, p));
          } catch {
            // ignore en DEV
          }
          rtdbCount++;
        }
      }

      return { rooms: roomIds.length, rtdbPaths: rtdbCount };
    });
  }
}
