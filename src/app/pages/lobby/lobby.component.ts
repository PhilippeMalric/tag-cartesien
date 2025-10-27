import { Component, OnInit, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AsyncPipe, CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

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
import { MatRippleModule } from '@angular/material/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { ThemeService } from 'src/app/core/theme.service';
import { NameDialogComponent, NameDialogData, NameDialogResult } from './name-dialog.component';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    CommonModule, FormsModule, AsyncPipe,
    MatToolbarModule, MatCardModule, MatButtonModule, MatIconModule,
    MatListModule, MatProgressBarModule, MatFormFieldModule, MatInputModule,
    MatTooltipModule, MatDividerModule, RelativeTimePipe, MatChipsModule, MatBadgeModule,
    MatSnackBarModule, MatRippleModule, MatDialogModule
  ],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss'],
})
export class LobbyComponent implements OnInit {
  readonly theme = inject(ThemeService);
  readonly dialog = inject(MatDialog);
  facade = inject(LobbyFacade);

  icon = computed(() => this.theme.theme() === 'dark' ? 'light_mode' : 'dark_mode');
  ariaLabel = computed(() => this.theme.theme() === 'dark'
    ? 'Activer le thème clair'
    : 'Activer le thème sombre');

  // === API exposée au template ===
  get showDevCleanup() { return this.facade.showDevCleanup; }
  cleaning = () => this.facade.cleaning();
  deletingId = () => this.facade.deletingId();
  get loading() { return this.facade.loading(); }
  get rooms$(): Observable<RoomVM[]> { return this.facade.rooms$; }

  // Champs liés au template
  get displayName() { return this.facade.displayName; }
  set displayName(v: string) { this.facade.displayName = v; }

  get joinCode() { return this.facade.joinCode; }
  set joinCode(v: string) { this.facade.joinCode = v; }

  /** Nom affiché dans la toolbar (fallback sobre) */
  toolbarName() {
    const n = this.displayName?.trim();
    return n && n.length > 0 ? n : 'Sans nom';
  }

  ngOnInit(): void {
    this.facade.init();
  }

  toggleTheme() { this.theme.toggle(); }

  // Méthodes appelées par le template
  refresh() { this.facade.refresh(); }
  createRoom() { this.facade.createRoom(); }
  onJoinCodeInput(v: string) { this.facade.onJoinCodeInput(v); }
  quickJoin() { this.facade.quickJoin(); }
  join(r: RoomVM) { this.facade.join(r); }
  cleanLobby() { this.facade.cleanLobby(); }
  onDeleteRoom(roomId: string) { this.facade.deleteRoom(roomId); }

  /** Ouvre le dialog pour modifier le nom d’affichage */
  openNameDialog() {
    const data: NameDialogData = {
      initialName: this.displayName ?? '',
      maxLength: 24,
      title: 'Nom d’affichage',
      placeholder: 'Ton nom',
    };

    const ref = this.dialog.open<NameDialogComponent, NameDialogData, NameDialogResult>(NameDialogComponent, {
      data,
      width: '420px',
      autoFocus: true,
      restoreFocus: true,
      disableClose: true,
    });

    ref.afterClosed().subscribe(async (result) => {
      if (!result || result.action !== 'save') return;

      const name = (result.value ?? '').trim();
      if (name === (this.displayName ?? '')) return;

      this.displayName = name;
      await this.facade.saveDisplayName(name);
    });
  }
}
