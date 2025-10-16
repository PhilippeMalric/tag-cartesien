  import { APP_INITIALIZER, ApplicationConfig, Provider, inject } from '@angular/core';
  import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
  import { routes } from './app.routes';

  import { provideAnimations } from '@angular/platform-browser/animations';
  import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';

  import { provideFirebaseApp, initializeApp, FirebaseApp } from '@angular/fire/app';
  import { environment } from '../environments/environment';

  // Auth (on n'utilise PAS initializeAuth pour éviter already-initialized)
  import { provideAuth, getAuth, connectAuthEmulator } from '@angular/fire/auth';
  import { setPersistence, browserSessionPersistence, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

  // Firestore
  import { provideFirestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';

  // (Optionnel) Realtime Database
  import { provideDatabase, getDatabase, connectDatabaseEmulator } from '@angular/fire/database';

  // (Optionnel) Functions
  import { provideFunctions, getFunctions, connectFunctionsEmulator } from '@angular/fire/functions';

  // (Optionnel) Storage
  import { provideStorage, getStorage, connectStorageEmulator } from '@angular/fire/storage';


const IS_BROWSER = typeof window !== 'undefined';
const IS_LOCALHOST = IS_BROWSER && /(^|\.)(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
const shouldUseEmulators = !!environment.useEmulators && IS_LOCALHOST;
  console.log('[ENV]', environment);
console.log('[shouldUseEmulators]', shouldUseEmulators, 'host=', IS_BROWSER ? window.location.hostname : '(ssr)');
  // --- Initializer: attend l'état Auth et fait un sign-in anonyme en émulateur
  function initAuthFactory(): () => Promise<void> {
    return () =>
      new Promise<void>((resolve) => {
        const app = inject(FirebaseApp);
        const auth = getAuth(app);

        let settled = false;
        onAuthStateChanged(auth, async (user) => {
          if (!user && shouldUseEmulators) {
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

      // 2) Auth — réutiliser l'instance existante + persistance + branchement émulateur idempotent
      provideAuth(() => {
        const app = inject(FirebaseApp);
        const auth = getAuth(app);

        // Persistance (ignore l'erreur si déjà fixée par un hot reload)
        setPersistence(auth, browserSessionPersistence).catch(() => { /* no-op */ });

        if (shouldUseEmulators) {
          try {
            connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
          } catch (e: any) {
            // HMR / double appel → le SDK jette 'auth/emulator-config-failed' → on ignore
            if (e?.code !== 'auth/emulator-config-failed') throw e;
          }
        }
        return auth;
      }),
      { provide: APP_INITIALIZER, useFactory: initAuthFactory, multi: true },

      // 3) Firestore
      provideFirestore(() => {
        const fs = getFirestore();
        connectFirestoreEmulator(fs, '127.0.0.1', 8080);
        return fs;
      }),

      // 4) (Optionnel) Functions
      provideFunctions(() => {
        const fns = getFunctions(undefined, 'us-central1');
        if (shouldUseEmulators) connectFunctionsEmulator(fns, '127.0.0.1', 5001);
        return fns;
      }),

      // 5) (Optionnel) Realtime Database
      provideDatabase(() => {
        const db = getDatabase();
        if (shouldUseEmulators) connectDatabaseEmulator(db, '127.0.0.1', 9000);
        return db;
      }),

      // 6) (Optionnel) Storage
      provideStorage(() => {
        const st = getStorage();
        if (shouldUseEmulators) connectStorageEmulator(st, '127.0.0.1', 9199);
        return st;
      }),

      provideAnimations(),
    ] as Provider[],
  };
