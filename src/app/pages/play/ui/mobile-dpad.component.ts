import { Component, EventEmitter, Output, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-mobile-dpad',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dpad" >
      <button class="btn up" (touchstart)="emitMove('up')"    (click)="emitMove('up')"
               >▲</button>

      <button class="btn left" (touchstart)="emitMove('left')"    (click)="emitMove('left')"
               >◄</button>

      <button class="btn down"  (touchstart)="emitMove('down')"    (click)="emitMove('down')"
              >▼</button>

      <button class="btn right"  (touchstart)="emitMove('right')"    (click)="emitMove('right')"
              >►</button>
    </div>
  `,
  styles: [`
    .dpad{
      position: fixed;
      left: 1rem;
      bottom: 1rem;
      width: 140px;
      height: 140px;
      pointer-events: auto;
      touch-action: none;
      z-index: 9999;
      user-select: none;
    }
    .btn{
      position: absolute;
      width: 48px;
      height: 48px;
      border-radius: 10px;
      border: none;
      font-size: 20px;
      background: rgba(0,0,0,0.5);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }
    .btn.up    { left: 46px; top: 0; }
    .btn.left  { left: 0;  top: 46px; }
    .btn.down  { left: 46px; top: 92px; }
    .btn.right { left: 92px; top: 46px; }

    /* small visual feedback on press */
    .btn:active { transform: scale(0.96); background: rgba(0,0,0,0.65); }
    @media (min-width: 700px) {
      /* hide on desktop if you prefer */
      .dpad { display: none; }
    }
  `]
})
export class MobileDpadComponent {
  /** Optionnel: fonction fournie par le parent pour exécuter le mouvement (préféré) */
    @Input() moveFn!: (dir: 'up'|'down'|'left'|'right') => void;

    @Input() releaseFn!: (dir: 'up'|'down'|'left'|'right') => void;
  /** Évènement si tu préfères capter depuis le parent (alternative) */
  @Output() move = new EventEmitter<'up'|'down'|'left'|'right'>();

  private holdInterval: any = null;
  private repeatMs = 100; // fréquence d'envoi quand on garde le doigt

  press(dir: 'up'|'down'|'left'|'right') {
    // émission immédiate
    this.emitMove(dir);

    // et répétition tant que le doigt reste appuyé
    //this.clearHold();
    //this.holdInterval =   (() => this.emitMove(dir), this.repeatMs);
  }

  release() {
    this.clearHold();
  }

  private clearHold() {
    if (this.holdInterval) {
      clearInterval(this.holdInterval);
      this.holdInterval = null;
    }
  }

   emitMove(dir: 'up'|'down'|'left'|'right') {
    // 1) si moveFn fournie, on l'appelle (idéal pour appeler PositionsService directement)
    if (this.moveFn) {
      try { this.moveFn(dir); } catch (e) { console.error(e); }
      return;
    }

  }

 emitR(dir: 'up'|'down'|'left'|'right') {
    // 1) si moveFn fournie, on l'appelle (idéal pour appeler PositionsService directement)
    if (this.releaseFn) {
      try { this.releaseFn(dir); } catch (e) { console.error(e); }
      return;
    }

  }

}
