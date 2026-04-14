import { useState } from 'react';
import { sendTestCommand } from '../../services/api';
import { toast } from 'sonner';
import { TerminalSquare, RefreshCw, X } from 'lucide-react';

export function DevMenu({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleRelayTest = async (id: number, state: boolean) => {
    setLoading(`relay-${id}-${state}`);
    try {
      // Hardcoded to main deviceId for now, typical in simple setups. Wait, we should use 'HydroNode_01'
      await sendTestCommand('HydroNode_01', 'relay', id, state);
      toast.success(`Relay ${id} test sequence started`);
    } catch (err: any) {
      toast.error('Test command failed: ' + err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleSensorTest = async () => {
    setLoading('sensor');
    try {
      await sendTestCommand('HydroNode_01', 'sensor');
      toast.success(`Sensor re-read forced`);
    } catch (err: any) {
      toast.error('Test command failed: ' + err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
      background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)',
      border: '1px solid var(--cyan-border)', borderRadius: 12, padding: 20,
      width: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      color: 'var(--text-primary)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TerminalSquare size={18} color="var(--cyan)" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Developer Menu</h3>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
          Ensure "Test Commands" is enabled in Configuration before running hardware diagnostics.
        </p>
        
        <button className="btn" onClick={handleSensorTest} disabled={loading === 'sensor'}>
          <RefreshCw size={14} className={loading === 'sensor' ? 'animate-spin' : ''} /> Force Sensor Update
        </button>

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

        {[
          { id: 0, label: 'Main Pump (0)' },
          { id: 1, label: 'Nutrient A (1)' },
          { id: 2, label: 'Nutrient B (2)' },
          { id: 3, label: 'pH Down (3)' },
          { id: 4, label: 'pH Up (4)' },
          { id: 5, label: 'Light (5)' },
          { id: 6, label: 'Fan (6)' },
        ].map(relay => (
          <div key={relay.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <span>{relay.label}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn" style={{ padding: '4px 8px', fontSize: 12 }} 
                onClick={() => handleRelayTest(relay.id, true)}>ON</button>
              <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} 
                onClick={() => handleRelayTest(relay.id, false)}>OFF</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
