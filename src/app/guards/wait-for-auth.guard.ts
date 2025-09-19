// wait-for-auth.guard.ts
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { authState } from 'rxfire/auth';
import { firstValueFrom } from 'rxjs';

export const waitForAuthGuard = async () => {
  const auth = inject(Auth);
  await firstValueFrom(authState(auth)); // attend un 1er état (user ou null)
  return true;
};
