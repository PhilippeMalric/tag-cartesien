import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

let inited = false;
export function db(projectId = process.env.GOOGLE_CLOUD_PROJECT || "demo-test") {
  if (!inited) { initializeApp({ projectId }); inited = true; }
  return getFirestore();
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const now = () => Date.now();
export const rid = (len = 6) => Math.random().toString(36).slice(2, 2 + len).toUpperCase();

export type Role = "chasseur" | "chassé";
export async function createRoom(params: {
  mode: "classic" | "transmission" | "infection",
  targetScore?: number,
  victory?: "all_infected" | "target_infections",
  infectionTarget?: number,
  playersCount?: number,
}) {
  const { mode, targetScore, victory, infectionTarget, playersCount } = params;
  const d = db();
  const id = `R-${rid()}`;
  await d.doc(`rooms/${id}`).set({
    mode, targetScore: targetScore ?? null,
    victory: victory ?? null, infectionTarget: infectionTarget ?? null,
    state: "running",
    playersCount: playersCount ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return id;
}

export async function addPlayer(roomId: string, uid: string, role: Role, score = 0) {
  const d = db();
  await d.doc(`rooms/${roomId}/players/${uid}`).set({
    role, score, lastTagMs: 0, iFrameUntilMs: 0
  }, { merge: true });
  // map rôles en room (facilite infection/transmission)
  await d.doc(`rooms/${roomId}`).set({ roles: { [uid]: role } }, { merge: true });
}

export async function setRoles(roomId: string, roles: Record<string, Role>) {
  const d = db();
  await d.doc(`rooms/${roomId}`).set({ roles }, { merge: true });
}

export async function emitTag(roomId: string, hunterUid: string, victimUid: string, x = 0, y = 0) {
  const d = db();
  return await d.collection(`rooms/${roomId}/events`).add({
    type: "tag",
    hunterUid, victimUid, x, y,
    ts: FieldValue.serverTimestamp()
  });
}
