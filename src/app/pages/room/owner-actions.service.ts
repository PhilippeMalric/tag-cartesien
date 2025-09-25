import { Injectable, inject } from '@angular/core';
import { RoomService } from './room.service';

type HunterScope = 'all' | 'ready';
type RoleFR = 'chasseur' | 'chassé';

type PlayerLite = {
  uid: string;
  displayName?: string;
  ready?: boolean;
  role?: RoleFR | null;
};

@Injectable({ providedIn: 'root' })
export class OwnerActionsService {
  private readonly roomSvc = inject(RoomService);

  /** Filtre utilitaire: enlève les joueurs sans uid ou les bots */
  private sanitizePlayers(arr: PlayerLite[] | null | undefined): PlayerLite[] {
    return (arr ?? []).filter(p => !!p?.uid && !String(p.uid).startsWith('bot-'));
  }

  /** Tire un chasseur et applique les rôles côté Firestore (un seul chasseur) */
  async applyRandomHunter(
    roomId: string,
    players: PlayerLite[],
    scope: HunterScope
  ): Promise<{ uid: string; displayName?: string }> {
    const all = this.sanitizePlayers(players);
    const ready = all.filter(p => !!p.ready);
    const pool = scope === 'ready' ? (ready.length ? ready : all) : all;

    if (!pool.length) throw new Error('Aucun joueur éligible au tirage.');

    const idx = Math.floor(Math.random() * pool.length);
    const hunterUid = pool[idx].uid;

    // Construit une affectation mono-chasseur
    const roles: Record<string, RoleFR> = {};
    for (const p of all) roles[p.uid] = p.uid === hunterUid ? 'chasseur' : 'chassé';

    // Écritures
    await this.roomSvc.setRoles(roomId, roles);
    // (optionnel) garder hunterUid synchro si tu utilises encore ce champ
    if ((this.roomSvc as any).setHunter) {
      await (this.roomSvc as any).setHunter(roomId, hunterUid, false);
    }

    return { uid: hunterUid, displayName: pool[idx].displayName };
  }

  /**
   * Toggle chasseur (mono-chasseur) :
   * - si target est déjà chasseur → on rend le rôle de chasseur au owner
   * - sinon → target devient le seul chasseur
   */
  async toggleHunter(
    roomId: string,
    ownerUid: string,
    targetUid: string,
    isCurrentlyHunter: boolean,
    getAllPlayers: () => Promise<PlayerLite[]>
  ): Promise<string> {
    const all = this.sanitizePlayers(await getAllPlayers());
    if (!all.length) throw new Error('Aucun joueur');

    const nextHunter = isCurrentlyHunter ? ownerUid : targetUid;

    // Affectation mono-chasseur
    const roles: Record<string, RoleFR> = {};
    for (const p of all) roles[p.uid] = p.uid === nextHunter ? 'chasseur' : 'chassé';

    await this.roomSvc.setRoles(roomId, roles);
    // (optionnel) synchroniser hunterUid
    if ((this.roomSvc as any).setHunter) {
      await (this.roomSvc as any).setHunter(roomId, nextHunter, false);
    }

    return nextHunter;
  }

  /**
   * Multi-chasseurs: toggle le rôle de `targetUid`.
   * Contrainte: ≥1 chasseur ET ≥1 chassé après l’opération.
   * - Si target est chasseur → on le rend chassé SI >= 1 autre chasseur reste.
   * - Si target est chassé → on le rend chasseur SI >= 1 autre chassé reste.
   * Écrit uniquement la clé touchée: roles.<targetUid>
   */
  async toggleHunterMulti(
    roomId: string,
    targetUid: string,
    isCurrentlyHunter: boolean,
    getAllPlayers: () => Promise<PlayerLite[]>,
    getCurrentRoles: () => Promise<Record<string, RoleFR> | null>
  ): Promise<RoleFR> {
    const players = this.sanitizePlayers(await getAllPlayers());
    if (!players.length) throw new Error('Aucun joueur');

    // Rôles actuels (par défaut 'chassé' si absent)
    const rolesMap = { ...(await getCurrentRoles() || {}) } as Record<string, RoleFR>;
    for (const p of players) if (!rolesMap[p.uid]) rolesMap[p.uid] = 'chassé';

    const countHunters = Object.values(rolesMap).filter(r => r === 'chasseur').length;
    const countRunners = players.length - countHunters;

    const nextRole: RoleFR = isCurrentlyHunter ? 'chassé' : 'chasseur';
    if (nextRole === 'chassé' && countHunters <= 1) {
      throw new Error('Il doit rester au moins un chasseur.');
    }
    if (nextRole === 'chasseur' && countRunners <= 1) {
      throw new Error('Il doit rester au moins un chassé.');
    }

    await this.roomSvc.setRole(roomId, targetUid, nextRole);
    return nextRole;
  }
}
