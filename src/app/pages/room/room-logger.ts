export class RoomLogger {
  private _writes: string[] = [];
  constructor(private onChange: (writes: string[]) => void) {}

  log(msg: string) {
    const t = new Date().toLocaleTimeString();
    this._writes = [`[${t}] ${msg}`, ...this._writes].slice(0, 30);
    this.onChange(this._writes);
  }
}
