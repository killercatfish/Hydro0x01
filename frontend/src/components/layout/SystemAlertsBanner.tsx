import { useState, useEffect } from 'react';
import { fetchDiagnostics, resolveDiagnostic } from '../../services/api';
import type { SystemAlert } from '../../services/api';
import { AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';

export function SystemAlertsBanner() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const loadAlerts = async () => {
    try {
      const data = await fetchDiagnostics();
      setAlerts(data);
    } catch (err) {
      console.error('Failed to load diagnostics', err);
    }
  };

  useEffect(() => {
    loadAlerts();
    const handleAlertEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const payload = customEvent.detail;
      if (payload.type?.startsWith('alert_')) {
        // Only toast if it's not a noise alert (optional check here too)
        if (!payload.data.message.includes("Test commands disabled")) {
           toast.warning(`System Issue: ${payload.data.message}`);
        }
        loadAlerts();
      }
    };
    window.addEventListener('hydro:alert', handleAlertEvent);
    return () => window.removeEventListener('hydro:alert', handleAlertEvent);
  }, []);

  const handleResolve = async (id: number) => {
    // Optimistic UI: remove immediately
    setAlerts(prev => prev.filter(a => a.id !== id));
    try {
      await resolveDiagnostic(id);
    } catch (err) {
      toast.error('Failed to resolve alert');
      loadAlerts(); // Rollback on error
    }
  };

  if (alerts.length === 0) return null;

  // 1. Group and deduplicate alerts
  const groupedAlerts = alerts.reduce((acc, alert) => {
    const key = `${alert.device_id}:${alert.message}`;
    if (!acc[key]) {
      acc[key] = { ...alert, count: 1, ids: [alert.id] };
    } else {
      acc[key].count++;
      acc[key].ids.push(alert.id);
    }
    return acc;
  }, {} as Record<string, SystemAlert & { count: number; ids: number[] }>);

  const uniqueAlerts = Object.values(groupedAlerts);
  const displayAlerts = isExpanded ? uniqueAlerts : [uniqueAlerts[0]];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', 
      background: 'var(--bg-app)', borderBottom: '1px solid var(--border-strong)',
      maxHeight: isExpanded ? '400px' : 'auto', overflowY: isExpanded ? 'auto' : 'visible',
      transition: 'all 0.3s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: uniqueAlerts.length > 1 ? 4 : 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          System Notifications {uniqueAlerts.length > 1 && `(${uniqueAlerts.length} unique issues)`}
        </div>
        {uniqueAlerts.length > 1 && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
          >
            {isExpanded ? 'Collapse' : `View all ${uniqueAlerts.length}`}
          </button>
        )}
      </div>

      {displayAlerts.map(alert => (
        <div key={`${alert.device_id}-${alert.message}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          background: 'var(--card-bg)',
          border: `1px solid ${alert.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'var(--border)'}`,
          padding: '10px 14px', borderRadius: 10, color: 'var(--text-primary)',
          boxShadow: 'var(--shadow-sm)', position: 'relative',
          animation: 'slideIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 32, height: 32, borderRadius: '50%', 
              backgroundColor: alert.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(234, 179, 8, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <AlertCircle size={18} color={alert.type === 'error' ? '#ef4444' : '#eab308'} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {alert.device_id}
                {alert.count > 1 && (
                  <span style={{ 
                    fontSize: 10, padding: '1px 6px', borderRadius: 10, 
                    background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' 
                  }}>
                    {alert.count} instances
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {alert.message}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => Promise.all(alert.ids.map(id => handleResolve(id)))} 
              className="btn-ghost"
              style={{ padding: 6, borderRadius: '50%' }}
              title="Resolve all instances"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
