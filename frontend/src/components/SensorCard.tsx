import { useMemo } from 'react';
import {
  Thermometer, Droplets, Wind, Battery, Gauge, FlaskConical, type LucideIcon
} from 'lucide-react';

interface SensorCardProps {
  name: string;
  value?: number | string;
  unit: string;
  icon?: LucideIcon | string;
  status?: 'normal' | 'warning' | 'critical' | 'unknown';
  trend?: number[];
  className?: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  temp: Thermometer,
  waterTemp: Thermometer,
  humidity: Wind,
  waterLevel: Droplets,
  battery: Battery,
  pressure: Gauge,
  ph: FlaskConical,
  ec: FlaskConical,
};

export function SensorCard({ name, value, unit, icon, status = 'normal', trend, className = '' }: SensorCardProps) {
  const Icon = typeof icon === 'string' ? ICON_MAP[icon] || Gauge : icon || Gauge;

  const statusColors = {
    normal: { dot: 'var(--success)', bg: 'var(--success-bg)', border: '#10b98125' },
    warning: { dot: 'var(--warning)', bg: 'var(--warning-bg)', border: '#f59e0b25' },
    critical: { dot: 'var(--danger)', bg: 'var(--danger-bg)', border: '#ef444425' },
    unknown: { dot: 'var(--text-dimmed)', bg: 'transparent', border: 'var(--border-default)' },
  };

  const sc = statusColors[status];

  // Mini sparkline SVG
  const sparklinePath = useMemo(() => {
    if (!trend || trend.length < 2) return null;
    const width = 80;
    const height = 28;
    const padding = 2;
    const numbers = trend.filter(v => typeof v === 'number' && !isNaN(v));
    if (numbers.length < 2) return null;

    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const range = max - min || 1;

    const points = numbers.map((v, i) => {
      const x = padding + (i / (numbers.length - 1)) * (width - padding * 2);
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    });

    return `M${points.join(' L')}`;
  }, [trend]);

  const displayValue = value !== undefined && value !== null && value !== '--'
    ? (typeof value === 'number' ? value.toFixed(1) : value)
    : '—';

  return (
    <div className={`sensor-card card ${className}`} style={{ borderColor: sc.border }}>
      <div className="sensor-card-header">
        <div className="sensor-card-icon" style={{ background: sc.bg, color: sc.dot }}>
          <Icon size={18} />
        </div>
        <div className="sensor-card-status">
          <div className="status-dot" style={{ background: sc.dot }} />
        </div>
      </div>

      <div className="sensor-card-body">
        <div className="sensor-card-value">
          <span className="sensor-value-num">{displayValue}</span>
          <span className="sensor-value-unit">{unit}</span>
        </div>
        <div className="sensor-card-name">{name}</div>
      </div>

      {sparklinePath && (
        <div className="sensor-card-sparkline">
          <svg viewBox="0 0 80 28" preserveAspectRatio="none">
            <path
              d={sparklinePath}
              fill="none"
              stroke={sc.dot}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.6}
            />
          </svg>
        </div>
      )}

      <style>{`
        .sensor-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: relative;
          overflow: hidden;
          min-height: 140px;
        }

        .sensor-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sensor-card-icon {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sensor-card-status .status-dot {
          width: 7px;
          height: 7px;
        }

        .sensor-card-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .sensor-card-value {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .sensor-value-num {
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1;
          color: var(--text-primary);
        }

        .sensor-value-unit {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-muted);
        }

        .sensor-card-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-muted);
        }

        .sensor-card-sparkline {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 30px;
          opacity: 0.5;
        }

        .sensor-card-sparkline svg {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
}
