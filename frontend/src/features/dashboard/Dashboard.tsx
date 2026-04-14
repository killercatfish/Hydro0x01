import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { SensorCard } from '../../components/SensorCard';
import {
  Thermometer, Wind, Droplets, Battery, Gauge, FlaskConical,
} from 'lucide-react';

const getStatus = (val: number | undefined, min: number, max: number, critMin: number, critMax: number) => {
  if (val === undefined || isNaN(val)) return 'unknown' as const;
  if (val <= critMin || val >= critMax) return 'critical' as const;
  if (val <= min || val >= max) return 'warning' as const;
  return 'normal' as const;
};

export default function DashboardPage() {
  const { latestData, history } = useTelemetryStore();

  const g = (k1: string, k2: string) => latestData?.[k1] ?? latestData?.[k2];

  const waterTemp = g('water_temperature', 'water_temp');
  const airTemp = g('air_temperature', 'air_temp');
  const humidity = g('air_humidity', 'humidity');
  const waterLevel = g('water_level', 'water_level_percent');
  const battery = g('power_battery', 'battery_voltage');
  const pressure = g('air_pressure', 'pressure');
  const waterEC = g('water_ec', 'ec');
  const waterPH = g('water_ph', 'ph');

  const trends = useMemo(() => ({
    waterTemp: history.map(h => h.water_temperature ?? h.water_temp).filter(v => v !== undefined),
    airTemp: history.map(h => h.air_temperature ?? h.air_temp).filter(v => v !== undefined),
    humidity: history.map(h => h.air_humidity ?? h.humidity).filter(v => v !== undefined),
    waterLevel: history.map(h => h.water_level ?? h.water_level_percent).filter(v => v !== undefined),
    battery: history.map(h => h.power_battery ?? h.battery_voltage).filter(v => v !== undefined),
    pressure: history.map(h => h.air_pressure ?? h.pressure).filter(v => v !== undefined),
    waterEC: history.map(h => h.water_ec ?? h.ec).filter(v => v !== undefined),
    waterPH: history.map(h => h.water_ph ?? h.ph).filter(v => v !== undefined),
  }), [history]);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>System Overview</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Real-time telemetry from your hydroponic system</p>
      </div>

      <div className="sensor-grid">
        <SensorCard
          name="Water Temp" value={waterTemp} unit="°C" icon={Thermometer}
          trend={trends.waterTemp} status={getStatus(waterTemp, 18, 25, 15, 28)}
          className="animate-fade-in stagger-1"
        />
        <SensorCard
          name="Air Temp" value={airTemp} unit="°C" icon={Thermometer}
          trend={trends.airTemp} status={getStatus(airTemp, 20, 30, 15, 35)}
          className="animate-fade-in stagger-2"
        />
        <SensorCard
          name="Humidity" value={humidity} unit="%" icon={Wind}
          trend={trends.humidity} status={getStatus(humidity, 40, 70, 30, 80)}
          className="animate-fade-in stagger-3"
        />
        <SensorCard
          name="Water Level" value={waterLevel} unit="%" icon={Droplets}
          trend={trends.waterLevel} status={getStatus(waterLevel, 30, 95, 15, 100)}
          className="animate-fade-in stagger-4"
        />
        <SensorCard
          name="Water EC" value={waterEC} unit="mS/cm" icon={FlaskConical}
          trend={trends.waterEC} status={getStatus(waterEC, 1.2, 2.5, 0.5, 3.5)}
          className="animate-fade-in stagger-5"
        />
        <SensorCard
          name="Water pH" value={waterPH} unit="pH" icon={FlaskConical}
          trend={trends.waterPH} status={getStatus(waterPH, 5.5, 6.5, 4.0, 8.0)}
          className="animate-fade-in stagger-6"
        />
        <SensorCard
          name="Battery" value={battery} unit="V" icon={Battery}
          trend={trends.battery} status={getStatus(battery, 11.5, 14.5, 11.0, 15.0)}
          className="animate-fade-in stagger-7"
        />
        <SensorCard
          name="Pressure" value={pressure} unit="hPa" icon={Gauge}
          trend={trends.pressure} status={getStatus(pressure, 950, 1050, 900, 1100)}
          className="animate-fade-in stagger-8"
        />
      </div>

      <style>{`
        .sensor-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        @media (max-width: 1200px) {
          .sensor-grid { grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 900px) {
          .sensor-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 600px) {
          .sensor-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
