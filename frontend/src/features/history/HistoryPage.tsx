import { useEffect, useState } from 'react';
import { useSystemStore } from '../../store/useSystemStore';
import { fetchTelemetry } from '../../services/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const RANGES = ['1h', '6h', '12h', '24h', '3d', '7d'] as const;

export default function HistoryPage() {
  const { selectedDevice } = useSystemStore();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('24h');

  useEffect(() => {
    if (!selectedDevice) return;

    const load = async () => {
      setLoading(true);
      try {
        const json = await fetchTelemetry(selectedDevice, range);

        // Pivot rows into time-series objects
        const pivoted: Record<string, any> = {};
        json.data?.forEach((row: any) => {
          const tsKey = new Date(row.timestamp).toISOString();
          if (!pivoted[tsKey]) pivoted[tsKey] = { timestamp: tsKey };
          pivoted[tsKey][row.sensor] = row.value;
        });

        const sorted = Object.values(pivoted).sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const fmt = ['3d', '7d'].includes(range) ? 'MM/dd HH:mm' : 'HH:mm';
        const ready = sorted.map(d => ({
          ...d,
          timeLabel: format(new Date(d.timestamp), fmt),
        }));

        setData(ready);
      } catch {
        toast.error('Failed to fetch historical data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [selectedDevice, range]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ color: entry.color, fontSize: 13, fontWeight: 600, margin: '2px 0' }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
          </p>
        ))}
      </div>
    );
  };

  const chartStyle = {
    cartesian: { strokeDasharray: '3 3', stroke: 'var(--border-default)', vertical: false as const },
    xAxis: { stroke: 'var(--text-dimmed)', fontSize: 11, tickMargin: 8 },
    yAxis: { stroke: 'var(--text-dimmed)', fontSize: 11 },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>History</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Historical telemetry for <strong style={{ color: 'var(--text-primary)' }}>{selectedDevice || '—'}</strong>
          </p>
        </div>
        <select
          className="select"
          style={{ maxWidth: 180 }}
          value={range}
          onChange={e => setRange(e.target.value)}
        >
          {RANGES.map(r => (
            <option key={r} value={r}>
              {r === '1h' ? 'Past 1 Hour' : r === '6h' ? 'Past 6 Hours' : r === '12h' ? 'Past 12 Hours' : r === '24h' ? 'Past 24 Hours' : r === '3d' ? 'Past 3 Days' : 'Past 7 Days'}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 80, textAlign: 'center', color: 'var(--text-dimmed)' }}>
          Querying InfluxDB telemetry...
        </div>
      ) : data.length === 0 ? (
        <div className="card" style={{ padding: 80, textAlign: 'center', color: 'var(--text-dimmed)' }}>
          No historical telemetry found for this device and time range.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Temperature */}
          <div className="card animate-fade-in stagger-1" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, marginLeft: 4 }}>Temperature (°C)</h3>
            <div style={{ height: 280, width: '100%' }}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid {...chartStyle.cartesian} />
                  <XAxis dataKey="timeLabel" {...chartStyle.xAxis} minTickGap={30} />
                  <YAxis {...chartStyle.yAxis} domain={['auto', 'auto']} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" name="Water Temp" dataKey={(d: any) => d.water_temperature ?? d.water_temp} stroke="var(--chart-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" name="Air Temp" dataKey={(d: any) => d.air_temperature ?? d.air_temp} stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hydration */}
          <div className="card animate-fade-in stagger-2" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, marginLeft: 4 }}>Hydration</h3>
            <div style={{ height: 280, width: '100%' }}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid {...chartStyle.cartesian} />
                  <XAxis dataKey="timeLabel" {...chartStyle.xAxis} minTickGap={30} />
                  <YAxis yAxisId="left" {...chartStyle.yAxis} domain={[0, 100]} />
                  <YAxis yAxisId="right" orientation="right" {...chartStyle.yAxis} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" name="Water Level (%)" dataKey={(d: any) => d.water_level ?? d.water_level_percent} stroke="var(--chart-6)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" name="Humidity (%)" dataKey={(d: any) => d.air_humidity ?? d.humidity} stroke="var(--chart-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* EC & pH */}
          <div className="card animate-fade-in stagger-3" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, marginLeft: 4 }}>Nutrient Balance (EC & pH)</h3>
            <div style={{ height: 280, width: '100%' }}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid {...chartStyle.cartesian} />
                  <XAxis dataKey="timeLabel" {...chartStyle.xAxis} minTickGap={30} />
                  <YAxis yAxisId="ec" {...chartStyle.yAxis} domain={[0, 5]} tickFormatter={(v: number) => `${v} mS`} />
                  <YAxis yAxisId="ph" orientation="right" {...chartStyle.yAxis} domain={[3, 10]} tickFormatter={(v: number) => `${v} pH`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="ec" type="monotone" name="Water EC" dataKey={(d: any) => d.water_ec ?? d.ec} stroke="var(--chart-4)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId="ph" type="monotone" name="Water pH" dataKey={(d: any) => d.water_ph ?? d.ph} stroke="var(--chart-5)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
