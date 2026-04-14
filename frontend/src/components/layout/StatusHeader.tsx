import { useEffect, useState } from 'react';
import { useSystemStore } from '../../store/useSystemStore';
import { Wifi, Radio, Server, Activity, Clock, AlertTriangle, Menu } from 'lucide-react';
import { request } from '../../services/api';

type StatusHeaderProps = {
  /** Opens the navigation drawer on small screens (single top bar — no duplicate mobile header). */
  onMenuClick?: () => void;
};

export function StatusHeader({ onMenuClick }: StatusHeaderProps) {
  const {
    status,
    apiConnected,
    selectedDevice,
    setSelectedDevice,
    availableDevices,
    setAvailableDevices,
    setStatus
  } = useSystemStore();

  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setIsLoadingDevices(true);
        const devs = await request<any[]>('/api/devices');
        setAvailableDevices(devs);
        if (devs.length > 0 && !devs.find((d: any) => d.device_id === selectedDevice)) {
          setSelectedDevice(devs[0].device_id);
        }
      } catch (err) {
        console.error('Failed to load devices', err);
      } finally {
        setIsLoadingDevices(false);
      }
    };
    fetchDevices();
  }, []);

  useEffect(() => {
    if (!selectedDevice) return;

    const fetchStatus = async () => {
      try {
        const data = await request<any>(`/api/devices/${selectedDevice}/status`);
        setStatus({
          state: data.status,
          wifiState: data.wifi === 'connected' ? 'CONNECTED' : 'DISCONNECTED',
          mqttState: data.mqtt === 'connected' ? 'CONNECTED' : (data.mqtt === 'offline' ? 'DISCONNECTED' : 'UNKNOWN') as any,
          pumpState: data.pump === 'ON' ? 'ON' : 'OFF',
          uptime: data.uptime || 0,
          errorCount: data.errors || 0,
          firmwareVersion: data.firmware_version,
        });
      } catch {
        /* polling */
      }
    };

    fetchStatus();
    const intv = setInterval(fetchStatus, 5000);
    return () => clearInterval(intv);
  }, [selectedDevice, setStatus]);

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'CONNECTED':
      case 'ACTIVE':
        return 'var(--success)';
      case 'DISCONNECTED':
      case 'OFF':
      case 'OFFLINE':
        return 'var(--text-muted)';
      case 'ERROR':
      case 'EMERGENCY':
        return 'var(--danger)';
      case 'MAINTENANCE':
      case 'COOLDOWN':
        return 'var(--warning)';
      case 'OTA_UPDATE':
        return 'var(--info)';
      default:
        return 'var(--text-muted)';
    }
  };

  const getSystemStateBgStyle = (state: string) => {
    switch (state) {
      case 'ACTIVE': return { background: 'var(--success-bg)', color: 'var(--success)', borderColor: 'var(--success)' };
      case 'EMERGENCY': return { background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'var(--danger)', animation: 'pulse-glow 2s infinite' };
      case 'MAINTENANCE': return { background: 'var(--warning-bg)', color: 'var(--warning)', borderColor: 'var(--warning)' };
      case 'OTA_UPDATE': return { background: 'var(--info-bg)', color: 'var(--info)', borderColor: 'var(--info)', animation: 'pulse-glow 2s infinite' };
      case 'OFFLINE': return { background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border-strong)' };
      default: return { background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border-strong)' };
    }
  };

  const formatUptime = (seconds: number) => {
    if (!seconds) return '0h 0m';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  return (
    <header className="status-header">
      <div className="status-header__left">
        {onMenuClick && (
          <button
            type="button"
            className="btn mobile-only status-header__menu"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={isLoadingDevices || availableDevices.length === 0}
            className="input"
            aria-label="Active device"
            style={{
              padding: '6px 12px',
              fontSize: 14,
              fontWeight: 600,
              width: '100%',
              maxWidth: 280,
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
              minHeight: 36,
            }}
          >
            {availableDevices.length === 0 ? (
              <option value={selectedDevice}>{selectedDevice || 'No devices'}</option>
            ) : (
              availableDevices.map((d) => (
                <option key={d.device_id} value={d.device_id}>{d.device_id}</option>
              ))
            )}
          </select>
          <div className="status-header__meta">
            <span>Firmware {status.firmwareVersion || '—'}</span>
            <span aria-hidden="true">·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} aria-hidden />
              Uptime {formatUptime(Number(status.uptime) / 1000)}
            </span>
          </div>
        </div>
      </div>

      <div className="status-header__right">
        <div
          style={{
            padding: '4px 12px',
            borderRadius: 9999,
            border: '1px solid',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            ...getSystemStateBgStyle(status.state),
          }}
        >
          <Activity size={14} aria-hidden />
          {status.state}
        </div>

        <div className="status-header__connect" aria-label="Connection status">
          <span title="API">
            <Server size={16} color={apiConnected ? 'var(--success)' : 'var(--text-muted)'} />
          </span>
          <span style={{ width: 1, height: 16, background: 'var(--border-strong)' }} aria-hidden />
          <span title="MQTT">
            <Radio size={16} color={getStatusColor(status.mqttState)} />
          </span>
          <span style={{ width: 1, height: 16, background: 'var(--border-strong)' }} aria-hidden />
          <span title="Device Wi‑Fi">
            <Wifi size={16} color={getStatusColor(status.wifiState)} />
          </span>
        </div>

        {status.errorCount > 0 && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--danger)',
              background: 'var(--danger-bg)',
              padding: '4px 12px',
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <AlertTriangle size={15} aria-hidden />
            {status.errorCount} alerts
          </div>
        )}
      </div>
    </header>
  );
}
