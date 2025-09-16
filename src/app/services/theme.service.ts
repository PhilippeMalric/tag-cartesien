import { Injectable, effect, signal } from '@angular/core';

function applyDom(dark: boolean) {
  const el = document.documentElement;
  // Compat :root.dark et :root[data-theme="dark"]
  el.classList.toggle('dark', dark);
  el.dataset['theme'] = dark ? 'dark' : 'light';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal<boolean>(true);

  constructor() {
    // 1) Charger préférence persistée ou fallback système
    const saved = localStorage.getItem('theme'); // 'dark' | 'light' | null
    if (saved === 'dark' || saved === 'light') {
      this.isDark.set(saved === 'dark');
    } else {
      const prefers = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      this.isDark.set(!!prefers);
    }

    // 2) Appliquer immédiatement (évite le flash clair)
    applyDom(this.isDark());

    // 3) Réagir aux changements
    effect(() => {
      const dark = this.isDark();
      applyDom(dark);
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
    });

    // 4) Suivre les changements système si l'utilisateur n'a pas choisi
    if (!saved) {
      const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => this.isDark.set(e.matches);
      mq?.addEventListener?.('change', handler);
    }
  }

  toggle() { this.isDark.update(v => !v); }
  setDark(v: boolean) { this.isDark.set(v); }
}
