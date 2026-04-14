import { useCallback, useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { useSystemStore } from '../../store/useSystemStore';
import {
  fetchSensorStatus,
  calibratePh,
  calibrateEc,
  controlTank,
  type SensorStatusResponse,
  type SensorStatusEntry,
} from '../../services/api';
import { toast } from 'sonner';
import {
  Loader2,
  RefreshCw,
  Ruler,
  Droplets,
  FlaskConical,
  Thermometer,
  Wind,
} from 'lucide-react';

function SensorDot({ entry }: { entry?: SensorStatusEntry }) {
  const enabled = entry?.enabled;
  const ok = entry?.ok;
  let cls = 'cal-dot cal-dot--off';
  if (enabled && ok) cls = 'cal-dot cal-dot--ok';
  else if (enabled && !ok) cls = 'cal-dot cal-dot--bad';
  return <span className={cls} title={entry?.error || (ok ? 'OK' : enabled ? 'Check sensor' : 'N/A')} />;
}

function OverviewChip({
  label,
  icon: Icon,
  entry,
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties; 'aria-hidden'?: boolean }>;
  entry?: SensorStatusEntry;
}) {
  const enabled = entry?.enabled;
  const ok = entry?.ok;
  let state = 'Not available';
  if (enabled && ok) state = 'Healthy';
  else if (enabled && !ok) state = entry?.error || 'Needs attention';
  return (
    <div className="cal-sensor-chip">
      <span className="cal-sensor-chip__label">{label}</span>
      <div className="cal-sensor-chip__row">
        <SensorDot entry={entry} />
        <Icon size={16} style={{ color: 'var(--text-dimmed)', flexShrink: 0 }} aria-hidden />
        <span className="cal-sensor-chip__state">{state}</span>
      </div>
    </div>
  );
}

