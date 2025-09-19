import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'relativeTime', standalone: true })
export class RelativeTimePipe implements PipeTransform {
  transform(value: number | Date | undefined | null): string {
    if (value == null) return '';
    const ts = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(ts)) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `il y a ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    return `il y a ${d} j`;
  }
}
