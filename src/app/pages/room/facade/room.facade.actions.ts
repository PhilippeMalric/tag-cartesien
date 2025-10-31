// FILE: src/app/pages/room/facade/room.facade.actions.ts
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Auth, signInAnonymously } from '@angular/fire/auth';

import type { Role, GameMode } from '@tag/types';
import { RoomFacadeState } from './room.facade.state';
import { RoomService } from '../room.service';
import { PositionsService } from '../../play';
import { Player, SpawnCoordService } from '../room.imports';
import { HunterScope } from '../room.models';

export class RoomFacadeActions {
  private readonly auth   = inject(Auth);
  private readonly snack  = inject(MatSnackBar);
  private readonly roomSvc = inject(RoomService);
  private readonly state   = inject(RoomFacadeState);
  private readonly positions = inject(PositionsService);
  readonly spawn = inject(SpawnCoordService);

  trackPlayer = (_: number, p: Player) => p.uid;

  onSpawnChange(xy: { x: number; y: number }) {
    this.spawn.set(xy);
    this.state.saveSpawn$.next(xy);
  }

  async ensureAuthAndPlayerDoc(roomId: string, displayNameFallback = 'Joueur') {
    if (!this.auth.currentUser) await signInAnonymously(this.auth);
    const uid = this.auth.currentUser!.uid;
    const displayName = this.auth.currentUser?.displayName || displayNameFallback;
    await this.roomSvc.ensureSelfPlayerDoc(roomId, uid, displayName);
    this.state.log(`FS ensureSelfPlayerDoc(${roomId}, ${uid})`);
    return uid;
  }

  async toggleReady() {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    const next = !this.state.myReady();
    try {
      await this.roomSvc.toggleReady(this.state.roomId, uid, next);
      this.state.log(`FS toggleReady(${next})`);
      this.state.myReady.set(next);
    } catch (e: any) {
      this.state.log(`toggleReady — ERREUR: ${e?.message || e}`);
    }
  }

  async start() {
    if (this.state.isStarting()) return;
    this.state.isStarting.set(true);
    try {
      await this.roomSvc.start(this.state.roomId);
      this.state.log('FS start() → state="running"');
    } catch (e: any) {
      this.state.log(`start() — ERREUR: ${e?.message || e}`);
    } finally {
      this.state.isStarting.set(false);
    }
  }

  async setMode(m: GameMode) {
    try {
      await this.roomSvc.setMode(this.state.roomId, m);
      this.state.mode.set(m);
      this.state.log(`FS setMode(${m})`);
    } catch (e: any) {
      this.state.log(`setMode — ERREUR: ${e?.message || e}`);
    }
  }

  async endNow() {
    try {
      await this.roomSvc.setState(this.state.roomId, 'ended');
      this.state.log('FS setState(ended)');
    } catch (e: any) {
      this.state.log(`endNow — ERREUR: ${e?.message || e}`);
    }
  }

  async pickHunter(scope: HunterScope): Promise<void> {
    if (this.state.pickingHunter()) return;
    this.state.pickingHunter.set(true);
    try {
      const picked = await this.chooseRandomHunter(scope);
      this.state.lastPickedHunter.set(picked || null);
      const name = picked?.displayName || picked?.uid || 'inconnu';
      this.snack.open(`Chasseur choisi : ${name}`, 'OK', { duration: 2500 });
    } catch (e: any) {
      this.snack.open(`Impossible de choisir le chasseur : ${e?.message || e}`, 'OK', { duration: 3500 });
    } finally {
      this.state.pickingHunter.set(false);
    }
  }

