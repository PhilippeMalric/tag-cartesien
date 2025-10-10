import type { Player } from './player.model';
import type { Role } from '@tag/types';

export type HunterScope = 'all' | 'ready';
export type PlayerVM = Player & { roleResolved: Role | null };
