import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSystemStore } from '../../store/useSystemStore';
import { fetchDeviceConfig, updateConfig } from '../../services/api';
import { toast } from 'sonner';
import { Settings, Save, RotateCcw, Loader2, Workflow, TestTube, Gauge, ChevronRight } from 'lucide-react';
import { request } from '../../services/api';

interface ConfigData {
  [key: string]: any;
}

const CONFIG_SECTIONS = [
  {
    title: 'Timing & Sleep',
    fields: [
      { key: 'sensorReadInterval', label: 'Sensor Read Interval (ms)', type: 'number' },
      { key: 'mqttPublishInterval', label: 'MQTT Publish Interval (ms)', type: 'number' },
      { key: 'sleepDurationSec', label: 'Sleep Duration (sec)', type: 'number' },
      { key: 'activeDurationMs', label: 'Active Duration (ms)', type: 'number' },
      { key: 'deepSleepEnabled', label: 'Deep Sleep Enabled', type: 'toggle' },
    ],
  },
  {
    title: 'Irrigation',
    fields: [
      { key: 'pumpMaxOnTime', label: 'Pump Max Runtime (ms)', type: 'number' },
      { key: 'pumpCooldownTime', label: 'Pump Cooldown (ms)', type: 'number' },
    ],
  },
  {
    title: 'Fan Control',
    fields: [
      { key: 'fanEnabled', label: 'Fan Enabled', type: 'toggle' },
      { key: 'airTempMax', label: 'Max Air Temp (°C)', type: 'number', step: 0.1 },
      { key: 'fanHysteresis', label: 'Fan Hysteresis (°C)', type: 'number', step: 0.1 },
    ],
  },
  {
    title: 'Dosing',
    fields: [
      { key: 'dosingEnabled', label: 'pH Dosing Enabled', type: 'toggle' },
      { key: 'dosingPulseMs', label: 'Dosing Pulse (ms)', type: 'number' },
      { key: 'dosingLockoutMs', label: 'Dosing Lockout (ms)', type: 'number' },
      { key: 'nutrientDosingEnabled', label: 'Nutrient Dosing Enabled', type: 'toggle' },
      { key: 'nutrientDoseDelayMs', label: 'Nutrient Dose Delay (ms)', type: 'number' },
    ],
  },
  {
    title: 'Lighting',
    fields: [
      { key: 'lightingEnabled', label: 'Lighting Enabled', type: 'toggle' },
      { key: 'lightOnHour', label: 'Light ON Hour (0-23)', type: 'number' },
      { key: 'lightOffHour', label: 'Light OFF Hour (0-23)', type: 'number' },
    ],
  },
  {
    title: 'Thresholds',
    fields: [
      { key: 'batteryCriticalThreshold', label: 'Battery Critical (V)', type: 'number', step: 0.1 },
      { key: 'emergencyShutdownTemp', label: 'Emergency Shutdown Temp (°C)', type: 'number', step: 0.1 },
      { key: 'ecTargetMin', label: 'EC Target Min (mS/cm)', type: 'number', step: 0.1 },
      { key: 'ecTargetMax', label: 'EC Target Max (mS/cm)', type: 'number', step: 0.1 },
      { key: 'phTargetMin', label: 'pH Target Min', type: 'number', step: 0.1 },
      { key: 'phTargetMax', label: 'pH Target Max', type: 'number', step: 0.1 },
    ],
  },
  {
    title: 'Developer',
    fields: [
      { key: 'test_cmds', label: 'Test Commands Enabled', type: 'toggle' },
    ],
  },
  {
    title: 'External Integrations',
    fields: [
      { key: 'telegram_enabled', label: 'Telegram Alerts Enabled', type: 'toggle' },
      { key: 'telegram_botToken', label: 'Telegram Bot Token', type: 'text' },
      { key: 'telegram_chatId', label: 'Telegram Chat ID', type: 'text' },
      { key: 'discord_enabled', label: 'Discord Alerts Enabled', type: 'toggle' },
      { key: 'discord_webhookUrl', label: 'Discord Webhook URL', type: 'text' },
    ],
  },
];

