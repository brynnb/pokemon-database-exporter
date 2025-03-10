// Simple browser-compatible event emitter
class BrowserEventEmitter {
  private events: Map<string, Array<(...args: any[]) => void>> = new Map();

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    if (!this.events.has(event)) return;

    const listeners = this.events.get(event)!;
    const index = listeners.indexOf(listener);

    if (index !== -1) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      this.events.delete(event);
    }
  }

  emit(event: string, ...args: any[]): void {
    if (!this.events.has(event)) return;

    const listeners = this.events.get(event)!;
    for (const listener of listeners) {
      listener(...args);
    }
  }
}

export interface TileUpdateEvent {
  tileId: number;
  newTileImageId: number;
}

export class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectInterval: number = 5000; // 5 seconds
  private reconnectTimer: number | null = null;
  private isConnecting: boolean = false;
  private events: BrowserEventEmitter = new BrowserEventEmitter();
  private serverUrl: string;

  constructor() {
    // Use localhost:3000 for WebSocket connection since that's where our server.js is running
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.serverUrl = `${protocol}//localhost:3000`;
  }

  connect(): void {
    if (this.socket || this.isConnecting) return;

    this.isConnecting = true;

    try {
      this.socket = new WebSocket(this.serverUrl);

      this.socket.onopen = () => {
        this.isConnecting = false;

        // Clear any reconnect timer
        if (this.reconnectTimer !== null) {
          window.clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Subscribe to tile updates
        this.send({ type: "subscribe" });

        // Emit connection event
        this.events.emit("connected");
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle different message types
          switch (data.type) {
            case "tileUpdate":
              this.events.emit("tileUpdate", {
                tileId: data.tileId,
                newTileImageId: data.newTileImageId,
              });
              break;

            case "connection":
            case "subscribed":
              // Server connection messages
              break;

            default:
              // Other message types
              break;
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      this.socket.onclose = () => {
        this.socket = null;
        this.isConnecting = false;

        // Emit disconnection event
        this.events.emit("disconnected");

        // Try to reconnect
        this.scheduleReconnect();
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        // The onclose handler will be called after this
      };
    } catch (error) {
      console.error("Error creating WebSocket:", error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer === null) {
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectInterval);
    }
  }

  send(data: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.warn("Cannot send message, WebSocket is not connected");
    }
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.events.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.events.off(event, listener);
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}

// Create a singleton instance
export const webSocketService = new WebSocketService();