  async toggleHunter(targetUid: string, isCurrentlyHunter: boolean): Promise<Role> {
    const roomId = this.state.roomId;
    if (!roomId) throw new Error('Room non initialisée');

    const [room, players] = await Promise.all([
      firstValueFrom(this.state.room$.pipe(take(1))),
      firstValueFrom(this.state.players$.pipe(take(1))),
    ]);
    if (!room) throw new Error('Room introuvable');

    const humanUids = (players ?? [])
      .map(p => p.uid)
      .filter(uid => !!uid && !String(uid).startsWith('bot-'));

    if (!humanUids.includes(targetUid)) {
      throw new Error('Joueur cible introuvable (ou est un bot).');
    }

    const nextRoles: Record<string, Role> = {};
    if (isCurrentlyHunter) {
      for (const uid of humanUids) {
        if (uid === targetUid) { nextRoles[uid] = 'prey'; continue; }
        const current = (room.roles as Record<string, Role> | undefined)?.[uid];
        nextRoles[uid] = (current === 'hunter' || current === 'prey') ? current : 'prey';
      }
    } else {
      for (const uid of humanUids) {
        nextRoles[uid] = (uid === targetUid) ? 'hunter' : 'prey';
      }
    }

    await this.roomSvc.applyRoles(roomId, nextRoles);
    this.state.log(`Owner: toggle hunter → ${targetUid} = ${nextRoles[targetUid]}`);
    return nextRoles[targetUid];
  }

  // ---------- helpers privés ----------
  private async chooseRandomHunter(scope: HunterScope = 'all') {
    const list = await firstValueFrom(
      this.state.playersVM$.pipe(filter(arr => Array.isArray(arr) && arr.length > 0), take(1))
    );
    if (list === null) throw new Error('Liste de joueurs introuvable.');

    const allPlayers = list.filter(p => p?.uid && !String(p.uid).startsWith('bot-'));
    const readyPlayers = allPlayers.filter(p => !!p.ready);

    let pool = allPlayers;
    if (scope === 'ready') pool = readyPlayers.length ? readyPlayers : allPlayers;

    if (!pool.length) throw new Error('Aucun joueur éligible au tirage.');

    const idx = Math.floor(Math.random() * pool.length);
    const hunterUid = pool[idx].uid;

    const roles: Record<string, Role> = {};
    for (const p of allPlayers) {
      roles[p.uid] = p.uid === hunterUid ? 'hunter' : 'prey';
    }

    await this.roomSvc.applyRoles(this.state.roomId, roles);

    const chosen = pool[idx];
    return { uid: chosen.uid, displayName: chosen.displayName };
  }

  async getMyRoleOnce(uid: string): Promise<'hunter'|'prey'|undefined> {
    const players = await firstValueFrom(this.state.players$.pipe(filter(a=>Array.isArray(a)), take(1)));
    return players.find(p => p.uid === uid)?.role as any;
  }

  /** Spawn aléatoire (bornes simples, adapte si tu as des bornes de carte) */
  pickRandomSpawn(bounds = { minX: 0, maxX: 40, minY: 0, maxY: 28, margin: 1 }) {
    const m = bounds.margin ?? 0;
    const x0 = Math.ceil(Math.min(bounds.minX, bounds.maxX) + m);
    const x1 = Math.floor(Math.max(bounds.minX, bounds.maxX) - m);
    const y0 = Math.ceil(Math.min(bounds.minY, bounds.maxY) + m);
    const y1 = Math.floor(Math.max(bounds.minY, bounds.maxY) - m);
    const x = x0 + Math.floor(Math.random() * (x1 - x0 + 1));
    const y = y0 + Math.floor(Math.random() * (y1 - y0 + 1));
    return { x, y };
  }

  /** Écrit FS + RTDB + local */
  async applySpawn(x: number, y: number) {
    const uid = this.auth.currentUser?.uid; if (!uid) return;
    const role = await this.getMyRoleOnce(uid) ?? 'prey';
    await this.roomSvc.setMySpawn(this.state.roomId, uid, { x, y });      // FS
    await this.positions.writeSelf(this.state.roomId, uid, x, y, role);    // RTDB
    this.spawn.set({ x, y });
    this.state.log(`FS setMySpawn(${x},${y}) + RTDB positions`);
  }
}
