import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'relativeTime', standalone: true, pure: false })
export class RelativeTimePipe implements PipeTransform, OnDestroy {
  private timer: any;

  constructor(private ref: ChangeDetectorRef) {}

  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  transform(value: number | Date | { seconds: number } | null | undefined): string {
    const ms = this.normalizeToMs(value);
    if (!ms) return '';

    this.setupTimer(ms);

    const diff = Date.now() - ms; // positif = passé
    if (diff < 0) return 'dans un instant';

    const sec = Math.floor(diff / 1000);
    if (sec < 5)  return 'à l’instant';
    if (sec < 60) return `il y a ${sec} s`;

    const min = Math.floor(sec / 60);
    if (min < 60) return `il y a ${min} min`;

    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;

    const d = Math.floor(h / 24);
    if (d < 7) return `il y a ${d} j`;

    const w = Math.floor(d / 7);
    if (w < 5) return `il y a ${w} sem`;

    const mo = Math.floor(d / 30);
    if (mo < 12) return `il y a ${mo} mois`;

    const y = Math.floor(d / 365);
    return `il y a ${y} an${y > 1 ? 's' : ''}`;
  }

  private normalizeToMs(v: any): number | null {
    if (!v) return null;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    if (typeof v.seconds === 'number') return v.seconds * 1000; // Firestore Timestamp-like
    if (typeof v.toMillis === 'function') return v.toMillis();
    return null;
  }

  private setupTimer(ms: number) {
    if (this.timer) return;
    // rafraîchit l’affichage toutes les 30s
    this.timer = setInterval(() => this.ref.markForCheck(), 30_000);
  }
}
