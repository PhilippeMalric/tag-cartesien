import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface NameDialogData {
  initialName: string;
  maxLength: number;
  title?: string;
  placeholder?: string;
}

export interface NameDialogResult {
  action: 'save' | 'cancel';
  value?: string;
}

@Component({
  selector: 'app-name-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon fontSet="material-symbols-outlined" style="vertical-align: middle; margin-right: 6px;">person</mat-icon>
      {{ data.title || 'Nom d’affichage' }}
    </h2>

    <div mat-dialog-content class="content">
      <mat-form-field appearance="outline" class="w-100">
        <mat-label>{{ data.placeholder || 'Ton nom' }}</mat-label>
        <input
          matInput
          [formControl]="nameCtrl"
          [maxlength]="data.maxLength"
          (keydown.enter)="onSave()"
          autocomplete="off"
          cdkFocusInitial
        />
        <mat-hint align="end">{{ (nameCtrl.value?.length || 0) }} / {{ data.maxLength }}</mat-hint>

        @if (nameCtrl.invalid && (nameCtrl.dirty || nameCtrl.touched)) {
          <mat-error *ngIf="nameCtrl.hasError('required')">Le nom est requis</mat-error>
          <mat-error *ngIf="nameCtrl.hasError('maxlength')">Max {{ data.maxLength }} caractères</mat-error>
        }
      </mat-form-field>
    </div>

    <div mat-dialog-actions align="end" class="actions">
      <button mat-button (click)="onCancel()">Annuler</button>
      <button mat-flat-button color="primary" (click)="onSave()" [disabled]="nameCtrl.invalid">Enregistrer</button>
    </div>
  `,
  styles: [`
  :host { display: block; }
  /* ↑ évite tout collapse de marge */

  /* Ajoute de l’air en haut du contenu */
  .content { 
    min-width: 260px; 
    padding-top: 12px;      /* <-- clé */
  }

  .w-100 { width: 100%; margin-top: 6px; } /* petit décalage sûr du champ */
  .actions { gap: 8px; }
`]
})
export class NameDialogComponent {
  readonly data = inject<NameDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<NameDialogComponent, NameDialogResult>);

  nameCtrl = new FormControl<string>(this.data?.initialName ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(this.data?.maxLength ?? 24)],
  });

  onCancel() {
    this.ref.close({ action: 'cancel' });
  }

  onSave() {
    if (this.nameCtrl.invalid) return;
    const value = (this.nameCtrl.value || '').trim();
    this.ref.close({ action: 'save', value });
  }
}
