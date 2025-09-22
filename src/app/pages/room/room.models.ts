import { Player } from './player.model';
import { Role } from './room.service';

export type HunterScope = 'all' | 'ready';
export type PlayerVM = Player & { roleResolved: Role | null };
