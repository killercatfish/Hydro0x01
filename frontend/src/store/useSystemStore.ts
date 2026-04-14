import { create } from 'zustand';

export interface SystemStatus {
  state: 'ACTIVE' | 'MAINTENANCE' | 'EMERGENCY' | 'OTA_UPDATE' | 'OFFLINE' | 'UNKNOWN';
  wifiState: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  mqttState: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  pumpState: 'OFF' | 'ON' | 'COOLDOWN';
  uptime: number;
  errorCount: number;
  firmwareVersion?: string;
}

export interface Device {
  id: number;
  device_id: string;
  status: string;
  firmware_version: string;
  last_seen: string;
}

interface SystemStore {
  status: SystemStatus;
  apiConnected: boolean;
  selectedDevice: string;
  availableDevices: Device[];
  sidebarOpen: boolean;
  setStatus: (status: Partial<SystemStatus>) => void;
  setApiConnected: (connected: boolean) => void;
  setSelectedDevice: (deviceId: string) => void;
  setAvailableDevices: (devices: Device[]) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const initialStatus: SystemStatus = {
  state: 'UNKNOWN',
  wifiState: 'DISCONNECTED',
  mqttState: 'DISCONNECTED',
  pumpState: 'OFF',
  uptime: 0,
  errorCount: 0,
};

export const useSystemStore = create<SystemStore>((set) => ({
  status: initialStatus,
  apiConnected: false,
  selectedDevice: '',
  availableDevices: [],
  sidebarOpen: false,
  setStatus: (newStatus) => set((state) => ({
    status: { ...state.status, ...newStatus }
  })),
  setApiConnected: (connected) => set({ apiConnected: connected }),
  setSelectedDevice: (deviceId) => set({ selectedDevice: deviceId }),
  setAvailableDevices: (devices) => set({ availableDevices: devices }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
