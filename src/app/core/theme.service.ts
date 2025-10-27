import { Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly storageKey = 'theme';

  private readonly prefersDark = typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
    : false;

  private _theme = signal<Theme>(this.readInitial());
  /** Signal public: 'light' | 'dark' */
  theme = computed(() => this._theme());

  constructor() {
    // Applique immédiatement le thème (SSR-safe)
    this.apply(this._theme());
  }

  /** Bascule clair/sombre */
  toggle(): void {
    const next: Theme = this._theme() === 'dark' ? 'light' : 'dark';
    console.log(`ThemeService: bascule vers le thème '${next}'`);
    
    this.setTheme(next);
  }

  /** Force un thème précis */
  setTheme(t: Theme): void {
    this._theme.set(t);
    this.apply(t);
    try { localStorage.setItem(this.storageKey, t); } catch {}
  }

  private readInitial(): Theme {
    try {
      const saved = localStorage.getItem(this.storageKey) as Theme | null;
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return this.prefersDark ? 'dark' : 'light';
  }

  private apply(t: Theme): void {
    const el = this.doc?.documentElement;
    if (!el) return;
    if (t === 'dark') el.setAttribute('data-theme', 'dark');
    else el.removeAttribute('data-theme'); // revient au clair
  }
}
