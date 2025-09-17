// src/app/services/dev-cleanup.service.ts
import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';

// Firestore
import {
  Firestore, collection, query, where, limit, getDocs, writeBatch, doc,
  deleteDoc,
  Timestamp,
  orderBy
} from '@angular/fire/firestore';

// RTDB
import {
  Database, ref, query as rtdbQuery, orderByChild, endAt, limitToFirst, get, remove,
  update
} from '@angular/fire/database';

// Auth (si tu veux restreindre côté client aux rooms possédées)
import { Auth } from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class DevCleanupService {
  private fs = inject(Firestore);
  private db = inject(Database);
  private auth = inject(Auth);
  private env = inject(EnvironmentInjector);

  // --- Helpers pour garantir le contexte d’injection AngularFire ---
  private fsGetDocs = <T>(q: any) =>
    runInInjectionContext(this.env, () => getDocs(q as any));

  private rtdbGet = (q: any) =>
    runInInjectionContext(this.env, () => get(q as any));

  /**
   * Supprime les rooms Firestore dont updatedAt <= now - maxAgeMs.
   * Hypothèses: rooms/{roomId} possède { ownerUid, updatedAt }.
   * On supprime aussi la sous-collec players (jusqu’à 250 entrées par passe).
   */
  async cleanOldRoomsFirestore(maxAgeMs = 2  ): Promise<{ deleted: number }> {
    const cutoff = Date.now() - maxAgeMs;
    const uid = this.auth.currentUser?.uid; // si tu veux filtrer par owner
    let totalDeleted = 0;

    while (true) {
      const roomsCol = collection(this.fs, 'rooms');
      console.log("snapFS",collection);
      const cutoffTs = Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000);

     const q = query(
        roomsCol,
        where('createdAt', '<=', cutoffTs),   // ou new Date(Date.now() - …)
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await this.fsGetDocs(q);

      console.log("snapFS",snap);
      
      if (snap.empty) break;

      const batch = writeBatch(this.fs);

      for (const d of snap.docs) {
        const roomId = d.id;

        // delete subcollection players (best-effort)
        try {
          const playersColPath = `rooms/${roomId}/players`;
          const playersCol: any = collection(this.fs, playersColPath);
          const ps = await this.fsGetDocs(query(playersCol, limit(250)));
          ps.forEach(p => batch.delete(p.ref));
        } catch {
          // ignore
        }

        batch.delete(doc(this.fs, `rooms/${roomId}`));
        totalDeleted++;
      }

      await runInInjectionContext(this.env, () => batch.commit());
      // loop again if more pages
    }

    return { deleted: totalDeleted };
  }

  /**
   * Supprime les rooms RTDB dont updatedAt <= now - maxAgeMs.
   * Hypothèses: /rooms/{roomId} possède { ownerUid, updatedAt }.
   * remove() supprime récursivement le nœud.
   */
  // dev-cleanup.service.ts — remplacer cleanOldRoomsRtdb par ceci
  async cleanOldRoomsRtdb(maxAgeMs = 2 * 60 * 60 * 1000): Promise<{ deleted: number }> {
    const cutoff = Date.now() - maxAgeMs;
    console.log("cutoff",cutoff);
    
    let totalDeleted = 0;
    const PAGE_SIZE = 200; // supprime jusqu’à 200 rooms par passe

    while (true) {
      const roomsRef = ref(this.db, 'rooms');
      const q = rtdbQuery(
        roomsRef,
        orderByChild('updatedAt'),
        endAt(cutoff),
        limitToFirst(PAGE_SIZE)
      );
//console.log("q",q);

      // get() exécuté dans le bon contexte Angular (helper existant this.rtdbGet)
      const snap = await this.rtdbGet(q);
      console.log("snap",snap);
      
      if (!snap.exists()) break;
      console.log("snap.exists");
      
      // Multi-suppression en une seule update parent: { roomId: null, ... }
      const updates: Record<string, null> = {};
      snap.forEach(child => {
        const roomId = child.key!;
        updates[roomId] = null;
        totalDeleted++;
      });

      if (!Object.keys(updates).length) break;

      // update() dans le contexte d’injection, sinon AngularFire râle
      await runInInjectionContext(this.env, () => update(roomsRef, updates));

      // boucle si d’autres anciennes rooms restent
    }
    console.log("totalDeleted",totalDeleted);
    
    return { deleted: totalDeleted };
  }

  async deleteRoomFirestore(roomId: string): Promise<{ playersDeleted: number; roomDeleted: boolean }> {
    let playersDeleted = 0;

    // Supprimer players par pages de 500 pour éviter la limite de batch
    while (true) {
      const playersCol = collection(this.fs, `rooms/${roomId}/players`);
      const ps = await runInInjectionContext(this.env, () => getDocs(query(playersCol, limit(500))));
      if (ps.empty) break;

      const batch = writeBatch(this.fs);
      ps.forEach(p => { batch.delete(p.ref); playersDeleted++; });
      await runInInjectionContext(this.env, () => batch.commit());
    }

    // Supprimer le doc room
    await runInInjectionContext(this.env, () => deleteDoc(doc(this.fs, `rooms/${roomId}`)));
    return { playersDeleted, roomDeleted: true };
  }

}
