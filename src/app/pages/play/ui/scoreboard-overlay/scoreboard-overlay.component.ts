import {Component, Input, OnInit, inject} from '@angular/core';
import {AsyncPipe, NgForOf, NgIf} from '@angular/common';
import {
  PlayerVM,
  ScoreboardAdapterService,
} from './scoreboard-adapter.service';

@Component({
  selector: 'app-scoreboard-overlay',
  standalone: true,
  imports: [AsyncPipe, NgForOf, NgIf],
  templateUrl: './scoreboard-overlay.component.html',
  styleUrls: ['./scoreboard-overlay.component.scss'],
})
export class ScoreboardOverlayComponent implements OnInit {
  @Input({required: true}) roomId!: string;

  private adapter = inject(ScoreboardAdapterService);

  vm$ = this.adapter.vm$(this.roomId);

  ngOnInit(): void {
    this.vm$ = this.adapter.vm$(this.roomId);
  }

  trackByUid = (_: number, p: PlayerVM) => p.uid;
}
