import { RenderState } from './play.models';

export class PlayRenderer {
  draw(canvas: HTMLCanvasElement, state: RenderState) {
    const ctx = canvas.getContext('2d')!;
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = canvas.clientHeight);

    const css = getComputedStyle(document.documentElement);
    const colorGrid   = css.getPropertyValue('--grid').trim()   || '#eaeaea';
    const colorAxis   = css.getPropertyValue('--axis').trim()   || '#ddd';
    const colorOther  = css.getPropertyValue('--other').trim()  || '#888';
    const colorSelf   = css.getPropertyValue('--self').trim()   || '#1976d2';
    const colorHunter = css.getPropertyValue('--hunter').trim() || '#d32f2f';
    const colorRing   = css.getPropertyValue('--tag-ring').trim() || 'rgba(211,47,47,.35)';

    ctx.clearRect(0, 0, w, h);

    const scale = Math.min(w, h) / 120;
    const cx = w / 2, cy = h / 2;

    // grille
    ctx.strokeStyle = colorGrid;
    ctx.lineWidth = 1;
    for (let i = -50; i <= 50; i += 10) {
      const X = cx + i * scale, Y = cy + i * scale;
      ctx.beginPath(); ctx.moveTo(cx - 50 * scale, Y); ctx.lineTo(cx + 50 * scale, Y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X, cy - 50 * scale); ctx.lineTo(X, cy + 50 * scale); ctx.stroke();
    }

    // axes
    ctx.strokeStyle = colorAxis;
    ctx.beginPath(); ctx.moveTo(cx - 50 * scale, cy); ctx.lineTo(cx + 50 * scale, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 50 * scale); ctx.lineTo(cx, cy + 50 * scale); ctx.stroke();

    // autres
    ctx.fillStyle = colorOther;
    for (const p of state.others.values()) {
      ctx.beginPath();
      ctx.arc(cx + p.x * scale, cy + p.y * scale, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // halo iFrame
    if (performance.now() < state.invulnerableUntil) {
      const left = Math.max(0, state.invulnerableUntil - performance.now());
      const alpha = Math.max(0.15, Math.min(0.5, left / (state.invulnerableUntil ? left : 1)));
      const stroke = (state.role === 'chasseur' ? colorHunter : colorSelf) + '55';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx + state.me.x * scale, cy + state.me.y * scale, 12 * (alpha || 0.2), 0, Math.PI * 2);
      ctx.stroke();
    }

    // moi
    ctx.fillStyle = state.role === 'chasseur' ? colorHunter : colorSelf;
    ctx.beginPath();
    ctx.arc(cx + state.me.x * scale, cy + state.me.y * scale, 8, 0, Math.PI * 2);
    ctx.fill();

    // anneau chasseur
    if (state.role === 'chasseur') {
      ctx.strokeStyle = colorRing;
      ctx.beginPath();
      ctx.arc(cx + state.me.x * scale, cy + state.me.y * scale, state.tagRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
