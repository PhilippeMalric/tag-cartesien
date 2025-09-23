import { RenderState } from './play.models';
export class PlayRenderer {
  draw(canvas: HTMLCanvasElement, state: RenderState) {
    const ctx = canvas.getContext('2d')!;

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

    // Graduations X (en bas)
    for (let i = -50; i <= 50; i += 10) {
      if (i === 0) continue;
      drawTextWithHalo(String(i), cx + i * scale, cy + 4, 'center', 'top');
    }
    // Graduations Y (à gauche)
    for (let i = -50; i <= 50; i += 10) {
      if (i === 0) continue;
      drawTextWithHalo(String(i), cx - 4, cy - i * scale, 'right', 'middle'); // y inversé
    }
    // Libellés X/Y
    drawTextWithHalo('Y', cx - 2, cy - (55 * scale), 'right', 'middle');
    drawTextWithHalo('X', cx + (55 * scale), cy, 'center', 'alphabetic');

    // --- Autres joueurs (gris par défaut, orange si chasseur) ---
    for (const [uid, p] of state.others) {
      const isHunter = !!state.hunterUid && uid === state.hunterUid;
      ctx.fillStyle = isHunter ? colorHunter : colorOther;
      ctx.beginPath();
      ctx.arc(cx + p.x * scale, cy - p.y * scale, 6, 0, Math.PI * 2); // y inversé
      ctx.fill();
    }

    // --- Halo d’invulnérabilité autour de "moi" (optionnel) ---
    if (performance.now() < state.invulnerableUntil) {
      const left = Math.max(0, state.invulnerableUntil - performance.now());
      const alpha = Math.max(0.15, Math.min(0.5, left / (state.invulnerableUntil ? left : 1)));
      const stroke = (state.role === 'chasseur' ? colorHunter : colorSelf) + '55';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx + state.me.x * scale, cy - state.me.y * scale, 12 * (alpha || 0.2), 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- Moi (orange si chasseur, sinon bleu) ---
    ctx.fillStyle = state.role === 'chasseur' ? colorHunter : colorSelf;
    ctx.beginPath();
    ctx.arc(cx + state.me.x * scale, cy - state.me.y * scale, 8, 0, Math.PI * 2); // y inversé
    ctx.fill();

    // --- Anneau de portée (seulement si je suis chasseur) ---
    if (state.role === 'chasseur') {
      ctx.strokeStyle = colorRing;
      ctx.beginPath();
      ctx.arc(cx + state.me.x * scale, cy - state.me.y * scale, state.tagRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}