import { Server } from "socket.io";

export let ioInstance: Server | null = null;

export function setIoInstance(io: Server) {
  ioInstance = io;
}

export function broadcastTelemetry(payload: any) {
  if (ioInstance) {
    ioInstance.emit("telemetry:update", payload);
  }
}
