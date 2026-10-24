// Conexão multiplayer via WebSocket com reconexão automática e reenvio idempotente de operações.
export class Net extends EventTarget {
  constructor() {
    super();
    this.ws = null; this.pending = new Map(); // opId -> msg
    this.joinMsg = null; this.connected = false; this.retry = 0; this.closedByUser = false;
    this.opCounter = 0; this.lastAckSeq = 0;
  }
  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  open(joinMsg) {
    this.joinMsg = joinMsg; this.closedByUser = false;
    this._connect();
  }
  _connect() {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; ws.send(JSON.stringify(this.joinMsg)); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        this.connected = true;
        // depois de entrar, a reconexão sempre usa "join" com o código do mundo
        this.joinMsg = { ...this.joinMsg, t: 'join', world: m.world.id, restore: undefined };
        this.emit('welcome', m);
        // reenvia operações sem confirmação (o servidor ignora duplicadas)
        for (const msg of this.pending.values()) ws.send(JSON.stringify(msg));
        return;
      }
      if (m.t === 'ack') { this.pending.delete(m.opId); this.lastAckSeq = Math.max(this.lastAckSeq, m.seq || 0); }
      if (m.t === 'reject') this.pending.delete(m.opId);
      this.emit(m.t, m);
    };
    ws.onclose = (ev) => {
      const was = this.connected; this.connected = false;
      if (ev.code === 4000) { this.emit('replaced', {}); return; }
      if (this.closedByUser) return;
      this.emit('disconnected', { was });
      const delay = Math.min(10000, 500 * Math.pow(1.7, this.retry++));
      setTimeout(() => { if (!this.closedByUser) this._connect(); }, delay);
    };
    ws.onerror = () => {};
  }
  send(msg) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; } return false; }
  // operações persistentes: guardadas até a confirmação do servidor
  sendOp(op) {
    const opId = `${this.joinMsg.pid.slice(0, 8)}-${Date.now().toString(36)}-${(this.opCounter++).toString(36)}`;
    const msg = { t: 'op', opId, op };
    this.pending.set(opId, msg);
    this.send(msg);
    return opId;
  }
  close() { this.closedByUser = true; this.ws?.close(); }
}
