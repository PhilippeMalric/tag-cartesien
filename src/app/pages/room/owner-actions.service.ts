import { Injectable, inject } from '@angular/core';
import { RoomService } from './room.service';
import { PlayerVM } from './room.component';

type HunterScope = 'all' | 'ready';
type RoleFR = 'chasseur' | 'chassé';



@Injectable({ providedIn: 'root' })
export class OwnerActionsService {
  private readonly roomSvc = inject(RoomService);

  /** Filtre utilitaire: enlève les joueurs sans uid ou les bots */
  private sanitizePlayers(arr: PlayerVM[] | null | undefined): PlayerVM[] {
    return (arr ?? []).filter(p => !!p?.uid && !String(p.uid).startsWith('bot-'));
  }

  /** Tire un chasseur et applique les rôles côté Firestore (un seul chasseur) */
  async applyRandomHunter(
    roomId: string,
    players: PlayerVM[],
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
    getAllPlayers: () => Promise<PlayerVM[]>
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
    getAllPlayers: () => Promise<PlayerVM[]>,
    getCurrentRoles: () => Promise<Record<string, RoleFR> | null>
  ): Promise<RoleFR> {
    const players = this.sanitizePlayers(await getAllPlayers());
    if (!players.length) throw new Error('Aucun joueur');

    // Rôles actuels
    const rolesMap = { ...(await getCurrentRoles() || {}) } as Record<string, RoleFR>;

    // Par défaut, chaque humain sans entrée reçoit 'chassé'
    for (const p of players) if (!rolesMap[p.uid]) rolesMap[p.uid] = 'chassé';

    // Détermine humains/bots à partir des listes
    const humanUids = new Set(players.map(p => p.uid));
    const isHuman = (uid: string) => humanUids.has(uid);

    // Comptages utiles
    const countHumanHunters = Object.entries(rolesMap)
      .filter(([uid, r]) => isHuman(uid) && r === 'chasseur').length;

    const countHumanRunners = Object.entries(rolesMap)
      .filter(([uid, r]) => isHuman(uid) && r === 'chassé').length;

    const hasBotRunner = Object.entries(rolesMap)
      .some(([uid, r]) => !isHuman(uid) && r === 'chassé');

    // Rôle cible (toggle)
    const nextRole: RoleFR = isCurrentlyHunter ? 'chassé' : 'chasseur';

    // --- GARDE-FOUS ---
    // 1) Il doit rester au moins un chasseur (humain)
    //    → Si on bascule un chasseur vers chassé et qu'il était le seul chasseur humain, on bloque.
    if (nextRole === 'chassé' && isCurrentlyHunter && countHumanHunters <= 1) {
      throw new Error('Il doit rester au moins un chasseur (humain).');
    }

    // 2) Il doit rester au moins un chassé (humain OU bot).
    //    → On autorise 0 humain chassé s’il existe au moins un bot chassé.
    if (nextRole === 'chasseur') {
      // Si on promeut un humain actuellement chassé -> le nombre d'humains chassés diminue de 1
      const humanRunnersAfter = countHumanRunners - (isCurrentlyHunter ? 0 : 1);
      const thereWillBeAtLeastOneRunner = hasBotRunner || humanRunnersAfter >= 1;
      if (!thereWillBeAtLeastOneRunner) {
        throw new Error('Il doit rester au moins un chassé (humain ou bot).');
      }
    }

    await this.roomSvc.setRole(roomId, targetUid, nextRole);
    return nextRole;
  }
}
