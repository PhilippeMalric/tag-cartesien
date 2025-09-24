// src/app/pages/play/ui/scoreboard-overlay/scoreboard-overlay.component.ts
import { Component, Input, OnInit, inject } from '@angular/core';
import { AsyncPipe, NgForOf, NgIf } from '@angular/common';
import {
  ScoreboardAdapterService,
} from './scoreboard-adapter.service';
import { Observable } from 'rxjs';

type HeaderVM = { mode: string; targetScore?: number; playersCount: number };

@Component({
  selector: 'app-scoreboard-overlay',
  standalone: true,
  imports: [AsyncPipe, NgForOf, NgIf],
  templateUrl: './scoreboard-overlay.component.html',
  styleUrls: ['./scoreboard-overlay.component.scss'],
})
export class ScoreboardOverlayComponent implements OnInit {
  @Input({ required: true }) roomId!: string;

  private adapter = inject(ScoreboardAdapterService);

  // ✅ Ces deux propriétés sont nécessaires pour le template
  vm$!: Observable<import('./scoreboard-adapter.service').PlayerVM[]>;
  header$!: Observable<HeaderVM>;

  ngOnInit(): void {
    this.vm$ = this.adapter.vm$(this.roomId);
    this.header$ = this.adapter.header$(this.roomId);
  }

  trackByUid = (_: number, p: { uid: string }) => p.uid;
}
