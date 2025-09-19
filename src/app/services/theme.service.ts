import { Injectable, signal } from '@angular/core';
type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _theme = signal<Theme>((localStorage.getItem('theme') as Theme) || 'dark');

  current(): Theme { return this._theme(); }
  apply(theme: Theme) {
    this._theme.set(theme);
    document.documentElement.dataset['theme'] = theme;
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }
  toggle() { this.apply(this._theme() === 'dark' ? 'light' : 'dark'); }
}
