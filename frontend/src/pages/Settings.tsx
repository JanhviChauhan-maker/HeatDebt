import { useState, useCallback } from 'react';
import { useStore } from '../context/OperationalContext';

export default function Settings() {
    const { activeSite, setActiveSite } = useStore();

    // Controlled inputs to prevent direct store mutation on every keystroke
    const [name, setName] = useState(activeSite.name);
    const [lat, setLat] = useState(activeSite.latitude.toString());
    const [lon, setLon] = useState(activeSite.longitude.toString());
    const [tz, setTz] = useState(activeSite.timezone);

    const applyChanges = useCallback(() => {
        setActiveSite({
            ...activeSite,
            name,
            latitude: parseFloat(lat) || 0,
            longitude: parseFloat(lon) || 0,
            timezone: tz
        });
        alert("Sector Configuration Saved Successfully.");
    }, [activeSite, name, lat, lon, tz, setActiveSite]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
            <h2 style={{ margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-main)' }}>System Configuration & Safety Policies</h2>

            <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent-cyan)' }}>
                <h3 style={{ margin: '0 0 15px 0' }}>Active Sector Targeting</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                        <label>Sector Identity</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>IANA Timezone</label>
                        <input type="text" value={tz} onChange={(e) => setTz(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Latitude</label>
                        <input type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Longitude</label>
                        <input type="number" step="0.0001" value={lon} onChange={(e) => setLon(e.target.value)} />
                    </div>
                </div>

                <button
                    onClick={applyChanges}
                    style={{ marginTop: '20px', padding: '10px 20px', background: 'var(--accent-cyan)', color: 'var(--bg-dark)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    Confirm Global Override
                </button>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--heat-orange)' }}>
                <h3 style={{ margin: '0 0 15px 0' }}>Threshold Configurations (Demo Mode)</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                            <strong>Core Safety Metric</strong>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>The active temperature metric mapped against global safety boundaries.</div>
                        </div>
                        <span className="badge cyan">Apparent Temperature (°C)</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                            <strong>Moderate Workload Limit</strong>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>The absolute thermal structural bound for moderate labor evaluations natively tracked by default.</div>
                        </div>
                        <span className="badge amber">30.0 °C</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong>Extreme Heat Boundary</strong>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>The maximum structural limit resulting in absolute ESCALATE outcomes overriding standard rest protocols.</div>
                        </div>
                        <span className="badge red">35.0 °C</span>
                    </div>
                </div>

                <p style={{ marginTop: '15px', fontSize: '0.85rem', color: 'var(--heat-orange)' }}>
                    DEMO POLICY: Limits are hardcoded via Backend native environments (`app/services/safety_rules.py`). Form overrides disabled until fully integrated persistence models propagate globally.
                </p>
            </div>
        </div>
    );
}
