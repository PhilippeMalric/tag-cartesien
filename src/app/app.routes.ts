// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { waitForAuthGuard } from './guards/wait-for-auth.guard';
import { EndScoreComponent } from './pages/end-score/end-score.component';

export const routes: Routes = [
  { path: 'auth', loadComponent: () => import('./pages/auth/auth.component').then(m => m.AuthComponent) },
   { path: 'lobby', loadComponent: () => import('./pages/lobby/lobby.component').then(m => m.LobbyComponent),
      canActivate: [waitForAuthGuard]
    },
  { path: 'room/:id', loadComponent: () => import('./pages/room/room.component').then(m => m.RoomComponent) },
   { path: 'play/:matchId', loadComponent: () =>
      import('./pages/play/play.component').then(m => m.PlayComponent) },
  { path: 'score/:matchId', component: EndScoreComponent },
  { path: '', pathMatch: 'full', redirectTo: 'auth' },
  { path: '**', redirectTo: 'auth' },

];
