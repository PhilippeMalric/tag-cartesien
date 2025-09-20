import {
  Component, ElementRef, ViewChild, inject,
  OnInit, OnDestroy, ChangeDetectionStrategy,
  ChangeDetectorRef, EnvironmentInjector, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth as FirebaseAuth } from '@angular/fire/auth';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule }  from '@angular/material/button';
import { MatIconModule }    from '@angular/material/icon';
import { MatChipsModule }   from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

// Services & utils
import { ThemeService } from '../../services/theme.service';
import { PositionsService } from './positions.service';
import { MatchService } from './match.service';
import { RoomService } from '../room/room.service';
import { BotService } from './bot.service';
import { PlayRenderer } from './play.renderer';
import { Pos } from './play.models';
import { setupPlay } from './play.setup';
import type { RecentTag } from './play.types';
import { ScoreboardOverlayComponent } from './ui/scoreboard-overlay/scoreboard-overlay.component';
import { MobileDpadComponent } from './ui/mobile-dpad.component';

import { DragDropModule } from '@angular/cdk/drag-drop';
import { SpawnCoordService } from '../../services/spawn-coord.service';

@Component({
  selector: 'app-play',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatProgressBarModule, MatTooltipModule,
    ScoreboardOverlayComponent, MobileDpadComponent, DragDropModule
  ],
  styleUrls: ['./play.component.scss'],
  templateUrl: './play.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  // Services (publics pour le setup)
  readonly theme = inject(ThemeService);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly auth = inject(FirebaseAuth);
  readonly cd = inject(ChangeDetectorRef);
  readonly env = inject(EnvironmentInjector);
  readonly zone = inject(NgZone);

  readonly positions = inject(PositionsService);
  readonly match = inject(MatchService);
  readonly roomSvc = inject(RoomService);
  readonly bots = inject(BotService);
  // Canvas renderer
  readonly renderer = new PlayRenderer();

  // Spawn partagé (utilisé pour lecture éventuelle du point choisi dans la room)
  readonly spawnSvc = inject(SpawnCoordService);

  // Exposés au template
  matchId = '';
  uid = '';
  role: 'chasseur' | 'chassé' | null = null;
  myScore = 0;
  targetScore = 0;
  timeLeft = 0;
  recentTag: RecentTag | null = null;
  moveProgress = 100;
  debug = { uid: '', match: '', posUids: [] as string[] };

  // Internes utilisés par le moteur
  roomOwnerUid: string | null = null;
  hunterUid: string | null = null;
  me: Pos = { x: 0, y: 0 };
  keys = new Set<string>();
  others = new Map<string, Pos>();
  lastMoveAt = 0;
  lastTagMs = 0;
  invulnerableUntil = 0;

  // Option auto-bots (?bots=N)
  desiredBots = 0;
  sub: any;

roomMode: 'classic'|'transmission' = 'classic';

  // Getters utilisés par le template
  get showRecentTag(): boolean { return !!this.recentTag && this.recentTag.until > Date.now(); }
  get isOwnerNow(): boolean { return !!this.uid && !!this.roomOwnerUid && this.uid === this.roomOwnerUid; }

  private dispose: (() => void) | null = null;

  ngOnInit(): void {
    // Route / matchId / uid initial
    this.matchId = this.route.snapshot.paramMap.get('matchId')
                || this.route.snapshot.paramMap.get('id') || '';
    this.uid = this.auth.currentUser?.uid || '';
    this.debug.uid = this.uid;
    this.debug.match = this.matchId;

    // Lire ?bots=N
    const n = parseInt(new URLSearchParams(location.search).get('bots') || '', 10);
    this.desiredBots = Number.isFinite(n) && n > 0 ? Math.min(n, 12) : 0;

    // (Optionnel) on initialise "me" avec le point de spawn choisi dans la room.
    // Le setupPlay peut décider d'utiliser ce point si tu l’as câblé côté setup.
    const s = this.spawnSvc.xy();
    this.me = { x: s.x, y: s.y };

    // Démarre la logique runtime (auth+bootstrap+loop+subs)
    

    this.sub = this.match.room$(this.matchId).subscribe((room: any) => {
      if (!room) return;
      this.roomMode = (room.mode ?? 'classic');
      this.targetScore = room.targetScore ?? 0;
      this.cd.markForCheck();
    });
this.dispose = setupPlay(this);
  }


  
  // Contrôles bots (utilisés par les boutons de la toolbar)
  spawnBots(n = 3) { if (this.isOwnerNow) this.bots.spawn(this.matchId, n); }
  stopBots() { if (this.isOwnerNow) this.bots.stopAll(this.matchId); }

  // fonction appelée depuis le dpad
  async onDpadMove(dir: 'up'|'down'|'left'|'right') {
    setTimeout(() => { this.onDpadRelease(dir); }, 100);
    switch (dir) {
      case 'up':    this.keys.add('w'); break;
      case 'down':  this.keys.add('s'); break;
      case 'left':  this.keys.add('a'); break;
      case 'right': this.keys.add('d'); break;
    }
  }
  // fonction appelée depuis le dpad
  async onDpadRelease(dir: 'up'|'down'|'left'|'right') {
    switch (dir) {
      case 'up':    this.keys.delete('w'); break;
      case 'down':  this.keys.delete('s'); break;
      case 'left':  this.keys.delete('a'); break;
      case 'right': this.keys.delete('d'); break;
    }
  }

  ngOnDestroy(): void {
    try { this.dispose?.(); } finally { this.dispose = null; }
  }
}