function formatUpdatedAt(ts?: number) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function CalibrationPage() {
  const { selectedDevice } = useSystemStore();
  const [status, setStatus] = useState<SensorStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [phStep, setPhStep] = useState(0);
  const [ecStep, setEcStep] = useState(0);
  const [lastPhResult, setLastPhResult] = useState<string | null>(null);
  const [lastEcResult, setLastEcResult] = useState<string | null>(null);
  const [lastTankResult, setLastTankResult] = useState<string | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!selectedDevice) return;
      try {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        const data = await fetchSensorStatus(selectedDevice, refresh);
        setStatus(data);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load sensor status');
        setStatus(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDevice]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  if (!selectedDevice) {
    return (
      <div className="cal-page" style={{ padding: '48px 0', textAlign: 'center' }}>
        <p className="cal-muted">Choose a device in the bar above to run calibration.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cal-page" style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-dimmed)' }}>
        <Loader2 size={22} className="animate-spin" style={{ marginBottom: 12 }} />
        <p className="cal-muted" style={{ margin: 0 }}>Loading sensor health from your controller…</p>
      </div>
    );
  }

  const u = status?.ultrasonic;
  const ph = status?.ph;
  const ec = status?.ec;
  const temp = status?.temperature;
  const air = status?.air;

  return (
    <div className="cal-page">
      <div className="cal-hero">
        <p className="cal-hero__eyebrow">Device hardware</p>
        <h1>Sensor calibration</h1>
        <p className="cal-hero__sub">
          Run factory-quality checks for <strong style={{ color: 'var(--text-primary)' }}>{selectedDevice}</strong>.
          Follow each section in order when you change hardware or solutions.
        </p>
        <div className="cal-hero__toolbar">
          <button type="button" className="btn btn-secondary" disabled={refreshing} onClick={() => load(true)}>
            {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh from device
          </button>
          <span className="cal-hero__updated">
            Last status snapshot: {formatUpdatedAt(status?.updatedAt)}
          </span>
        </div>
      </div>

      <section aria-label="Sensor health overview">
        <h2 className="sr-only">Sensor health</h2>
        <div className="cal-overview">
          <OverviewChip label="Ultrasonic" icon={Ruler} entry={u} />
          <OverviewChip label="pH" icon={Droplets} entry={ph} />
          <OverviewChip label="EC" icon={FlaskConical} entry={ec} />
          <OverviewChip label="Water °C" icon={Thermometer} entry={temp} />
          <OverviewChip label="Air" icon={Wind} entry={air} />
        </div>
      </section>

      {/* Tank */}
      <section className="cal-module" aria-labelledby="mod-tank">
        <div className="cal-module__head">
          <div>
            <h2 className="cal-module__title" id="mod-tank">
              Reservoir level — empty distance
            </h2>
            <p className="cal-module__desc">
              Records the distance from the sensor to the bottom with the tank <strong>empty</strong>. Used with
              live readings to compute volume and fill percentage.
            </p>
          </div>
          <span
            className={`cal-module__badge ${u?.enabled && u?.ok ? 'cal-module__badge--ok' : u?.enabled ? 'cal-module__badge--err' : ''}`}
          >
            {u?.enabled && u?.ok ? 'Ready' : u?.enabled ? 'Fix hardware first' : 'Unavailable'}
          </span>
        </div>
        <div className="cal-module__body">
          {!u?.enabled || !u?.ok ? (
            <p className="cal-muted">
              Ultrasonic must read a valid distance before calibration. Check wiring and clear line of sight to the
              liquid surface.
            </p>
          ) : (
            <>
              <p className="cal-muted" style={{ marginTop: 0 }}>
                Drain the tank, keep the sensor mounted at the top, then capture the empty reference.
              </p>
              <div className="cal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy('tank');
                    setLastTankResult(null);
                    try {
                      const res = await controlTank(selectedDevice, { action: 'calibrate' });
                      const cm = res?.empty_distance_cm;
                      setLastTankResult(
                        typeof cm === 'number'
                          ? `Empty distance stored: ${Number(cm).toFixed(2)} cm`
                          : JSON.stringify(res)
                      );
                      toast.success('Tank reference saved');
                      await load(true);
                    } catch (e: any) {
                      toast.error(e?.message || 'Calibration failed');
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === 'tank' ? <Loader2 size={16} className="animate-spin" /> : null}
                  Record empty tank
                </button>
              </div>
              {lastTankResult && (
                <div className="cal-result cal-result--success" role="status">
                  {lastTankResult}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* pH */}
      <section className="cal-module" aria-labelledby="mod-ph">
        <div className="cal-module__head">
          <div>
            <h2 className="cal-module__title" id="mod-ph">
              pH probe — two-point buffer
            </h2>
            <p className="cal-module__desc">
              Standard two-buffer procedure (pH 7.0 then pH 4.0). Slope and offset are written to device flash.
            </p>
          </div>
          <span
            className={`cal-module__badge ${ph?.enabled ? 'cal-module__badge--ok' : ''}`}
            style={!ph?.enabled ? { opacity: 0.8 } : undefined}
          >
            {ph?.enabled ? 'Analog input enabled' : 'Not enabled'}
          </span>
        </div>
        <div className="cal-module__body">
          {!ph?.enabled ? (
            <p className="cal-muted">This build does not expose a pH ADC channel.</p>
          ) : (
            <>
              <div className="cal-steps" aria-label="Calibration steps">
                <span className={`cal-step-pill ${phStep === 0 ? 'cal-step-pill--active' : phStep > 0 ? 'cal-step-pill--done' : ''}`}>
                  1 · pH 7.0 buffer
                </span>
                <span className={`cal-step-pill ${phStep === 1 ? 'cal-step-pill--active' : ''}`}>
                  2 · pH 4.0 buffer
                </span>
              </div>
              {phStep === 0 && (
                <>
                  <p className="cal-muted" style={{ marginTop: 0 }}>
                    Rinse the probe. Immerse in <strong>pH 7.0</strong> calibration fluid and wait at least 30 seconds
                    for stability, then capture.
                  </p>
                  <div className="cal-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy !== null}
                      onClick={async () => {
                        setBusy('ph-mid');
                        setLastPhResult(null);
                        try {
                          const { result } = await calibratePh(selectedDevice, { point: 'mid', standard: 7.0 });
                          const v = result.raw_voltage;
                          setLastPhResult(
                            typeof v === 'number' ? `Mid point voltage: ${Number(v).toFixed(3)} V` : ''
                          );
                          toast.success('Neutral buffer captured');
                          setPhStep(1);
                        } catch (e: any) {
                          toast.error(e?.message || 'Step failed');
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === 'ph-mid' ? <Loader2 size={16} className="animate-spin" /> : null}
                      Capture pH 7.0
                    </button>
                  </div>
                </>
              )}
              {phStep === 1 && (
                <>
                  <p className="cal-muted" style={{ marginTop: 0 }}>
                    Rinse again. Immerse in <strong>pH 4.0</strong> buffer, wait 30 seconds, then complete calibration.
                  </p>
                  <div className="cal-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy !== null}
                      onClick={() => setPhStep(0)}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy !== null}
                      onClick={async () => {
                        setBusy('ph-low');
                        try {
                          const { result } = await calibratePh(selectedDevice, { point: 'low', standard: 4.0 });
                          const s = result.slope;
                          const o = result.offset;
                          setLastPhResult(
                            `Saved — slope ${typeof s === 'number' ? s.toFixed(4) : s}, offset ${typeof o === 'number' ? o.toFixed(4) : o}`
                          );
                          toast.success('pH calibration complete');
                          setPhStep(0);
                        } catch (e: any) {
                          toast.error(e?.message || 'Step failed');
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === 'ph-low' ? <Loader2 size={16} className="animate-spin" /> : null}
                      Capture pH 4.0 &amp; save
                    </button>
                  </div>
                </>
              )}
              <div className="cal-actions" style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy('ph-reset');
                    try {
                      await calibratePh(selectedDevice, { point: 'reset' });
                      toast.success('Restored default pH coefficients');
                      setPhStep(0);
                      setLastPhResult(null);
                    } catch (e: any) {
                      toast.error(e?.message || 'Reset failed');
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Restore firmware defaults
                </button>
              </div>
              {lastPhResult && (
                <div className="cal-result" role="status">
                  {lastPhResult}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* EC */}
      <section className="cal-module" aria-labelledby="mod-ec">
        <div className="cal-module__head">
          <div>
            <h2 className="cal-module__title" id="mod-ec">
              EC probe — air zero &amp; standard solution
            </h2>
            <p className="cal-module__desc">
              Dry-air baseline, then a known conductivity standard (default <strong>1.413 mS/cm</strong>). Scale is
              stored on the device.
            </p>
          </div>
          <span className={`cal-module__badge ${ec?.enabled ? 'cal-module__badge--ok' : ''}`}>
            {ec?.enabled ? 'Analog input enabled' : 'Not enabled'}
          </span>
        </div>
        <div className="cal-module__body">
          {!ec?.enabled ? (
            <p className="cal-muted">This build does not expose an EC ADC channel.</p>
          ) : (
            <>
              <div className="cal-steps" aria-label="Calibration steps">
                <span className={`cal-step-pill ${ecStep === 0 ? 'cal-step-pill--active' : ecStep > 0 ? 'cal-step-pill--done' : ''}`}>
                  1 · Dry / air
                </span>
                <span className={`cal-step-pill ${ecStep === 1 ? 'cal-step-pill--active' : ''}`}>
                  2 · 1.413 mS/cm
                </span>
              </div>
              {ecStep === 0 && (
                <>
                  <p className="cal-muted" style={{ marginTop: 0 }}>
                    Dry the probe completely and hold in <strong>still air</strong> (not above solution vapour), then
                    capture the zero reference.
                  </p>
                  <div className="cal-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy !== null}
                      onClick={async () => {
                        setBusy('ec-dry');
                        setLastEcResult(null);
                        try {
                          const { result } = await calibrateEc(selectedDevice, { point: 'dry' });
                          const v = result.raw_voltage;
                          setLastEcResult(typeof v === 'number' ? `Air baseline: ${Number(v).toFixed(3)} V` : '');
                          toast.success('Dry reference saved');
                          setEcStep(1);
                        } catch (e: any) {
                          toast.error(e?.message || 'Step failed');
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === 'ec-dry' ? <Loader2 size={16} className="animate-spin" /> : null}
                      Capture dry baseline
                    </button>
                  </div>
                </>
              )}
              {ecStep === 1 && (
                <>
                  <p className="cal-muted" style={{ marginTop: 0 }}>
                    Immerse in <strong>1.413 mS/cm</strong> standard, wait 30 seconds, then apply the scale factor.
                  </p>
                  <div className="cal-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy !== null}
                      onClick={() => setEcStep(0)}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy !== null}
                      onClick={async () => {
                        setBusy('ec-sol');
                        try {
                          const { result } = await calibrateEc(selectedDevice, { point: 'solution', standard: 1.413 });
                          const cc = result.cell_constant;
                          setLastEcResult(
                            `Saved — scale factor ${typeof cc === 'number' ? cc.toFixed(5) : cc}`
                          );
                          toast.success('EC calibration complete');
                          setEcStep(0);
                        } catch (e: any) {
                          toast.error(e?.message || 'Step failed');
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === 'ec-sol' ? <Loader2 size={16} className="animate-spin" /> : null}
                      Apply standard solution
                    </button>
                  </div>
                </>
              )}
              <div className="cal-actions" style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy('ec-reset');
                    try {
                      await calibrateEc(selectedDevice, { point: 'reset' });
                      toast.success('Restored default EC coefficients');
                      setEcStep(0);
                      setLastEcResult(null);
                    } catch (e: any) {
                      toast.error(e?.message || 'Reset failed');
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Restore firmware defaults
                </button>
              </div>
              {lastEcResult && (
                <div className="cal-result" role="status">
                  {lastEcResult}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
