// src/app/pages/play/play.renderer.ts
import { RenderState } from './play.models';

export class PlayRenderer {
  draw(canvas: HTMLCanvasElement, state: RenderState) {
    const ctx = canvas.getContext('2d')!;

    // --- INVULN params (UI uniquement) ---
    const INVULN_DEFAULT_MS = 1000; // si on ne connaît pas la durée exacte
    const RING_OUTER = 14;          // rayon externe de l’anneau
    const RING_INNER = 10;          // rayon interne
    const RING_WIDTH = RING_OUTER - RING_INNER;

    // --- Helpers de temps
    const epochToPerfDeadline = (deadlineEpochMs: number) =>
      performance.now() + Math.max(0, deadlineEpochMs - Date.now());

    // --- DPR + taille responsive ---
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;

    // --- Couleurs via variables CSS (avec fallback) ---
    const css = getComputedStyle(document.documentElement);
    const colorGrid       = css.getPropertyValue('--grid').trim()         || '#202124';
    const colorAxis       = css.getPropertyValue('--axis').trim()         || '#f0f1f3';
    const colorAxisStrong = css.getPropertyValue('--axis-strong').trim()  || colorAxis;
    const colorTick       = css.getPropertyValue('--tick').trim()         || '#ffffff';
    const labelStroke     = css.getPropertyValue('--label-stroke').trim() || 'rgba(0,0,0,0.65)';
    const colorSelf       = css.getPropertyValue('--self').trim()         || '#1976d2';
    const colorOther      = css.getPropertyValue('--other').trim()        || '#9aa0a6';
    const colorHunter     = css.getPropertyValue('--hunter').trim()       || '#ff7a00';
    const colorRing       = css.getPropertyValue('--tag-ring').trim()     || 'rgba(211,47,47,.35)';

    // Invuln UI (personnalisable)
    const invColRing = css.getPropertyValue('--invuln-ring').trim() || 'rgba(63,167,255,.85)';
    const invColFill = css.getPropertyValue('--invuln-fill').trim() || 'rgba(63,167,255,.15)';
    const invColText = css.getPropertyValue('--invuln-text').trim() || '#ffffff';

    ctx.clearRect(0, 0, w, h);

    // --- Espace (-50..50), échelle et centre ---
    const scale = Math.min(w, h) / 120;
    const cx = w / 2, cy = h / 2;

    // --- Grille (cartésienne : y vers le HAUT) ---
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = colorGrid;
    ctx.lineWidth = 1;
    for (let i = -50; i <= 50; i += 10) {
      const X = cx + i * scale;
      const Y = cy - i * scale; // y inversé
      // horizontales
      ctx.beginPath(); ctx.moveTo(cx - 50 * scale, Y); ctx.lineTo(cx + 50 * scale, Y); ctx.stroke();
      // verticales
      ctx.beginPath(); ctx.moveTo(X, cy - 50 * scale); ctx.lineTo(X, cy + 50 * scale); ctx.stroke();
    }
    ctx.restore();

    // --- Axes plus visibles ---
    ctx.strokeStyle = colorAxisStrong;
    ctx.lineWidth = 2;
    // X
    ctx.beginPath(); ctx.moveTo(cx - 50 * scale, cy); ctx.lineTo(cx + 50 * scale, cy); ctx.stroke();
    // Y
    ctx.beginPath(); ctx.moveTo(cx, cy - 50 * scale); ctx.lineTo(cx, cy + 50 * scale); ctx.stroke();

    // --- Texte avec halo (graduations + libellés) ---
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const drawTextWithHalo = (
      text: string,
      x: number,
      y: number,
      align: CanvasTextAlign,
      baseline: CanvasTextBaseline
    ) => {
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.lineWidth = 3;
      ctx.strokeStyle = labelStroke;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colorTick;
      ctx.fillText(text, x, y);
    };

    // Compte repères
    for (let i = -50; i <= 50; i += 10) {
      if (i !== 0) drawTextWithHalo(String(i), cx + i * scale, cy + 4, 'center', 'top'); // X
    }
    for (let i = -50; i <= 50; i += 10) {
      if (i !== 0) drawTextWithHalo(String(i), cx - 4, cy - i * scale, 'right', 'middle'); // Y
    }
    drawTextWithHalo('Y', cx - 2, cy - (55 * scale), 'right', 'middle');
    drawTextWithHalo('X', cx + (55 * scale), cy, 'center', 'alphabetic');

    // --- Helper: anneau d’invulnérabilité + timer
    const drawInvulnRing = (
      px: number, py: number,
      untilPerfMs: number,
      labelSide: 'left' | 'right' | 'top' | 'bottom' = 'top'
    ) => {
      const now = performance.now();
      const left = Math.max(0, untilPerfMs - now);
      if (left <= 0) return;

      const frac = Math.max(0, Math.min(1, left / INVULN_DEFAULT_MS));

      // fond doux
      ctx.beginPath();
      ctx.fillStyle = invColFill;
      ctx.arc(px, py, RING_OUTER, 0, Math.PI * 2);
      ctx.fill();

      // arc de progression
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = RING_WIDTH;
      ctx.strokeStyle = invColRing;
      const start = -Math.PI / 2; // 12h
      const end = start + Math.PI * 2 * frac;
      ctx.beginPath();
      ctx.arc(px, py, (RING_INNER + RING_OUTER) / 2, start, end);
      ctx.stroke();
      ctx.restore();

      // label "x.xs"
      const secs = (left / 1000).toFixed(1);
      ctx.save();
      ctx.font = '600 11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = invColText;
      ctx.textAlign = (labelSide === 'left' ? 'right' : labelSide === 'right' ? 'left' : 'center');
      ctx.textBaseline = (labelSide === 'top' ? 'bottom' : labelSide === 'bottom' ? 'top' : 'middle');
      const off = 16;
      let tx = px, ty = py;
      if      (labelSide === 'left')   tx -= off;
      else if (labelSide === 'right')  tx += off;
      else if (labelSide === 'top')    ty -= off;
      else if (labelSide === 'bottom') ty += off;
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 4;
      ctx.fillText(`${secs}s`, tx, ty);
      ctx.restore();
    };

    // --- Autres joueurs (gris par défaut, orange si chasseur) ---
   for (const [uid, p] of state.others) {
      // ⚠️ on détermine le chasseur via hunterUid (global), pas via MON rôle
     const role = String((p as any)?.role ?? '').toLowerCase();
      const isHunterOther = p.ringKind === 'hunter';

      ctx.fillStyle = isHunterOther ? colorHunter : colorOther;

      const px = cx + p.x * scale;
      const py = cy - p.y * scale;

      // iFrame / invuln
      let untilMs: number | undefined;
      const raw = (p as any)?.iFrameUntilMs;
      if (typeof raw === 'number') {
        untilMs = raw;
      } else if (raw && typeof raw.seconds === 'number') {
        untilMs = (raw.seconds * 1000) + (raw.nanoseconds ? raw.nanoseconds / 1e6 : 0);
      }
      const hunterFallback = (state as any)?.hunterIFrameUntilMs as number | undefined;
      if (!untilMs && isHunterOther && typeof hunterFallback === 'number') {
        untilMs = hunterFallback;
      }
      if (untilMs && untilMs > Date.now()) {
        drawInvulnRing(px, py, epochToPerfDeadline(untilMs), 'bottom');
      }

      ctx.fillStyle = isHunterOther ? colorHunter : colorOther;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Moi (anneau d’invulnérabilité + point) ---
    const mePx = cx + state.me.x * scale;
    const mePy = cy - state.me.y * scale;

    // Invulnérabilité locale
    if (state.invulnerableUntil && performance.now() < state.invulnerableUntil) {
      drawInvulnRing(mePx, mePy, state.invulnerableUntil, 'top');
    }

    // 🟠 tolère EN/FR pour “moi”
    const r = String(state.role ?? '').toLowerCase();

    //console.log("r",r);


    const amHunter =
      r === 'hunter' || 
      (Array.isArray((state as any).hunterUids) &&
      (state as any).meUid &&
      (state as any).hunterUids.includes((state as any).meUid));


    // Moi (orange si chasseur, sinon bleu)
    ctx.fillStyle = amHunter ? colorHunter : colorSelf;
    ctx.beginPath();
    ctx.arc(mePx, mePy, 8, 0, Math.PI * 2);
    ctx.fill();

    // Anneau de portée si je suis chasseur
    if (amHunter) {
      ctx.strokeStyle = colorRing;
      ctx.beginPath();
      ctx.arc(mePx, mePy, state.tagRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
