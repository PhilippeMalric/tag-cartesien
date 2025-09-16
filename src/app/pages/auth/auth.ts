import { Component, EnvironmentInjector, OnInit, inject, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';


// ⚠️ Alias pour éviter toute collision de nom avec ta classe de composant
import {
  Auth as FirebaseAuth,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
} from '@angular/fire/auth';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="max-width:520px;margin:48px auto;padding:16px;border:1px solid #eee;border-radius:12px;">
      <h2 style="margin-top:0;">Bienvenue 👋</h2>
      <p>Ce jeu utilise l'authentification anonyme de Firebase.</p>

      <button (click)="login()" style="padding:8px 12px;">Connexion anonyme</button>
      <button (click)="logout()" style="padding:8px 12px;margin-left:8px;" *ngIf="isLoggedIn">Se déconnecter</button>

      <p *ngIf="error" style="color:#d32f2f;margin-top:12px;">{{ error }}</p>

      <div *ngIf="hint" style="margin-top:12px;font-size:.9em;opacity:.8;">
        {{ hint }}
      </div>
    </div>
  `,
})
export class Auth implements OnInit {
  private router = inject(Router);
  private afAuth = inject(FirebaseAuth);

  isLoggedIn = false;
  error = '';
  hint = '';
private env = inject(EnvironmentInjector);

  ngOnInit(): void {
    runInInjectionContext(this.env, () => {
      // Si déjà connecté, on file directement au lobby
      onAuthStateChanged(this.afAuth, (user) => {
        this.isLoggedIn = !!user;
        if (user) this.router.navigate(['/lobby']);
      });
    })
  }

  async login() {


    this.error = '';
    this.hint = '';
    try {
      await signInAnonymously(this.afAuth);
      this.router.navigate(['/lobby']);
    } catch (e: any) {
      const code = e?.code || '';
      if (code === 'auth/admin-restricted-operation') {
        this.error = 'Connexion refusée (admin-restricted-operation).';
        this.hint =
          'Active l’authentification anonyme dans Firebase Console → Authentication → Sign-in method → Anonymous (Enable) et assure-toi que "localhost" est dans Authorized domains.';
      } else {
        this.error = e?.message || 'Erreur d’authentification.';
      }
    }
  }

  async logout() {
    this.error = '';
    this.hint = '';
    try {
      await signOut(this.afAuth);
      this.isLoggedIn = false;
    } catch (e: any) {
      this.error = e?.message || 'Erreur de déconnexion.';
    }
  }
}
