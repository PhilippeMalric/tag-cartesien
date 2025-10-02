// room.imports.ts

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';

// --- Angular core (séparer les types purs) ---
export {
  Component, ChangeDetectionStrategy, inject, Input,
  EnvironmentInjector, runInInjectionContext, ChangeDetectorRef, NgZone, DestroyRef
} from '@angular/core';
export type { OnInit, OnDestroy } from '@angular/core';

// --- Router ---
export { Router, ActivatedRoute } from '@angular/router';

// --- Common ---
export { AsyncPipe, CommonModule } from '@angular/common';

// --- RxJS (valeurs, OK) ---
export { Observable, Subscription, combineLatest, of, Subject, firstValueFrom } from 'rxjs';
export { map, filter, take, shareReplay, debounceTime, distinctUntilChanged, switchMap, startWith } from 'rxjs/operators';

// --- Interop ---
export { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// --- Material ---
export { MatToolbarModule } from '@angular/material/toolbar';
export { MatButtonModule } from '@angular/material/button';
export { MatIconModule } from '@angular/material/icon';
export { MatCardModule } from '@angular/material/card';
export { MatListModule } from '@angular/material/list';
export { MatProgressBarModule } from '@angular/material/progress-bar';
export { MatTooltipModule } from '@angular/material/tooltip';
export { MatMenuModule } from '@angular/material/menu';
export { MatSelectModule } from '@angular/material/select';
export { MatDividerModule } from '@angular/material/divider';
export { MatSnackBar } from '@angular/material/snack-bar';
export { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Regroupement pratique pour @Component.imports
export const MAT = [
  MatToolbarModule,
  MatButtonModule,
  MatIconModule,
  MatCardModule,
  MatListModule,
  MatProgressBarModule,
  MatTooltipModule,
  MatMenuModule,
  MatSelectModule,
  MatDividerModule,
  MatProgressSpinnerModule,
] as const;

// --- Firebase Auth (valeurs) ---
export { Auth as FirebaseAuth, signInAnonymously, authState } from '@angular/fire/auth';

// --- Modèles & services app ---
// ⚠️ Interfaces / type alias => 'export type'
export type { Player } from './player.model';
export { RoomService } from './room.service';
export type { Role } from './room.service';
export type { RoomDoc } from '../../models/room.model';

// --- UI (valeurs) ---
export { MapPickerComponent } from './ui/map-picker.component';

// --- Services/Utils (valeurs) ---
export { SpawnCoordService } from '../../services/spawn-coord.service';
export { OwnerActionsService } from './owner-actions.service';
export { RoomLogger } from './room-logger';
export { inZone } from './in-zone.operator';
