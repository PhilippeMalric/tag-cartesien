import { APP_INITIALIZER, ApplicationConfig, Provider, inject } from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { routes } from './app.routes';

import { provideAnimations } from '@angular/platform-browser/animations';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';

import { provideFirebaseApp, initializeApp, FirebaseApp } from '@angular/fire/app';
import { environment } from '../environments/environment';

// Auth
import { provideAuth, getAuth } from '@angular/fire/auth';
import { setPersistence, browserSessionPersistence, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

// Firestore
import { provideFirestore, getFirestore } from '@angular/fire/firestore';

// Realtime Database (optionnel)
import { provideDatabase, getDatabase } from '@angular/fire/database';

// Functions (optionnel)
import { provideFunctions, getFunctions } from '@angular/fire/functions';

// Storage (optionnel)
import { provideStorage, getStorage } from '@angular/fire/storage';

const IS_BROWSER = typeof window !== 'undefined';
console.log('[ENV]', environment);

// --- Initializer: attend l'état Auth et fait un sign-in anonyme si nécessaire
function initAuthFactory(): () => Promise<void> {
  return () =>
    new Promise<void>((resolve) => {
      const app = inject(FirebaseApp);
      const auth = getAuth(app);

      let settled = false;
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          try { await signInAnonymously(auth); } catch (e) { console.error('[auth] anon failed', e); }
        }
        if (!settled) { settled = true; resolve(); }
      });
    });
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },

    provideRouter(routes, withEnabledBlockingInitialNavigation()),

    // 1) Firebase App — TOUJOURS initialiser ici
    provideFirebaseApp(() => initializeApp(environment.firebase)),

    // 2) Auth — persistance session
    provideAuth(() => {
      const app = inject(FirebaseApp);
      const auth = getAuth(app);
      // Persistance (ignore l'erreur si déjà fixée par un hot reload)
      setPersistence(auth, browserSessionPersistence).catch(() => { /* no-op */ });
      return auth;
    }),
    { provide: APP_INITIALIZER, useFactory: initAuthFactory, multi: true },

    // 3) Firestore
    provideFirestore(() => getFirestore()),

    // 4) Functions (région à ajuster si besoin)
    provideFunctions(() => getFunctions(undefined, 'us-central1')),

    // 5) Realtime Database
    provideDatabase(() => getDatabase()),

    // 6) Storage
    provideStorage(() => getStorage()),

    provideAnimations(),
  ] as Provider[],
};
