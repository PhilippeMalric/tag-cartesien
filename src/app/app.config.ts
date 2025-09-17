import { ApplicationConfig, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

import { provideAnimations } from '@angular/platform-browser/animations';

// Firebase App
import { provideFirebaseApp, initializeApp, FirebaseApp } from '@angular/fire/app';
import { environment } from '../environments/environment';

// Firebase Auth
import { provideAuth, initializeAuth, getAuth } from '@angular/fire/auth';
import { browserSessionPersistence } from 'firebase/auth';

// Firestore / RTDB
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideDatabase, getDatabase } from '@angular/fire/database';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    provideRouter(routes),

    // ✅ Animations Material (pas la version /async)
    provideAnimations(),

    // ✅ Firebase App
    provideFirebaseApp(() => initializeApp(environment.firebase)),

    // ✅ Auth avec persistance "session" et app correctement injectée
    provideAuth(() => {
      const app = inject(FirebaseApp);
      try {
        // Initialise explicitement l'Auth avec persistance par session
        return initializeAuth(app, { persistence: browserSessionPersistence });
      } catch {
        // Si déjà initialisé, on récupère simplement l'instance
        return getAuth(app);
      }
    }),

    // ✅ Firestore / Realtime Database
    provideFirestore(() => getFirestore()),
    provideDatabase(() => getDatabase()),
  ],
};
