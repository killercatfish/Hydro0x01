import { create } from 'zustand';

export interface TelemetryData {
  device: string;
  timestamp: string | number;
  [key: string]: any;
}

interface TelemetryStore {
  latestData: TelemetryData;
  history: TelemetryData[];
  updateSensor: (payload: { deviceId: string; sensor: string; value: number; timestamp: string }) => void;
  reset: () => void;
}

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  latestData: { device: '', timestamp: Date.now() },
  history: [],
  updateSensor: (payload) => set((state) => {
    const updatedData: TelemetryData = {
      ...state.latestData,
      device: payload.deviceId,
      timestamp: payload.timestamp,
      [payload.sensor]: payload.value,
    };

    const newHistory = [...state.history, updatedData].slice(-120);

    return {
      latestData: updatedData,
      history: newHistory,
    };
  }),
  reset: () => set({ latestData: { device: '', timestamp: Date.now() }, history: [] }),
}));
