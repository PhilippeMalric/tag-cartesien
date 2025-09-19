import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private snack = inject(MatSnackBar);
  toast(message: string, duration = 2000) {
    try { this.snack.open(message, 'OK', { duration, horizontalPosition: 'center', verticalPosition: 'bottom' }); }
    catch { console.log('[toast]', message); }
  }
}
