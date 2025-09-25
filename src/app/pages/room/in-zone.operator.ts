import { NgZone } from '@angular/core';
import { Observable } from 'rxjs';

/** Opérateur RxJS : réémet dans la zone Angular */
export function inZone<T>(zone: NgZone) {
  return (source: Observable<T>) =>
    new Observable<T>(observer =>
      source.subscribe({
        next: v => zone.run(() => observer.next(v)),
        error: e => zone.run(() => observer.error(e)),
        complete: () => zone.run(() => observer.complete()),
      })
    );
}
