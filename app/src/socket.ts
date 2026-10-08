import { WS_URL } from './config';
import type { ServerEvent } from './types';

type Listener = (event: ServerEvent) => void;
type StatusListener = (connected: boolean) => void;

// WebSocket with automatic reconnect (exponential backoff, capped at 10s).
export class Socket {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private token: string,
    private onEvent: Listener,
    private onStatus: StatusListener
  ) {
    this.connect();
  }

  private connect() {
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus(true);
    };
    ws.onmessage = (e) => {
      try {
        this.onEvent(JSON.parse(String(e.data)));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      this.onStatus(false);
      if (this.closed) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
