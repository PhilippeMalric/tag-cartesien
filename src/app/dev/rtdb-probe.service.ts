// src/app/dev/rtdb-probe.service.ts
import { Injectable, inject } from '@angular/core';
import { Database, ref, set, get, child } from '@angular/fire/database';

@Injectable({ providedIn: 'root' })
export class RtdbProbe {
  private db = inject(Database);

  async ping(matchId: string, uid: string) {
    try {
      const path = `positions/${matchId}/__probe_${uid.slice(0,6)}`;
      await set(ref(this.db, path), { ok: true, t: Date.now() });
      const snap = await get(child(ref(this.db), path));
      console.log('[RTDB][probe] write+read OK?', snap.exists(), 'path=', path);
    } catch (e: any) {
      console.error('[RTDB][probe] FAIL', e?.code || e?.message || e);
    }
  }
}
