import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { useSystemStore } from '../store/useSystemStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

class SocketService {
  public socket: Socket | null = null;

  public connect() {
    if (this.socket) return;

    this.socket = io(SOCKET_URL, {
      reconnectionDelayMax: 5000,
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      useSystemStore.getState().setApiConnected(true);
    });

    this.socket.on('disconnect', () => {
      useSystemStore.getState().setApiConnected(false);
    });

    // Backend multiplexes everything over the 'telemetry' event
    this.socket.on('telemetry', (payload: any) => {
      if (payload.type === 'status') {
        useSystemStore.getState().setStatus(payload.data);
      } else if (payload.type === 'heartbeat') {
        useSystemStore.getState().setStatus({ uptime: payload.data?.uptime });
      } else if (payload.type?.startsWith('alert_')) {
        window.dispatchEvent(new CustomEvent('hydro:alert', { detail: payload }));
      } else if (payload.sensor !== undefined) {
        useTelemetryStore.getState().updateSensor(payload);
      }
    });

    // Also listen for the specific telemetry:update event
    this.socket.on('telemetry:update', (payload: any) => {
      if (payload.sensor !== undefined) {
        useTelemetryStore.getState().updateSensor(payload);
      }
    });

    this.socket.on('alert', (data: { message: string; level: 'warning' | 'critical' | 'info' }) => {
      // Will be handled by whoever imports this — toast is imported at the page level
      window.dispatchEvent(new CustomEvent('hydro:alert', { detail: data }));
    });
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();

/** Drop this component into the root layout to auto-connect */
export function SocketProvider() {
  useEffect(() => {
    socketService.connect();
    return () => socketService.disconnect();
  }, []);
  return null;
}
