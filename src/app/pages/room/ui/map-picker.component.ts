import {
  Component, ElementRef, ViewChild, NgZone, OnDestroy, AfterViewInit,
  OnChanges, SimpleChanges, Input, Output, EventEmitter, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export type XY = { x: number; y: number };

@Component({
  selector: 'app-map-picker',
  standalone: true,
  imports: [CommonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './map-picker.component.html',
  styleUrls: ['./map-picker.component.scss'],
})
export class MapPickerComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('cv', { static: true }) cv!: ElementRef<HTMLCanvasElement>;

  /** Entrée (valeur venue du parent) */
  @Input() xy: XY = { x: 0, y: 0 };
  /** Sortie (événement de mise à jour) */
  @Output() xyChange = new EventEmitter<XY>();

  /** État local (feedback instantané) */
  localXY = signal<XY>({ x: 0, y: 0 });

  public dragging = false;
  private ro?: ResizeObserver;

  // Plage et arrondi
  private readonly MIN = -50;
  private readonly MAX = 50;

  // Valeurs « en cours de saisie »
  private pendingX: number | null = null;
  private pendingY: number | null = null;

  constructor(private zone: NgZone) {}

  // --- Cycle de vie ---
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['xy'] && this.xy) {
      this.localXY.set(this.clampXY(this.xy));
      this.draw();
    }
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

  // --- Handlers champs X/Y ---
  onXInput(raw: string | number) {
    const n = this.normalize(raw);
    this.pendingX = n;
    this.localXY.update(v => ({ ...v, x: n })); // feedback instantané
    this.draw();
  }

  onYInput(raw: string | number) {
    const n = this.normalize(raw);
    this.pendingY = n;
    this.localXY.update(v => ({ ...v, y: n })); // feedback instantané
    this.draw();
  }

  onXBlur() { this.commitX(); }
  onYBlur() { this.commitY(); }

  commitX() {
    const x = this.pendingX ?? this.localXY().x;
    this.pendingX = null;
    this.commit({ x, y: this.localXY().y });
  }

  commitY() {
    const y = this.pendingY ?? this.localXY().y;
    this.pendingY = null;
    this.commit({ x: this.localXY().x, y });
  }

  /** Applique bornes + arrondi, synchronise l’état et émet au parent */
  private commit(xy: XY) {
    const next = this.clampXY(this.roundXY(xy));
    this.localXY.set(next);
    this.draw();
    this.xyChange.emit(next);
  }

  // --- Pointer events (canvas) ---
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
    // Option: on peut « commit » explicitement ici,
    // mais applyPointer() émet déjà à chaque move.
  }

  private clientToWorld(clientX: number, clientY: number): XY {
    const rect = this.cv.nativeElement.getBoundingClientRect();
    const xpx = clientX - rect.left;
    const ypx = clientY - rect.top;

    // Même échelle que dans draw(): repère [-50..50] sur le plus petit côté
    const w = rect.width, h = rect.height;
    const scale = Math.min(w, h) / 120; // 100 unités + marges
    const cx = w / 2, cy = h / 2;

    return {
      x: (xpx - cx) / scale,
      y: (cy - ypx) / scale, // y positif vers le haut
    };
  }
  
  private applyPointer(e: PointerEvent) {
    const { x, y } = this.clientToWorld(e.clientX, e.clientY);
    const nx = this.clamp(this.round(x));
    const ny = this.clamp(this.round(y));
    this.localXY.set({ x: nx, y: ny }); // maj locale pour feedback
    this.draw();
    this.xyChange.emit({ x: nx, y: ny }); // notifie le parent à chaque mouvement
  }

  // --- Rendu ---
  private draw() {
    const canvas = this.cv?.nativeElement; if (!canvas) return;
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

    ctx.clearRect(0, 0, w, h);

    // --- Couleurs via variables CSS (avec fallback) ---
    const css = getComputedStyle(document.documentElement);
    const colorGrid       = css.getPropertyValue('--grid').trim()         || '#202124';
    const colorAxis       = css.getPropertyValue('--axis').trim()         || '#f0f1f3';
    const colorAxisStrong = css.getPropertyValue('--axis-strong').trim()  || colorAxis;
    const colorTick       = css.getPropertyValue('--tick').trim()         || '#ffffff';
    const labelStroke     = css.getPropertyValue('--label-stroke').trim() || 'rgba(0,0,0,0.65)';
    const colorPoint      = css.getPropertyValue('--self').trim()         || '#3fa7ff';

    // --- Repère (−50..50), échelle et centre ---
    const scale = Math.min(w, h) / 120;
    const cx = w / 2, cy = h / 2;

    // --- GRILLE (cartésienne : y vers le HAUT) + atténuée ---
    ctx.save();
    ctx.globalAlpha = 0.35;        // grille plus discrète
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

    // --- AXES plus visibles ---
    ctx.strokeStyle = colorAxisStrong;
    ctx.lineWidth = 2;             // renforce le contraste
    ctx.beginPath(); ctx.moveTo(cx - 50 * scale, cy); ctx.lineTo(cx + 50 * scale, cy); ctx.stroke(); // X
    ctx.beginPath(); ctx.moveTo(cx, cy - 50 * scale); ctx.lineTo(cx, cy + 50 * scale); ctx.stroke(); // Y

    // --- Texte avec halo (nombres + libellés) ---
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
      // Halo
      ctx.lineWidth = 3;
      ctx.strokeStyle = labelStroke;
      ctx.strokeText(text, x, y);
      // Remplissage
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

    // --- Point (utilise la convention cartésienne) ---
    const { x, y } = this.localXY();
    const px = cx + x * scale;
    const py = cy - y * scale; // y inversé
    ctx.beginPath(); ctx.fillStyle = 'rgba(63,167,255,0.15)'; ctx.arc(px, py, 12, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = colorPoint; ctx.arc(px, py, 6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.strokeStyle = '#fff6'; ctx.lineWidth = 1.5; ctx.arc(px, py, 6, 0, Math.PI*2); ctx.stroke();
  }

  // --- Utils numériques ---
  private clamp(n: number) {
    return Math.max(this.MIN, Math.min(this.MAX, n));
  }
  private round(n: number) {
    return Math.round(n);
  }
  private clampXY(p: XY): XY {
    return { x: this.clamp(p.x), y: this.clamp(p.y) };
  }
  private roundXY(p: XY): XY {
    return { x: this.round(p.x), y: this.round(p.y) };
  }
  private normalize(v: string | number): number {
    const n = typeof v === 'number' ? v : parseFloat(v);
    const safe = Number.isFinite(n) ? this.round(n) : 0;
    return this.clamp(safe);
  }
}
