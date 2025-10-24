// src/app/core/monitor-bots.service.ts
// Service "inspiré du monitor" mais prêt à être utilisé DANS LE JEU.
// - RTDB: écrit uniquement les clés autorisées par tes règles (x, y, t, name, role, type, random)
// - Firestore: reflète les rôles et un snapshot minimal des players
// - Ownership: assure roomsMeta/{roomId}/ownerUid avant de patcher Firestore

import { Injectable, inject } from '@angular/core';

// Firebase (AngularFire)
import {
  Database,
  ref, get, set, update, onValue, off, push, runTransaction,
} from '@angular/fire/database';

import {
  Firestore,
  doc, setDoc, updateDoc, writeBatch, serverTimestamp, deleteField,
} from '@angular/fire/firestore';

import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';

/** Représentation d'un bot telle qu'autorisée en RTDB (cf. règles) */
export type Bot = {
  id: string;                            // clé sous /bots/{roomId}/{id}
  name?: string;                         // ✅ autorisé
  role?: 'hunter' | 'prey' | string;     // ✅ autorisé
  type?: 'bot';                          // ✅ autorisé
  x?: number;                            // ✅ autorisé
  y?: number;                            // ✅ autorisé
  t?: number;                            // ✅ autorisé (timestamp)
  random?: boolean;                      // ✅ autorisé
};

// Pour usage local éventuel (inchangé)
export type BotLocal = { id: string; x: number; y: number; h: number | null };

@Injectable({ providedIn: 'root' })
export class MonitorBotsService {

  private db = inject(Database);
  private fs = inject(Firestore);
  private auth = inject(Auth);

  // ---------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------
  private toast(msg: string) {
    console.log('[bots]', msg);
  }

  private rnd(a: number, b: number) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  private normalizeRole(role: string | null | undefined): 'hunter' | 'prey' {
    const r = (role || '').toLowerCase();
    return r === 'hunter' ? 'hunter' : 'prey';
  }

  // ---------------------------------------------------------------
  // Ownership (RTDB roomsMeta/{roomId}/ownerUid)
  // ---------------------------------------------------------------
  /** Pose ownerUid si absent (autorisé par la règle RTDB sur premier set). */
  async ensureOwnership(roomId: string) {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    const ownerRef = ref(this.db, `roomsMeta/${roomId}/ownerUid`);
    const snap = await get(ownerRef);
    if (!snap.exists()) {
      // Règle: ".write": auth != null && !data.exists() && newData.val() === auth.uid
      await set(ownerRef, uid);
    }
  }

  // ---------------------------------------------------------------
  // Lecture des bots (RTDB)
  // ---------------------------------------------------------------
  /** Flux des bots de la room, triés par name. */
  bots$(roomId: string): Observable<Bot[]> {
    return new Observable<Bot[]>((subscriber) => {
      const botsRef = ref(this.db, `bots/${roomId}`);
      const cb = onValue(botsRef, (snap) => {
        const val = (snap.val() as Record<string, any> | null) ?? null;
        const arr: Bot[] = val
          ? Object.entries(val).map(([id, b]) => ({ id, ...(b as object) })) as Bot[]
          : [];
        arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        subscriber.next(arr);
      }, (err) => subscriber.error(err));
      return () => off(botsRef, 'value', cb);
    });
  }

  // ---------------------------------------------------------------
  // Création / Spawn
  // ---------------------------------------------------------------
  /**
   * Ajoute un bot simple et retourne son uid virtuel Firestore (ex: 'bot-<pushKey>').
   * RTDB: clé = 'bot-<pushKey>' (standardisation), payload conforme aux règles.
   */
  async addBot(roomId: string, displayName = 'Bot', role: string = 'prey'): Promise<string | void> {
    if (!roomId) {
      this.toast('Room ID manquant');
      return;
    }

    await this.ensureOwnership(roomId);

    // 1) RTDB (latence faible) — ⚠️ uniquement les clés autorisées
    const botsRef = ref(this.db, `bots/${roomId}`);
    const newRef = push(botsRef);             // on l’utilise pour obtenir la pushKey
    const pushKey = newRef.key!;              // ex: "-OcHE7-7n8EZabyBkx10"
    const botId  = `bot-${pushKey}`;          // => "bot--OcHE7-7n8EZabyBkx10"
    const normRole = this.normalizeRole(role);

    await set(ref(this.db, `bots/${roomId}/${botId}`), {
      name: displayName || 'Bot',             // ✅ "name" (PAS displayName)
      x: 0,
      y: 0,
      t: Date.now(),                          // ✅ timestamp accepté sous "t"
      role: normRole,
      type: 'bot',
      // random: false,                        // (optionnel)
    });

    // 2) Firestore (roles map sur rooms/{id})
    const botUid = botId; // identique (bot-<pushKey>)
    await updateDoc(doc(this.fs, 'rooms', roomId), {
      [`roles.${botUid}`]: normRole,
    });

    // 3) Firestore (snapshot minimal player)
    await setDoc(doc(this.fs, `rooms/${roomId}/players/${botUid}`), {
      uid: botUid,
      displayName: `🤖 ${displayName}`,
      isConnected: false,
      ready: true,
      x: 0, y: 0,
      lastUpdate: serverTimestamp(),
      role: normRole,
    }, { merge: true });

    this.toast(`Bot créé: ${botUid} (${normRole})`);
    return botUid;
  }

