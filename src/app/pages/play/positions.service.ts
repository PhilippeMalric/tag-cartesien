import { Injectable, inject } from '@angular/core';
import { Database, ref, set, onValue, off, onDisconnect } from '@angular/fire/database';
import { BehaviorSubject, combineLatest } from 'rxjs';

export type PosDTO = { x: number; y: number; t?: number; name?: string };

@Injectable({ providedIn: 'root' })
export class PositionsService {
  private db = inject(Database);

  private _players$ = new BehaviorSubject<Record<string, PosDTO>>({});
  private _bots$    = new BehaviorSubject<Record<string, PosDTO>>({});
  private _positions$ = new BehaviorSubject<Record<string, PosDTO>>({});
  readonly positions$ = this._positions$.asObservable();

  private listenRefPlayers: any = null;
  private listenRefBots: any = null;
  private cbPlayers: any = null;
  private cbBots: any = null;

  attachPresence(matchId: string, uid: string) {
    if (!matchId || !uid) return;
    const r = ref(this.db, `presence/${matchId}/${uid}`);
    set(r, true).catch(()=>{});
    try { onDisconnect(r).remove(); } catch {}
  }

  async writeSelf(matchId: string, uid: string, x: number, y: number) {
    if (!matchId || !uid) return;
    const r = ref(this.db, `positions/${matchId}/${uid}`);
    await set(r, { x, y, t: Date.now() });
  }

  startListening(matchId: string) {
    this.stop();
    if (!matchId) return;

    // Joueurs
    this.listenRefPlayers = ref(this.db, `positions/${matchId}`);
    this.cbPlayers = (snap: any) => {
      const val = (snap.val() || {}) as Record<string, PosDTO>;
      this._players$.next(val);
    };
    onValue(this.listenRefPlayers, this.cbPlayers);

    // Bots
    this.listenRefBots = ref(this.db, `bots/${matchId}`);
    this.cbBots = (snap: any) => {
      const val = (snap.val() || {}) as Record<string, PosDTO>;
      this._bots$.next(val);
    };
    onValue(this.listenRefBots, this.cbBots);

    // Fusion
    combineLatest([this._players$, this._bots$]).subscribe(([p, b]) => {
      // Préfixe les bots par "bot-" pour éviter collisions
      const merged: Record<string, PosDTO> = { ...p };
      for (const [id, pos] of Object.entries(b || {})) {
        merged[`bot-${id}`] = pos;
      }
      this._positions$.next(merged);
    });
  }

  stop() {
    if (this.listenRefPlayers && this.cbPlayers) off(this.listenRefPlayers, this.cbPlayers);
    if (this.listenRefBots && this.cbBots) off(this.listenRefBots, this.cbBots);
    this.listenRefPlayers = this.cbPlayers = this.listenRefBots = this.cbBots = null;
    this._players$.next({});
    this._bots$.next({});
    this._positions$.next({});
  }
}
