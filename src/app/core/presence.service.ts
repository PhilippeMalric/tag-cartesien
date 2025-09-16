import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Database, ref, set, onDisconnect, serverTimestamp } from '@angular/fire/database';
import { Auth as FirebaseAuth, onAuthStateChanged } from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private db = inject(Database);
  private auth = inject(FirebaseAuth);
private env = inject(EnvironmentInjector);

  constructor() {
    runInInjectionContext(this.env, () => {
    onAuthStateChanged(this.auth, (u) => {
      if (!u) return;
      const statusRef = ref(this.db, `status/${u.uid}`);
      set(statusRef, { state: 'online', lastChanged: serverTimestamp() });
      onDisconnect(statusRef).set({ state: 'offline', lastChanged: serverTimestamp() });
    });
  })
  }
}