  /**
   * Spawn de N bots:
   * - RTDB: /bots/{roomId}/bot-<pushKey> (toujours via push() pour l’unicité)
   * - Firestore: batch players/* + merge roles
   */
  async spawnBots(roomId: string, role: string = 'prey', nbBots: number): Promise<void> {
    if (!roomId) {
      this.toast('Room ID manquant');
      return;
    }

    try {
      // 1) Ownership (sinon patch Firestore va échouer)
      await this.ensureOwnership(roomId);

      const bound = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
      const count = bound(nbBots | 0, 1, 50);

      const normRole = this.normalizeRole(role);

      // 2) Prépare batch Firestore + writes RTDB en parallèle
      const batch = writeBatch(this.fs);
      const rtdbWrites: Promise<any>[] = [];
      const rolesPatch: Record<string, string> = {};
      const roomRef = doc(this.fs, `rooms/${roomId}`);

      for (let i = 0; i < count; i++) {
        // clé RTDB via push (puis standardisée avec "bot-")
        const pRef = push(ref(this.db, `bots/${roomId}`));
        const pushKey = pRef.key!;
        const botId = `bot-${pushKey}`;
        const x = this.rnd(-20, 20);
        const y = this.rnd(-20, 20);

        // RTDB — ✅ conforme aux règles
        rtdbWrites.push(
          set(ref(this.db, `bots/${roomId}/${botId}`), {
            x, y, t: Date.now(),
            name: `Bot ${i + 1}`,
            role: normRole,
            type: 'bot',
          })
        );

        // Firestore: player snapshot
        const fsPlayerRef = doc(this.fs, `rooms/${roomId}/players/${botId}`);
        batch.set(fsPlayerRef, {
          uid: botId,
          displayName: `🤖 Bot ${i + 1}`,
          isConnected: false,
          ready: true,
          x, y,
          lastUpdate: serverTimestamp(),
          role: normRole,
        }, { merge: true });

        // Patch de rôles (un seul merge à la fin)
        rolesPatch[botId] = normRole;
      }

      // 3) Un seul patch pour rooms/{id}.roles
      batch.set(roomRef, { roles: rolesPatch } as any, { merge: true });

      // 4) Exécution
      await Promise.all(rtdbWrites);
      await batch.commit();

      this.toast(`${count} bot${count > 1 ? 's' : ''} créé${count > 1 ? 's' : ''} (${normRole})`);
    } catch (err: any) {
      console.error('spawnBots error', err);
      if (String(err?.message || '').includes('permission_denied')) {
        this.toast('Permission refusée (RTDB). Vérifie roomsMeta/ownerUid, l’auth, ou les champs écrits.');
      } else {
        this.toast('Erreur lors de la création des bots.');
      }
    }
  }

  // ---------------------------------------------------------------
  // Opérations sur bots (RTDB + miroirs FS quand pertinent)
  // ---------------------------------------------------------------
  /** Déplacement relatif dx/dy (transaction atomique en RTDB). */
  async moveBot(roomId: string, botId: string, dx: number, dy: number) {
    const botRef = ref(this.db, `bots/${roomId}/${botId}`);
    await runTransaction(botRef, (cur: any) => {
      if (!cur) return cur;
      const nx = (cur.x ?? 0) + dx;
      const ny = (cur.y ?? 0) + dy;
      // ✅ pas de 'updatedAt' : on met à jour 't'
      return { ...cur, x: nx, y: ny, t: Date.now() };
    });
  }

  /** Position absolue. */
  async setPos(roomId: string, botId: string, x: number, y: number) {
    const botRef = ref(this.db, `bots/${roomId}/${botId}`);
    // ✅ pas de 'updatedAt'
    await update(botRef, { x, y, t: Date.now() });
  }

  /** Change le rôle du bot côté RTDB + synchronise Firestore (roles & player.role). */
  async setBotRole(roomId: string, botId: string, role: string) {
    const normRole = this.normalizeRole(role);

    // RTDB — ✅ pas de 'updatedAt'
    await update(ref(this.db, `bots/${roomId}/${botId}`), { role: normRole, t: Date.now() });

    // Firestore: roles map (owner requis côté FS, géré par ensureOwnership/guard UI)
    await updateDoc(doc(this.fs, 'rooms', roomId), { [`roles.${botId}`]: normRole });

    // Firestore: player snapshot
    await updateDoc(doc(this.fs, `rooms/${roomId}/players/${botId}`), {
      role: normRole,
      lastUpdate: serverTimestamp(),
    });
  }

  /** Active/désactive le comportement aléatoire côté RTDB. */
  async setBotRandom(roomId: string, botId: string, random: boolean) {
    // ✅ pas de 'updatedAt'
    await update(ref(this.db, `bots/${roomId}/${botId}`), { random, t: Date.now() });
  }

  /** Supprime une liste de bots (RTDB + nettoie Firestore: roles & players/*). */
  async clearBots(roomId: string, botKeys: string[]) {
    // RTDB — supprime systématiquement la clé standardisée et, par sécurité, l’ancienne sans préfixe si elle existe
    const updatesRTDB: Record<string, null> = {};
    for (const k of botKeys) {
      const withPrefix = k.startsWith('bot-') ? k : `bot-${k}`;
      const without    = withPrefix.replace(/^bot-/, '');
      updatesRTDB[withPrefix] = null;
      updatesRTDB[without]    = null; // cleanup rétro si jamais
    }
    await update(ref(this.db, `bots/${roomId}`), updatesRTDB);

    // Firestore — roles & players/*
    const batch = writeBatch(this.fs);
    const patch: Record<string, any> = {};
    for (const k of botKeys) {
      const uid = k.startsWith('bot-') ? k : `bot-${k}`;
      patch[`roles.${uid}`] = deleteField();
      batch.delete(doc(this.fs, `rooms/${roomId}/players/${uid}`));
    }
    batch.update(doc(this.fs, 'rooms', roomId), patch);
    await batch.commit();
  }
}
