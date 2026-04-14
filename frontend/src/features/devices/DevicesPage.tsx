import { useEffect, useState } from 'react';
import { fetchDevices } from '../../services/api';
import { useSystemStore } from '../../store/useSystemStore';
import { Monitor, Wifi, Clock, Cpu, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function DevicesPage() {
  const { setSelectedDevice, selectedDevice } = useSystemStore();
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const devs = await fetchDevices();
        setDevices(devs);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSelect = (deviceId: string) => {
    setSelectedDevice(deviceId);
    navigate('/');
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'ONLINE') return 'badge-success';
    if (s === 'OFFLINE') return 'badge-neutral';
    if (s === 'ERROR') return 'badge-danger';
    return 'badge-neutral';
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Devices</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Manage and monitor your hydroponic nodes</p>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dimmed)' }}>
          Loading devices...
        </div>
      ) : devices.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <Monitor size={40} style={{ color: 'var(--text-dimmed)', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 500 }}>
            No devices registered yet.
          </p>
          <p style={{ color: 'var(--text-dimmed)', fontSize: 13, marginTop: 4 }}>
            Devices will appear here once they connect via MQTT.
          </p>
        </div>
      ) : (
        <div className="devices-grid">
          {devices.map((dev, idx) => (
            <button
              key={dev.device_id}
              className={`card device-card animate-fade-in stagger-${idx + 1} ${dev.device_id === selectedDevice ? 'device-card-selected' : ''}`}
              onClick={() => handleSelect(dev.device_id)}
            >
              <div className="device-card-header">
                <div className="device-card-icon">
                  <Cpu size={20} />
                </div>
                <span className={`badge ${getStatusBadge(dev.status)}`}>
                  {dev.status || 'UNKNOWN'}
                </span>
              </div>

              <div className="device-card-body">
                <h3 className="device-card-name">{dev.device_id}</h3>
                <div className="device-card-meta">
                  <span><Wifi size={12} /> FW: {dev.firmware_version || '—'}</span>
                  <span><Clock size={12} /> {dev.last_seen ? format(new Date(dev.last_seen), 'MMM dd, HH:mm') : 'Never'}</span>
                </div>
              </div>

              <div className="device-card-action">
                <ChevronRight size={16} />
              </div>
            </button>
          ))}
        </div>
      )}

      <style>{`
        .devices-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .device-card {
          all: unset;
          box-sizing: border-box;
          cursor: pointer;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          transition: all var(--transition-fast);
          position: relative;
        }

        .device-card:hover {
          border-color: var(--border-strong);
          background: var(--bg-card-hover);
        }

        .device-card-selected {
          border-color: var(--accent-border) !important;
          background: var(--accent-bg) !important;
        }

        .device-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .device-card-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          background: var(--info-bg);
          color: var(--info);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .device-card-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .device-card-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .device-card-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          font-size: 12px;
          color: var(--text-dimmed);
        }

        .device-card-meta span {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .device-card-action {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-dimmed);
          opacity: 0;
          transition: opacity var(--transition-fast);
        }

        .device-card:hover .device-card-action {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