export default function ConfigurationPage() {
  const { selectedDevice } = useSystemStore();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRelayModal, setShowRelayModal] = useState(false);
  const [testRelayId, setTestRelayId] = useState(0);
  const [targetAllDevices, setTargetAllDevices] = useState(false);

  const loadConfig = async () => {
    if (!selectedDevice) return;
    try {
      setLoading(true);
      const data = await fetchDeviceConfig(selectedDevice);
      setConfig(data);
    } catch {
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfig(); }, [selectedDevice]);

  const handleChange = (key: string, value: any) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const payload = { ...config };
      if (targetAllDevices) {
        payload.allDevices = true;
        delete payload.device_name;
      } else {
        payload.deviceId = selectedDevice;
      }

      await updateConfig(payload);
      toast.success(targetAllDevices ? 'Global configuration broadcasted to all devices' : `Configuration saved for ${selectedDevice}`);
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dimmed)' }}>
        Loading configuration...
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>Configuration</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`status-pill ${selectedDevice ? 'status-pill--active' : 'status-pill--warning'}`} style={{ padding: '4px 10px', fontSize: 12 }}>
              {selectedDevice ? `Targeting: ${selectedDevice}` : 'No device selected'}
            </div>
            {targetAllDevices && (
              <div className="status-pill status-pill--info" style={{ padding: '4px 10px', fontSize: 12 }}>
                Fleet-wide Broadcast Mode
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={loadConfig}>
              <RotateCcw size={15} /> Reload
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: targetAllDevices ? 'var(--info)' : 'var(--text-muted)' }}>
            <input 
              type="checkbox" 
              checked={targetAllDevices} 
              onChange={e => setTargetAllDevices(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Update all devices (Broadcast)
          </label>
        </div>
      </div>

      <section className="config-cal-card" aria-labelledby="cal-heading">
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <div className="config-cal-card__icon" aria-hidden>
            <Gauge size={24} strokeWidth={2} />
          </div>
          <div className="config-cal-card__text">
            <h2 id="cal-heading">Hardware calibration</h2>
            <p>
              Align tank level, pH, and EC probes with a guided workflow. Values are stored on the device and
              used for all readings and automations.
            </p>
          </div>
        </div>
        <div className="config-cal-card__actions">
          <Link to="/calibration" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Open calibration
            <ChevronRight size={18} />
          </Link>
          <span style={{ fontSize: 12, color: 'var(--text-dimmed)', textAlign: 'center' }}>
            Also under <strong style={{ color: 'var(--text-muted)' }}>Calibration</strong> in the menu
          </span>
        </div>
      </section>

      <div className="config-sections">
        {CONFIG_SECTIONS.map((section, idx) => (
          <div key={section.title} className={`card config-section animate-fade-in stagger-${idx + 1}`}>
            <h3 className="config-section-title">
              <Settings size={16} />
              {section.title}
            </h3>
            <div className="config-fields">
              {section.fields.map((field) => (
                <div key={field.key} className="config-field">
                  <label className="input-label">{field.label}</label>
                  {field.type === 'toggle' ? (
                    <div
                      className={`toggle ${config?.[field.key] ? 'toggle-on' : ''}`}
                      onClick={async () => {
                        const newVal = !config?.[field.key];
                        handleChange(field.key, newVal);
                        
                        // Immediately persist if it's the developer test commands toggle
                        if (field.key === 'test_cmds') {
                          try {
                            const payload: any = { [field.key]: newVal };
                            if (targetAllDevices) {
                              payload.allDevices = true;
                            } else {
                              payload.deviceId = selectedDevice;
                            }
                            await updateConfig(payload);
                            toast.success(`Test Commands ${newVal ? 'Enabled' : 'Disabled'} for ${targetAllDevices ? 'all' : selectedDevice}`);
                          } catch {
                            toast.error('Failed to toggle test commands');
                          }
                        }
                      }}
                    >
                      <div className="toggle-thumb" />
                    </div>
                  ) : field.type === 'text' ? (
                    <input
                      className="input"
                      type="text"
                      placeholder={`Enter ${field.label}...`}
                      value={config?.[field.key] ?? ''}
                      onChange={e => handleChange(field.key, e.target.value)}
                    />
                  ) : (
                    <input
                      className="input"
                      type="number"
                      step={field.step || 1}
                      value={config?.[field.key] ?? ''}
                      onChange={e => handleChange(field.key, Number(e.target.value))}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Hardware Diagnostics Card */}
        {config?.test_cmds && (
          <div className={`card config-section animate-fade-in stagger-7`} style={{ gridColumn: '1 / -1' }}>
            <h3 className="config-section-title" style={{ color: 'var(--info)' }}>
              <TestTube size={16} />
              Hardware Diagnostics
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Run direct commands to bypass logic and physically test the hardware relays{/* and sensors*/}.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
         {/*      <button 
                className="btn btn-secondary" 
                onClick={async () => {
                  try {
                    await request('/api/control/test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ deviceId: selectedDevice, type: 'sensor' })
                    });
                    toast.success('Forced a complete sensor reading cycle');
                  } catch { toast.error('Command failed'); }
                }}
              >
                <RotateCcw size={14} /> Force Sensor Read
              </button> */}
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowRelayModal(true)}
              >
                <Workflow size={14} /> Test Relay Panel...
              </button>
            </div>
          </div>
        )}

      </div>

      {showRelayModal && (
        <div 
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100 }} 
          onClick={() => setShowRelayModal(false)}
        >
          <div 
            className="card animate-fade-in-scale" 
            style={{ 
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
              width: '90%', maxWidth: 400, padding: 24, zIndex: 101,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Workflow size={20} color="var(--info)" /> Relay Control Panel
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              Specify a relay ID to physically toggle the connected hardware safely.
            </p>
            
            <div style={{ marginBottom: 20 }}>
              <label className="input-label">Relay ID (0-31)</label>
              <input 
                type="number" 
                className="input" 
                min={0} max={31} 
                value={testRelayId}
                onChange={e => setTestRelayId(Number(e.target.value))}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="btn" 
                style={{ flex: 1, background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' }}
                onClick={async () => {
                  try {
                    await request('/api/control/test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ deviceId: selectedDevice, type: 'relay', id: testRelayId, state: true })
                    });
                    toast.success(`Turned ON Relay ${testRelayId}`);
                  } catch { toast.error('Command failed'); }
                }}
              >
                TURN ON
              </button>
              <button 
                className="btn" 
                style={{ flex: 1, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                onClick={async () => {
                  try {
                    await request('/api/control/test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ deviceId: selectedDevice, type: 'relay', id: testRelayId, state: false })
                    });
                    toast.success(`Turned OFF Relay ${testRelayId}`);
                  } catch { toast.error('Command failed'); }
                }}
              >
                TURN OFF
              </button>
            </div>
            
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowRelayModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .config-sections {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 20px;
        }

        .config-section {
          padding: 24px;
        }

        .config-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 20px 0;
          color: var(--text-primary);
        }

        .config-fields {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .config-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .toggle {
          width: 44px;
          height: 24px;
          border-radius: var(--radius-full);
          background: var(--border-strong);
          cursor: pointer;
          position: relative;
          transition: background var(--transition-fast);
          flex-shrink: 0;
        }

        .toggle-on {
          background: var(--accent);
        }

        .toggle-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          position: absolute;
          top: 3px;
          left: 3px;
          transition: transform var(--transition-fast);
        }

        .toggle-on .toggle-thumb {
          transform: translateX(20px);
        }

        @media (max-width: 600px) {
          .config-sections {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
