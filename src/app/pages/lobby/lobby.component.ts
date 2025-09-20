import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    FormsModule, AsyncPipe,
    MatToolbarModule, MatCardModule, MatButtonModule, MatIconModule,
    MatListModule, MatProgressBarModule, MatFormFieldModule, MatInputModule,
    MatTooltipModule, MatDividerModule, RelativeTimePipe,  MatChipsModule, MatBadgeModule, CommonModule,
    MatIconModule 
  ],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss'],
})
export class LobbyComponent implements OnInit {
  readonly theme = inject(ThemeService);
  private facade = inject(LobbyFacade);

  // ⚠️ On expose la même API que l’ancien composant pour ne pas toucher au HTML

  // flags/options
  get showDevCleanup() { return this.facade.showDevCleanup; }
  cleaning = () => this.facade.cleaning();
  deletingId = () => this.facade.deletingId();
  get loading() { return this.facade.loading(); }
  get rooms$(): Observable<RoomVM[]> { return this.facade.rooms$; }

  // champs liés au template ([(ngModel)])
  get displayName() { return this.facade.displayName; }
  set displayName(v: string) { this.facade.displayName = v; }

  get joinCode() { return this.facade.joinCode; }
  set joinCode(v: string) { this.facade.joinCode = v; }



  ngOnInit(): void {
    this.facade.init();
  }

  // méthodes appelées par le template
  refresh() { this.facade.refresh(); }
  createRoom() { this.facade.createRoom(); }
  onJoinCodeInput(v: string) { this.facade.onJoinCodeInput(v); }
  quickJoin() { this.facade.quickJoin(); }
  join(r: RoomVM) { this.facade.join(r); }
  cleanLobby() { 
   // console.log("cleanLobby!");
    
    this.facade.cleanLobby(); }
  onDeleteRoom(roomId: string) { this.facade.deleteRoom(roomId); }
}
