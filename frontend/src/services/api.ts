import { useAuthStore } from '../store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const token = useAuthStore.getState().token;
  
  const headers: Record<string, string> = {};
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // If token expired or invalid
    if (response.status === 401 && endpoint !== '/api/auth/login') {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    throw new Error(data?.error || response.statusText || 'API Request Failed');
  }

  return data as T;
}

// ── Auth ─────────────────────────────────────────────────────────
export const login = (username: string, password: string) => 
  request<any>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });

export const setupAdmin = (username: string, password: string) =>
  request<any>('/api/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) });

// We manually check if setup is needed by trying a dummy login or we could fetch a specific endpoint. 
// Just check setup by attempting to query user count implicitly (a failing query or ping). 
// Wait, we need an endpoint to check if users exist! But we didn't add one to the backend.
// We can just rely on logging in. Wait, SetupPage requires a way to know. Let's just catch the 403 on setup!
// No, the UI needs it. We'll use a hack: call /api/auth/setup with empty body. It returns 403 if users exist.
export const checkSetupRequired = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/auth/setup-status`)
      .then(res => res.json());
    
    // Returns true if users exist (i.e. setup NOT required)
    return !res.setupRequired;
  } catch (e) {
    return true; // Assume setup done on network error to default to login
  }
};


// ── Devices ──────────────────────────────────────────────────────
export const fetchDevices = () =>
  request<any[]>('/api/devices');

export const fetchDeviceInfo = (deviceId: string) =>
  request<any>(`/api/devices/${deviceId}`);

export const fetchDeviceStatus = (deviceId: string) =>
  request<any>(`/api/devices/${deviceId}/status`);

// ── Telemetry ────────────────────────────────────────────────────
export const fetchTelemetry = (
  deviceId: string,
  range = '24h',
  sensor?: string,
  interval = '1m',
  limit = 200
) => {
  const params = new URLSearchParams({ range, interval, limit: String(limit) });
  if (sensor) params.set('sensor', sensor);
  return request<any>(`/api/devices/${deviceId}/telemetry?${params}`);
};

// ── Configuration ────────────────────────────────────────────────
export const fetchDeviceConfig = (deviceId: string) =>
  request<any>(`/api/devices/${deviceId}/config`);

export const fetchSystemConfig = () =>
  request<any>('/api/config');

export const updateConfig = (data: Record<string, any>) =>
  request<any>('/api/config', { method: 'POST', body: JSON.stringify(data) });

// ── Controls ─────────────────────────────────────────────────────
export const controlPump = (deviceId: string, action: 'on' | 'off', duration?: number) =>
  request<any>('/api/control/pump', {
    method: 'POST',
    body: JSON.stringify({ deviceId, action, duration }),
  });

export const controlMode = (deviceId: string, mode: 'maintenance' | 'active') =>
  request<any>('/api/control/mode', {
    method: 'POST',
    body: JSON.stringify({ deviceId, mode }),
  });

export const controlTank = (deviceId: string, tankConfig: Record<string, any>) =>
  request<any>('/api/control/tank', {
    method: 'POST',
    body: JSON.stringify({ deviceId, ...tankConfig }),
  });

export interface SensorStatusEntry {
  enabled?: boolean;
  ok?: boolean;
  error?: string;
}

export interface SensorStatusResponse {
  deviceId: string;
  updatedAt?: number;
  ultrasonic?: SensorStatusEntry;
  ph?: SensorStatusEntry;
  ec?: SensorStatusEntry;
  temperature?: SensorStatusEntry;
  air?: SensorStatusEntry;
}

export const fetchSensorStatus = (deviceId: string, refresh = false) =>
  request<SensorStatusResponse>(
    `/api/sensors/status?deviceId=${encodeURIComponent(deviceId)}${refresh ? '&refresh=true' : ''}`
  );

export const calibratePh = (deviceId: string, body: { point: 'mid' | 'low' | 'reset'; standard?: number }) =>
  request<{ ok: boolean; deviceId: string; result: Record<string, unknown> }>('/api/calibrate/ph', {
    method: 'POST',
    body: JSON.stringify({ deviceId, ...body }),
  });

export const calibrateEc = (deviceId: string, body: { point: 'dry' | 'solution' | 'reset'; standard?: number }) =>
  request<{ ok: boolean; deviceId: string; result: Record<string, unknown> }>('/api/calibrate/ec', {
    method: 'POST',
    body: JSON.stringify({ deviceId, ...body }),
  });

// ── OTA ──────────────────────────────────────────────────────────
export interface OtaPayload {
  deviceId: string;
  url: string;
  version: string;
  sha256?: string;
  signature?: string;
}

export const deployOta = (payload: OtaPayload) =>
  request<any>(`/api/ota/deploy`, { method: 'POST', body: JSON.stringify(payload) });

// ── Environment & Diagnostic ───────────────────────────────────
export const sendEnvCommand = (deviceId: string, action: 'light_on' | 'light_off' | 'light_auto' | 'fan_on' | 'fan_off' | 'fan_auto') =>
  request<any>(`/api/control/env`, { method: 'POST', body: JSON.stringify({ deviceId, action }) });

export const sendTestCommand = (deviceId: string, type: 'sensor' | 'relay', id?: number, state?: boolean) =>
  request<any>(`/api/control/test`, { method: 'POST', body: JSON.stringify({ deviceId, type, id, state }) });

export interface SystemAlert {
  id: number;
  device_id: string;
  type: string;
  message: string;
  resolved: boolean;
  created_at: string;
}

export const fetchDiagnostics = () =>
  request<SystemAlert[]>('/api/diagnostics');

export const resolveDiagnostic = (id: number) =>
  request<any>(`/api/diagnostics/${id}`, { method: 'DELETE' });
