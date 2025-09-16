import { Component, OnInit, ChangeDetectionStrategy, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// AngularFire Auth
import {
  Auth as FirebaseAuth,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
} from '@angular/fire/auth';

@Component({
  selector: 'app-auth',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDividerModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss'],
})
export class AuthComponent implements OnInit {
  public readonly router = inject(Router);
  private readonly afAuth = inject(FirebaseAuth);
  private readonly env = inject(EnvironmentInjector);
  private readonly snack = inject(MatSnackBar);

  form = inject(FormBuilder).nonNullable.group({
    displayName: ['', [Validators.maxLength(32)]],
  });

  loading = false;
  isLoggedIn = false;
  error = '';
  hint  = '';

  ngOnInit(): void {
    document.documentElement.dataset['theme'] = 'dark';
    // Écoute de session dans un contexte d’injection (évite le warning AngularFire)
    runInInjectionContext(this.env, () => {
      onAuthStateChanged(this.afAuth, (user) => {
        this.isLoggedIn = !!user;
        if (user) {
          // Si on a un nom d’affichage, le stocker (localStorage) pour l’utiliser dans le lobby
          const dn = this.form.get('displayName')!.value?.trim();
          if (dn) localStorage.setItem('displayName', dn);
          this.router.navigate(['/lobby']);
        }
      });
    });

    // Préremplir le champ si présent
    const saved = localStorage.getItem('displayName');
    if (saved) this.form.patchValue({ displayName: saved });
  }

  async loginAnon(): Promise<void> {
    this.error = ''; this.hint = ''; this.loading = true;
    try {
      // Enregistrer le displayName côté client (utile pour préremplir dans le lobby)
      const dn = this.form.get('displayName')!.value?.trim();
      if (dn) localStorage.setItem('displayName', dn);

      // Connexion anonyme
      await signInAnonymously(this.afAuth);
      this.snack.open('Connecté en anonyme', 'OK', { duration: 2000 });
      // La redirection se fait dans onAuthStateChanged
    } catch (e: any) {
      const code = e?.code || '';
      if (code === 'auth/admin-restricted-operation') {
        this.error = 'Connexion refusée (admin-restricted-operation).';
        this.hint =
          'Active “Anonymous” dans Firebase Console → Authentication → Sign-in method, et ajoute “localhost” dans Authorized domains.';
      } else {
        this.error = e?.message || 'Erreur d’authentification.';
      }
    } finally {
      this.loading = false;
    }
  }

  async logout(): Promise<void> {
    this.error = ''; this.hint = ''; this.loading = true;
    try {
      await signOut(this.afAuth);
      this.isLoggedIn = false;
      this.snack.open('Déconnecté', 'OK', { duration: 1500 });
    } catch (e: any) {
      this.error = e?.message || 'Erreur de déconnexion.';
    } finally {
      this.loading = false;
    }
  }
}
