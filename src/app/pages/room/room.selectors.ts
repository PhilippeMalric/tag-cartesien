import type { Player } from './player.model';
import type { RoomDoc } from '@tag/types';
import { toRoleMap } from './role-mapper.util';

export const byUid = (a: any, b: any) => (a?.uid || '').localeCompare(b?.uid || '');

export function shallowEqPlayers(a: Player[] = [], b: Player[] = []) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i], pb = b[i];
    if (pa.uid !== pb.uid || pa.ready !== pb.ready || pa.role !== pb.role || pa.displayName !== pb.displayName) {
      return false;
    }
  }
  return true;
}

export function shallowEqRoom(a: RoomDoc | null, b: RoomDoc | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  // Compare seulement ce qu’on consomme ici
  const keysA = Object.keys(toRoleMap(a.roles)).join('|');
  const keysB = Object.keys(toRoleMap(b.roles)).join('|');
  return a.state === b.state && a.mode === b.mode && a.ownerUid === b.ownerUid && keysA === keysB;
}
