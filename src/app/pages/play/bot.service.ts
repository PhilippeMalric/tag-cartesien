// src/app/pages/play/bot.service.ts
import { Injectable, inject } from '@angular/core';
import { Database, ref, set, onDisconnect, onValue, update, push, get } from '@angular/fire/database';

export type BotState = {
  id: string;           // ⚠️ on stocke ici la push key RTDB (ex: "-OcAbc...")
  x: number; y: number;
  vx: number; vy: number;
};

function rnd(min: number, max: number) { return Math.random() * (max - min) + min; }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }



@Injectable({ providedIn: 'root' })
export class BotService {
  private db = inject(Database);

  private timers = new Map<string, any>(); // key: `${matchId}:${rtdbKey}`
  private states = new Map<string, BotState>(); // idem

  /** Crée N bots (OWNER) — RTDB key = push key; FS uid = `bot-<pushKey>` */
  async spawn(matchId: string, count = 3) {
    for (let i = 0; i < count; i++) {
      const botsRef = ref(this.db, `bots/${matchId}`);
      const newRef = push(botsRef);           // ← push key (ex: "-OcAbc...")
      const rtdbKey = newRef.key!;

      const st: BotState = {
        id: rtdbKey,                          // ← on garde la push key comme id local
        x: rnd(-40, 40),
        y: rnd(-40, 40),
        vx: rnd(-1, 1),
        vy: rnd(-1, 1),
      };
      this.normalizeDir(st);
      this.states.set(this.key(matchId, rtdbKey), st);

      await set(newRef, { x: st.x, y: st.y, t: Date.now(), name: 'Bot' }).catch(() => {});
      try { onDisconnect(newRef).remove(); } catch {}

      const h = setInterval(() => this.step(matchId, rtdbKey), 100);
      this.timers.set(this.key(matchId, rtdbKey), h);
    }
  }

  /** Adopte les bots déjà présents (OWNER) */
  adoptExistingBots(matchId: string) {
    const botsRef = ref(this.db, `bots/${matchId}`);
    onValue(botsRef, (snap) => {
      const val = (snap.val() ?? {}) as Record<string, any>;

      // Démarrer un timer pour chaque bot présent en RTDB
      for (const [rtdbKey, b] of Object.entries(val)) {
        const k = this.key(matchId, rtdbKey);
        if (this.timers.has(k)) continue;

        const st: BotState = {
          id: rtdbKey,
          x: (typeof b?.x === 'number') ? b.x : rnd(-40, 40),
          y: (typeof b?.y === 'number') ? b.y : rnd(-40, 40),
          vx: rnd(-1, 1),
          vy: rnd(-1, 1),
        };
        this.normalizeDir(st);
        this.states.set(k, st);

        const h = setInterval(() => this.step(matchId, rtdbKey), 100);
        this.timers.set(k, h);
      }

      // Nettoyer les timers/états des bots disparus
      for (const k of Array.from(this.timers.keys())) {
        if (!k.startsWith(matchId + ':')) continue;
        const rtdbKey = k.split(':')[1];
        if (!val[rtdbKey]) {
          clearInterval(this.timers.get(k));
          this.timers.delete(k);
          this.states.delete(k);
        }
      }
    });
  }

  /** Stoppe tous les bots du match (OWNER) */
  stopAll(matchId: string) {
    for (const key of Array.from(this.timers.keys())) {
      if (!key.startsWith(matchId + ':')) continue;
      clearInterval(this.timers.get(key));
      this.timers.delete(key);
      const rtdbKey = key.split(':')[1];
      set(ref(this.db, `bots/${matchId}/${rtdbKey}`), null).catch(() => {});
      this.states.delete(key);
    }
  }

  /** Téléportation sûre (accepte `bot-<pushKey>` ou `<pushKey>`) */
  async teleportToRandom(matchId: string, botId: string, nearX?: number, nearY?: number) {
    const rtdbKey = botId;
    const { x, y } = this.pickRespawnNear(nearX, nearY);

    // MAJ de l’état local si on anime ce bot
    const localKey = this.key(matchId, rtdbKey);
    const st = this.states.get(localKey);
    if (st) { st.x = x; st.y = y; this.states.set(localKey, st); }

    await update(ref(this.db, `bots/${matchId}/${rtdbKey}`), {
      x, y, t: Date.now(),
    });
  }

  // === internals ===
  private step(matchId: string, rtdbKey: string) {
    const k = this.key(matchId, rtdbKey);
    const st = this.states.get(k);
    if (!st) return;

    if (Math.random() < 0.15) {
      st.vx += rnd(-0.5, 0.5);
      st.vy += rnd(-0.5, 0.5);
      this.normalizeDir(st);
    }

    const SPEED = 1.5;
    st.x = clamp(st.x + st.vx * SPEED, -50, 50);
    st.y = clamp(st.y + st.vy * SPEED, -50, 50);
    if (Math.abs(st.x) >= 50) st.vx *= -1;
    if (Math.abs(st.y) >= 50) st.vy *= -1;

    set(ref(this.db, `bots/${matchId}/${rtdbKey}`), {
      x: st.x, y: st.y, t: Date.now(), name: 'Bot',
    }).catch(() => {});
  }

  private key(matchId: string, rtdbKey: string) { return `${matchId}:${rtdbKey}`; }
  private normalizeDir(st: BotState) { const n = Math.hypot(st.vx, st.vy) || 1; st.vx/=n; st.vy/=n; }

  private pickRespawnNear(nx?: number, ny?: number) {
    const WORLD = { minX: -50, maxX: 50, minY: -50, maxY: 50 };
    const r = (a: number, b: number) => Math.floor(Math.random()*(b-a+1))+a;
    let x = r(WORLD.minX, WORLD.maxX), y = r(WORLD.minY, WORLD.maxY);
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      const dx = x - (nx as number), dy = y - (ny as number);
      if (Math.hypot(dx, dy) < 5) { x = Math.min(WORLD.maxX, x + 7); y = Math.min(WORLD.maxY, y + 7); }
    }
    return { x, y };
  }
}
