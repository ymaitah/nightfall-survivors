// WebSocket client with auto-reconnect and a tiny event emitter.
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.onBinary = null;
    this.open = false;
    this.retry = 0;
    this.ping = 0;
    this._pingTimer = null;
  }

  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  emit(type, msg) { for (const fn of this.handlers[type] || []) fn(msg); }

  connect() {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      this.retry = 0;
      this.emit('open');
      clearInterval(this._pingTimer);
      this._pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.t === 'pong') { this.ping = Math.round(performance.now() - msg.c); return; }
        this.emit(msg.t, msg);
      } else if (this.onBinary) this.onBinary(e.data);
    };
    ws.onclose = () => {
      const was = this.open;
      this.open = false;
      clearInterval(this._pingTimer);
      this.emit('close', { was });
      const delay = Math.min(5000, 400 * Math.pow(1.6, this.retry++));
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }
}
