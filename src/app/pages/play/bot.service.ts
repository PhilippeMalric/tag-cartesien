import { Injectable, inject } from '@angular/core';
import { Database, ref, set, onDisconnect } from '@angular/fire/database';

export type BotState = {
  id: string;
  x: number; y: number;
  vx: number; vy: number; // direction normalisée
};

function rnd(min: number, max: number) { return Math.random() * (max - min) + min; }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

@Injectable({ providedIn: 'root' })
export class BotService {
  private db = inject(Database);
  private timers = new Map<string, any>(); // key: `${matchId}:${botId}`
  private states = new Map<string, BotState>();

  /** Crée N bots et démarre leur mouvement (owner uniquement) */
  spawn(matchId: string, count = 3) {
    for (let i = 0; i < count; i++) {
      const botId = `bot-${Math.random().toString(36).slice(2, 7)}`;
      const st: BotState = {
        id: botId,
        x: rnd(-40, 40),
        y: rnd(-40, 40),
        vx: rnd(-1, 1), vy: rnd(-1, 1),
      };
      const norm = Math.hypot(st.vx, st.vy) || 1; st.vx /= norm; st.vy /= norm;
      this.states.set(`${matchId}:${botId}`, st);

      // On crée le nœud bot
      const r = ref(this.db, `bots/${matchId}/${botId}`);
      set(r, { x: st.x, y: st.y, t: Date.now(), name: 'Bot' }).catch(()=>{});
      try { onDisconnect(r).remove(); } catch {}

      // Boucle de mouvement (100 ms)
      const h = setInterval(() => {
        this.step(matchId, botId);
      }, 100);
      this.timers.set(`${matchId}:${botId}`, h);
    }
  }

  /** Stoppe tous les bots de ce match (owner) */
  stopAll(matchId: string) {
    for (const key of Array.from(this.timers.keys())) {
      if (!key.startsWith(matchId + ':')) continue;
      clearInterval(this.timers.get(key));
      this.timers.delete(key);
      const botId = key.split(':')[1];
      set(ref(this.db, `bots/${matchId}/${botId}`), null).catch(()=>{});
      this.states.delete(key);
    }
  }

  private step(matchId: string, botId: string) {
    const key = `${matchId}:${botId}`;
    const st = this.states.get(key);
    if (!st) return;

    // Petite errance + demi-tour aux bords
    if (Math.random() < 0.15) {
      st.vx += rnd(-0.5, 0.5);
      st.vy += rnd(-0.5, 0.5);
      const n = Math.hypot(st.vx, st.vy) || 1; st.vx /= n; st.vy /= n;
    }
    const SPEED = 1.5; // unités par tick
    st.x = clamp(st.x + st.vx * SPEED, -50, 50);
    st.y = clamp(st.y + st.vy * SPEED, -50, 50);
    if (Math.abs(st.x) >= 50) st.vx *= -1;
    if (Math.abs(st.y) >= 50) st.vy *= -1;

    set(ref(this.db, `bots/${matchId}/${botId}`), { x: st.x, y: st.y, t: Date.now(), name: 'Bot' }).catch(()=>{});
  }
}
