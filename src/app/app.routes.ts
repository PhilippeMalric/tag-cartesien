// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { Score } from './pages/score/score';

export const routes: Routes = [
  { path: 'auth', loadComponent: () => import('./pages/auth/auth.component').then(m => m.AuthComponent) },
   { path: 'lobby', loadComponent: () => import('./pages/lobby/lobby.component').then(m => m.LobbyComponent) },
  { path: 'room/:id', loadComponent: () => import('./pages/room/room.component').then(m => m.RoomComponent) },
   { path: 'play/:matchId', loadComponent: () =>
      import('./pages/play/play.component').then(m => m.PlayComponent) },
  { path: 'score/:matchId', component: Score },
  { path: '', pathMatch: 'full', redirectTo: 'auth' },
  { path: '**', redirectTo: 'auth' },
];
