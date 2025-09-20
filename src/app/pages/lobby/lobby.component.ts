import { Component, OnInit, inject, ViewChild, ElementRef } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AsyncPipe, CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

import { ThemeService } from '../../services/theme.service';
import { LobbyFacade } from './lobby.facade';
import { RoomVM } from './lobby.types';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, AsyncPipe,
    MatToolbarModule, MatCardModule, MatButtonModule, MatIconModule,
    MatListModule, MatProgressBarModule, MatFormFieldModule, MatInputModule,
    MatTooltipModule, MatDividerModule, RelativeTimePipe, MatChipsModule, MatBadgeModule,
    MatSnackBarModule,
  ],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss'],
})
export class LobbyComponent implements OnInit {
  readonly theme = inject(ThemeService);
  private facade = inject(LobbyFacade);

  // === API exposée au template (conservation de ton contrat) ===
  get showDevCleanup() { return this.facade.showDevCleanup; }
  cleaning = () => this.facade.cleaning();
  deletingId = () => this.facade.deletingId();
  get loading() { return this.facade.loading(); }
  get rooms$(): Observable<RoomVM[]> { return this.facade.rooms$; }

  // Champs liés au template ([(ngModel)])
  get displayName() { return this.facade.displayName; }
  set displayName(v: string) { this.facade.displayName = v; }

  get joinCode() { return this.facade.joinCode; }
  set joinCode(v: string) { this.facade.joinCode = v; }

  // === Édition inline du nom ===
  editingName = false;
  nameCtrl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(24)],
  });
  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    this.facade.init();
    // Initialise le champ avec la valeur actuelle de la façade
    this.nameCtrl.setValue(this.displayName ?? '');
  }

  // Méthodes appelées par le template existant
  refresh() { this.facade.refresh(); }
  createRoom() { this.facade.createRoom(); }
  onJoinCodeInput(v: string) { this.facade.onJoinCodeInput(v); }
  quickJoin() { this.facade.quickJoin(); }
  join(r: RoomVM) { this.facade.join(r); }
  cleanLobby() { this.facade.cleanLobby(); }
  onDeleteRoom(roomId: string) { this.facade.deleteRoom(roomId); }

  // === Contrôles édition du nom ===
  startEditName() {
    this.editingName = true;
    queueMicrotask(() => this.nameInput?.nativeElement?.focus());
  }

  async commitName() {
    if (this.nameCtrl.invalid) { this.editingName = false; return; }
    const name = this.nameCtrl.value.trim();
    if (name === (this.displayName ?? '')) { this.editingName = false; return; }

    // Mets à jour la façade (setter existant) puis sauvegarde distante
    this.displayName = name;
    await this.facade.saveDisplayName(name);

    this.editingName = false;
  }
}
