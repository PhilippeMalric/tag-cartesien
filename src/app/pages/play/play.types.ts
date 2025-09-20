import { ElementRef, ChangeDetectorRef, EnvironmentInjector, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Auth as FirebaseAuth } from '@angular/fire/auth';

import { PositionsService } from './positions.service';
import { MatchService } from './match.service';
import { RoomService } from '../room/room.service';
import { BotService } from './bot.service';

import { Pos } from './play.models';
import { PlayRenderer } from './play.renderer';
import { SpawnCoordService } from '../../services/spawn-coord.service';
import { Subscription } from 'rxjs';

export type RecentTag = { label: string; until: number };

export interface PlayCtx {
  // DI/système
  env: EnvironmentInjector;
  router: Router;
  route: ActivatedRoute;
  auth: FirebaseAuth;
  cd: ChangeDetectorRef;
  zone: NgZone;

  positions: PositionsService;
  match: MatchService;
  roomSvc: RoomService;
  bots: BotService;

  // Vue / canvas
  canvasRef: ElementRef<HTMLCanvasElement>;
  renderer: PlayRenderer;

  // État exposé au template (garder ces noms !)
  matchId: string;
  uid: string;
  role: 'chasseur' | 'chassé' | null;
  myScore: number;
  targetScore: number;
  timeLeft: number;
  recentTag: RecentTag | null;
  moveProgress: number;
  debug: { uid: string; match: string; posUids: string[] };

  // État interne nécessaire au moteur
  roomOwnerUid: string | null;
  hunterUid: string | null;
  me: Pos;
  keys: Set<string>;
  others: Map<string, Pos>;
  lastMoveAt: number;
  lastTagMs: number;
  invulnerableUntil: number;

  // Pour auto-spawn bots (owner only)
  desiredBots?: number;

  spawnSvc: SpawnCoordService;
  sub:Subscription
}
