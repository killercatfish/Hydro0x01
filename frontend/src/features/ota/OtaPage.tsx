import { useState } from 'react';
import { useSystemStore } from '../../store/useSystemStore';
import { deployOta } from '../../services/api';
import { toast } from 'sonner';
import { Upload, Shield, ShieldAlert, Loader2, Lock, ExternalLink, Terminal } from 'lucide-react';

export default function OtaPage() {
  const { selectedDevice } = useSystemStore();
  const [url, setUrl] = useState('');
  const [version, setVersion] = useState('');
  const [sha256, setSha256] = useState('');
  const [signature, setSignature] = useState('');
  const [isSecure, setIsSecure] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const handleDeploy = async () => {
    if (!selectedDevice) { toast.error('No device selected'); return; }
    if (!url || !version) { toast.error('URL and version are required'); return; }
    if (isSecure && (!sha256 || !signature)) { toast.error('SHA256 and Signature required for secure mode'); return; }

    setDeploying(true);
    try {
      await deployOta({
        deviceId: selectedDevice,
        url,
        version,
        ...(isSecure && { sha256, signature })
      });

      toast.success(
        <div>
          <strong>OTA Initiated</strong>
          <div style={{ fontSize: 11, fontFamily: 'monospace', marginTop: 4, opacity: 0.7 }}>
            {isSecure ? `Sig: ${signature.slice(0, 24)}...` : 'Unsigned update dispatched'}
          </div>
        </div>
      );

      setSignature('');
      setSha256('');
    } catch (e: any) {
      toast.error(e.message || 'OTA deployment failed');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>OTA Firmware Update</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Deploy firmware updates over-the-air to <strong style={{ color: 'var(--text-primary)' }}>{selectedDevice || '—'}</strong>
        </p>
      </div>

      <div style={{ maxWidth: 640 }}>
        <div className="card animate-fade-in" style={{ padding: 28 }}>
          {/* Header with security toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={18} style={{ color: 'var(--cyan)' }} />
                Deploy Firmware
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Enter the firmware binary URL and target version.
              </p>
            </div>
            <button
              className="btn-icon"
              onClick={() => setIsSecure(!isSecure)}
              title="Toggle Secure OTA"
              style={{
                padding: 10,
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isSecure ? 'var(--cyan)' : 'var(--border-default)'}`,
                background: isSecure ? 'var(--cyan-bg)' : 'transparent',
                color: isSecure ? 'var(--cyan)' : 'var(--text-dimmed)',
              }}
            >
              {isSecure ? <Shield size={18} /> : <ShieldAlert size={18} />}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label className="input-label">
                <ExternalLink size={12} /> Firmware URL
              </label>
              <input
                className="input"
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://releases.example.com/firmware_v1.2.0.bin"
              />
            </div>

            <div>
              <label className="input-label">Version</label>
              <input
                className="input"
                type="text"
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="1.2.0"
              />
            </div>

            {isSecure && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
                <div className="badge badge-info" style={{ alignSelf: 'flex-start' }}>
                  <Lock size={11} /> Secure Mode — Pre-signed Payload
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-muted)', background: 'var(--cyan-bg)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--cyan-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontWeight: 500, color: 'var(--text-primary)' }}>
                    <Terminal size={14} /> Offline Signing
                  </div>
                  Sign the firmware locally using <code>firmware/scripts/sign_firmware.py</code>, then paste the resulting SHA256 Hash and Base64 Signature below.
                </div>

                <div>
                  <label className="input-label" style={{ color: 'var(--cyan)' }}>SHA256 Hash</label>
                  <input
                    className="input"
                    type="text"
                    value={sha256}
                    onChange={e => setSha256(e.target.value)}
                    placeholder="e.g. a1b2c3d4e5f6...64 character hex string"
                    style={{ borderColor: 'rgba(6, 182, 212, 0.2)' }}
                  />
                </div>

                <div>
                  <label className="input-label" style={{ color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Base64 Signature
                  </label>
                  <textarea
                    className="input"
                    value={signature}
                    onChange={e => setSignature(e.target.value)}
                    placeholder="Paste the Base64 RSA-SHA256 signature..."
                    rows={4}
                    style={{ borderColor: 'rgba(6, 182, 212, 0.2)', fontFamily: 'monospace', fontSize: 11 }}
                  />
                </div>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ marginTop: 8, width: '100%', padding: '14px 20px', background: 'var(--cyan)', fontSize: 15 }}
              onClick={handleDeploy}
              disabled={deploying || !url || !version || (isSecure && (!sha256 || !signature))}
            >
              {deploying ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {deploying ? 'Deploying...' : (isSecure ? 'Deploy Signed Firmware' : 'Deploy Firmware')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
