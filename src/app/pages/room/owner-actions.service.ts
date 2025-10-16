// src/app/pages/room/owner-actions.service.ts
import { Injectable, inject } from '@angular/core';
import { RoomService } from './room.service';
import { PlayerVM } from './room.component';
import type { Role } from '@tag/types';

type HunterScope = 'all' | 'ready';
type RoleFR = 'hunter' | 'prey';



function toRoleMapFR(mapFR: Record<string, Role>): Record<string, Role> {
  const out: Record<string, Role> = {};
  for (const [uid, rfr] of Object.entries(mapFR)) out[uid] = rfr;
  return out;
}
// ------------------------------------------------------

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

    // Affectation mono-chasseur (FR)
    const rolesFR: Record<string, Role> = {};
    for (const p of all) rolesFR[p.uid] = p.uid === hunterUid ? 'hunter' : 'prey';

    // ✅ Convertit en Role partagé avant écriture
    await this.roomSvc.setRoles(roomId, toRoleMapFR(rolesFR));

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

    const rolesFR: Record<string, RoleFR> = {};
    for (const p of all) rolesFR[p.uid] = p.uid === nextHunter ? 'hunter' : 'prey';

    // ✅ converti en Role partagé
    await this.roomSvc.setRoles(roomId, toRoleMapFR(rolesFR));

    // (optionnel) synchroniser hunterUid
    if ((this.roomSvc as any).setHunter) {
      await (this.roomSvc as any).setHunter(roomId, nextHunter, false);
    }

    return nextHunter;
  }

  /**
   * Multi-chasseurs: toggle le rôle de `targetUid`.
   * Contrainte: ≥1 chasseur ET ≥1 chassé après l’opération.
   * - Si target est chasseur → on le rend chassé SI >= 1 autre chasseur humain reste.
   * - Si target est chassé → on le rend chasseur SI >= 1 autre chassé (humain ou bot) reste.
   * Écrit uniquement la clé touchée: roles.<targetUid>
   */
  // Multi-chasseurs permis (ne touche pas hunterUid)
  async toggleHunterMulti(
    roomId: string,
    targetUid: string,
    isCurrentlyHunter: boolean,
    getAllPlayers: () => Promise<PlayerVM[]>,
    getCurrentRoles: () => Promise<Record<string, RoleFR> | null>
  ): Promise<RoleFR> {
    // 1) Prépare les données & garde-fous (même logique que ta version)
    const players = this.sanitizePlayers(await getAllPlayers());
    if (!players.length) throw new Error('Aucun joueur');

    const rolesMap = { ...(await getCurrentRoles() || {}) } as Record<string, RoleFR>;
    for (const p of players) if (!rolesMap[p.uid]) rolesMap[p.uid] = 'prey';

    const humanUids = new Set(players.map(p => p.uid));
    const isHuman = (uid: string) => humanUids.has(uid);

    const countHumanHunters = Object.entries(rolesMap)
      .filter(([uid, r]) => isHuman(uid) && r === 'hunter').length;

    const countHumanRunners = Object.entries(rolesMap)
      .filter(([uid, r]) => isHuman(uid) && r === 'prey').length;

    const hasBotRunner = Object.entries(rolesMap)
      .some(([uid, r]) => !isHuman(uid) && r === 'prey');

    // Rôle cible (toggle)
    const nextRole: RoleFR = isCurrentlyHunter ? 'prey' : 'hunter';

    // 2) Règles: ≥1 chasseur humain ET ≥1 chassé (humain ou bot) après
    if (nextRole === 'prey' && isCurrentlyHunter && countHumanHunters <= 1) {
      throw new Error('Il doit rester au moins un chasseur (humain).');
    }
    if (nextRole === 'hunter') {
      const humanRunnersAfter = countHumanRunners - (isCurrentlyHunter ? 0 : 1);
      if (!hasBotRunner && humanRunnersAfter < 1) {
        throw new Error('Il doit rester au moins un chassé (humain ou bot).');
      }
    }

    // 3) ✅ Écriture transactionnelle (room + player) SANS mono-chasseur
    await this.roomSvc.setPlayerRole(roomId, targetUid, nextRole);
    // ^ cette méthode met à jour rooms.roles[targetUid] et le doc players/<uid> { role, updatedAt, ... } en 1 transaction. :contentReference[oaicite:1]{index=1}

    return nextRole;
  }

}
