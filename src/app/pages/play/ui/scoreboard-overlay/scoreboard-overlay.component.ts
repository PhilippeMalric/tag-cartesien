import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { Observable } from 'rxjs';
import { ScoreboardAdapterService, PlayerVM } from './scoreboard-adapter.service';

@Component({
  selector: 'app-scoreboard-overlay',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatTooltipModule, MatDividerModule, MatChipsModule],
  templateUrl: './scoreboard-overlay.component.html',
  styleUrls: ['./scoreboard-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreboardOverlayComponent {
  @Input() collapsed = false;
  private adapter = inject(ScoreboardAdapterService);

  vm$: Observable<PlayerVM[]> = this.adapter.vm$;

  toggle() {
    this.collapsed = !this.collapsed;
  }

  trackByUid = (_: number, r: PlayerVM) => r.uid;
}
