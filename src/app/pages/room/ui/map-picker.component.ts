import {
  Component, ElementRef, ViewChild, NgZone, OnDestroy, AfterViewInit,
  effect, input, output, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type XY = { x: number; y: number };

@Component({
  selector: 'app-map-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-picker.component.html',
  styleUrls: ['./map-picker.component.scss'],
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv', { static: true }) cv!: ElementRef<HTMLCanvasElement>;

  /** Entrée (valeur venue du parent) */
  xy = input<XY>({ x: 0, y: 0 });
  /** Sortie (événement de mise à jour) */
  xyChange = output<XY>();

  /** État local (feedback instantané) */
  private localXY = signal<XY>({ x: 0, y: 0 });

  public dragging = false;
  private ro?: ResizeObserver;

  constructor(private zone: NgZone) {
    effect(() => {
      const v = this.xy();
      this.localXY.set({ x: v.x, y: v.y });
      this.draw();
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.ro = new ResizeObserver(() => this.draw());
      this.ro.observe(this.cv.nativeElement);
      this.draw();
    });
  }
  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.dragging = false;
  }

  // Pointer events
  onPointerDown(e: PointerEvent) {
    e.preventDefault();
    this.dragging = true;
    this.cv.nativeElement.setPointerCapture(e.pointerId);
    this.applyPointer(e);
  }
  onPointerMove(e: PointerEvent) {
    if (!this.dragging) return;
    e.preventDefault();
    this.applyPointer(e);
  }
  endDrag(e: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;
    try { this.cv.nativeElement.releasePointerCapture(e.pointerId); } catch {}
  }

  private applyPointer(e: PointerEvent) {
    const { x, y } = this.clientToWorld(e.clientX, e.clientY);
    const nx = Math.max(-50, Math.min(50, Math.round(x)));
    const ny = Math.max(-50, Math.min(50, Math.round(y)));
    this.localXY.set({ x: nx, y: ny }); // maj locale
    this.draw();
    this.xyChange.emit({ x: nx, y: ny }); // notifie le parent
  }

  private draw() {
    const canvas = this.cv?.nativeElement; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // DPR + taille responsive
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.documentElement);
    const colorGrid   = css.getPropertyValue('--grid').trim()      || '#2a2a2c';
    const colorAxis   = css.getPropertyValue('--axis').trim()      || '#3a3a3d';
    const colorTick   = css.getPropertyValue('--tick').trim()      || '#4a4a4d';
    const colorPoint  = css.getPropertyValue('--self').trim()      || '#3fa7ff';

    const scale = Math.min(w, h) / 120;
    const cx = w / 2, cy = h / 2;

    // --- GRILLE (cartésienne : y vers le HAUT) ---
    ctx.strokeStyle = colorGrid; ctx.lineWidth = 1;
    for (let i = -50; i <= 50; i += 10) {
      const X = cx + i * scale;
      const Y = cy - i * scale;      // ⟵ inversé ici
      // horizontales
      ctx.beginPath(); ctx.moveTo(cx - 50 * scale, Y); ctx.lineTo(cx + 50 * scale, Y); ctx.stroke();
      // verticales
      ctx.beginPath(); ctx.moveTo(X, cy - 50 * scale); ctx.lineTo(X, cy + 50 * scale); ctx.stroke();
    }

    // axes
    ctx.strokeStyle = colorAxis;
    ctx.beginPath(); ctx.moveTo(cx - 50 * scale, cy); ctx.lineTo(cx + 50 * scale, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 50 * scale); ctx.lineTo(cx, cy + 50 * scale); ctx.stroke();

    // graduations (tous les 10)
    ctx.fillStyle = colorTick;
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    // X: en bas (repères le long de l’axe X)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = -50; i <= 50; i += 10) {
      if (i === 0) continue;
      ctx.fillText(String(i), cx + i * scale, cy + 4);
    }

    // Y: sur la gauche (repères le long de l’axe Y)
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = -50; i <= 50; i += 10) {
      if (i === 0) continue;
      ctx.fillText(String(i), cx - 4, cy - i * scale); // ⟵ inversé ici
    }
ctx.fillText("Y",cx -2, cy - (55 * scale))
ctx.fillText("X",cx + (55 * scale), cy)
    // point (utilise la convention cartésienne)
    const { x, y } = this.localXY();
    const px = cx + x * scale;
    const py = cy - y * scale;        // ⟵ inversé ici
    ctx.beginPath(); ctx.fillStyle = 'rgba(63,167,255,0.15)'; ctx.arc(px, py, 12, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = colorPoint; ctx.arc(px, py, 6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.strokeStyle = '#fff6'; ctx.lineWidth = 1.5; ctx.arc(px, py, 6, 0, Math.PI*2); ctx.stroke();
  }

  /** Convertit coord. écran → monde (cartésien) */
  private clientToWorld(clientX: number, clientY: number) {
    const rect = this.cv.nativeElement.getBoundingClientRect();
    const xpx = clientX - rect.left;
    const ypx = clientY - rect.top;
    const w = rect.width, h = rect.height;
    const scale = Math.min(w, h) / 120;
    const cx = w / 2, cy = h / 2;
    return {
      x: (xpx - cx) / scale,
      y: (cy - ypx) / scale,   // ⟵ y monte quand on va vers le haut
    };
  }
}
