import { useEffect, useState } from 'react';
import { useStore } from '../context/OperationalContext';
import { LucideAlertTriangle, LucideShieldCheck, LucideActivity, LucideClock, LucideRefreshCw } from 'lucide-react';

interface AlertItem {
    id: string;
    type: 'SAFE' | 'WARN' | 'CRITICAL' | 'NO_DATA';
    title: string;
    description: string;
    timestamp: string;
}

export default function Alerts() {
    const { activeSite } = useStore();
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWarnings = async () => {
        setLoading(true);
        setError(null);
        try {
            const now = new Date();
            const start = now.toISOString().slice(0, 10);
            const end = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

            const activeAlerts: AlertItem[] = [];

            // 1. Fetch live telemetry (24h Forecast)
            let hasWeatherData = false;
            try {
                const url = new URL(`${baseUrl}/api/weather`);
                url.searchParams.append('lat', activeSite.latitude.toString());
                url.searchParams.append('lon', activeSite.longitude.toString());
                url.searchParams.append('tz', activeSite.timezone);
                url.searchParams.append('start_date', start);
                url.searchParams.append('end_date', end);

                const resWea = await fetch(url.toString());
                if (resWea.ok) {
                    const wjson = await resWea.json();
                    if (wjson.points && wjson.points.length > 0) {
                        hasWeatherData = true;

                        // Check Demo Thresholds (Light 32, Mod 30, Heavy 28)
                        const points = wjson.points;
                        const heavyPeaks = points.filter((p: any) => p.apparent_temperature >= 28.0 && p.apparent_temperature < 30.0);
                        const modPeaks = points.filter((p: any) => p.apparent_temperature >= 30.0 && p.apparent_temperature < 32.0);
                        const extremePeaks = points.filter((p: any) => p.apparent_temperature >= 32.0);

                        if (extremePeaks.length > 0) {
                            activeAlerts.push({
                                id: 'wea_ext', type: 'CRITICAL',
                                title: 'STRUCTURAL THERMAL LIMIT BREACH',
                                description: `Apparent temperature intercepts >32.0°C locally spanning ${extremePeaks.length} hours today. ALL operations must halt.`,
                                timestamp: new Date().toISOString()
                            });
                        }
                        if (modPeaks.length > 0) {
                            activeAlerts.push({
                                id: 'wea_mod', type: 'WARN',
                                title: 'MODERATE TASKS BLOCKED',
                                description: `Forecast exceeds 30.0°C limit for Moderate workloads over ${modPeaks.length} hours.`,
                                timestamp: new Date().toISOString()
                            });
                        }
                        if (heavyPeaks.length > 0) {
                            activeAlerts.push({
                                id: 'wea_hvy', type: 'WARN',
                                title: 'HEAVY WORKLOADS BLOCKED',
                                description: `Forecast exceeds 28.0°C limit for Heavy workloads over ${heavyPeaks.length} hours.`,
                                timestamp: new Date().toISOString()
                            });
                        }

                        // Check Missing Data Nodes in existing 24hr loop
                        const missingP = points.filter((p: any) => p.apparent_temperature === null);
                        if (missingP.length > 0) {
                            activeAlerts.push({
                                id: 'wea_gap', type: 'NO_DATA',
                                title: 'TELEMETRY GAPS DETECTED',
                                description: `${missingP.length} hourly projections failed to intercept Open-Meteo structural bands. Operations defaulting to structural hold.`,
                                timestamp: new Date().toISOString()
                            });
                        }

                    }
                }
            } catch (weaErr) {
                console.error("Forecast trace failed", weaErr);
            }

            if (!hasWeatherData && !activeAlerts.some(a => a.id === 'wea_gap')) {
                activeAlerts.push({
                    id: 'wea_fail', type: 'NO_DATA',
                    title: 'WEATHER API DISCONNECTED',
                    description: `Critical routing failure to global Open-Meteo endpoints for ${activeSite.name}. Structural calculations cannot proceed blindly.`,
                    timestamp: new Date().toISOString()
                });
            }

            // 2. Fetch persistent evaluation history to extract live escalations
            const resHist = await fetch(`${baseUrl}/history?limit=100`);
            if (resHist.ok) {
                const hjson = await resHist.json();

                // Deduplicate history by task name (latest execution only)
                const taskMap = new Map<string, any>();
                (hjson.records || []).forEach((r: any) => {
                    if (!taskMap.has(r.task_name)) taskMap.set(r.task_name, r);
                });

                const latestRecs = Array.from(taskMap.values());
                const reschedRecs = latestRecs.filter(r => r.outcome === 'RESCHEDULE');
                const escalRecs = latestRecs.filter(r => r.outcome === 'ESCALATE');

                if (escalRecs.length > 0) {
                    activeAlerts.push({
                        id: 'hist_esc', type: 'CRITICAL',
                        title: 'NATIVE ESCALATIONS ACTIVE',
                        description: `System permanently denied ${escalRecs.length} distinct pending operations.`,
                        timestamp: escalRecs[0].timestamp
                    });
                }
                if (reschedRecs.length > 0) {
                    activeAlerts.push({
                        id: 'hist_res', type: 'WARN',
                        title: 'SCHEDULE REALIGNMENTS REQUIRED',
                        description: `${reschedRecs.length} operations dynamically shifted into safe thresholds. Review assignments.`,
                        timestamp: reschedRecs[0].timestamp
                    });
                }
            } else {
                throw new Error('History endpoints rejected synchronization trace.');
            }

            // 3. Fetch recent differential shifts from Forecast Monitor
            try {
                const resChange = await fetch(`${baseUrl}/api/forecast/changes?limit=10`);
                if (resChange.ok) {
                    const cjson = await resChange.json();
                    const siteChanges = (cjson.records || []).filter((r: any) => r.site_name === activeSite.name);
                    if (siteChanges.length > 0) {
                        const latestSync = siteChanges[0];
                        const deltas = JSON.parse(latestSync.changes_json || "[]");
                        const increased = deltas.filter((d: any) => d.type === 'INCREASED_RISK' || d.type === 'NEW_POLICY_VIOLATION');

                        if (increased.length > 0) {
                            activeAlerts.push({
                                id: 'monitor_inc', type: 'WARN',
                                title: 'FORECAST DETERIORATION DETECTED',
                                description: `Monitor array traced ${increased.length} temporal structural risk escalations compared to the previous snapshot base. Re-verify dynamically affected operations on the differential tracking panel.`,
                                timestamp: latestSync.timestamp
                            });
                        }
                    }
                }
            } catch (changeErr) {
                console.error("Change monitor trace skipped", changeErr);
            }

            setAlerts(activeAlerts);
        } catch (err: any) {
            console.error("Alerts Fetch Error", err);
            setError(err.message || 'Fatal trace collapse across alert streams.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWarnings();
    }, [activeSite]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Active Warnings & Alerts</h2>
                <button className="btn" onClick={fetchWarnings} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LucideRefreshCw size={16} className={loading ? "spin" : ""} /> Sync Data
                </button>
            </div>

            {loading && alerts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', display: 'flex', gap: '10px', alignItems: 'center', padding: '20px' }}>
                    <LucideRefreshCw size={16} className="spin" /> Intercepting native warnings across evaluation and weather endpoints...
                </div>
            ) : error ? (
                <div className="glass-panel" style={{ padding: '20px', color: 'var(--heat-red)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontWeight: 'bold' }}>
                        <LucideAlertTriangle size={20} /> {error}
                    </div>
                </div>
            ) : alerts.length === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                    <LucideShieldCheck size={40} color="var(--heat-green)" style={{ opacity: 0.8 }} />
                    <div style={{ fontSize: '1.2rem', color: 'var(--heat-green)' }}>NO THERMAL HAZARDS INTERCEPTED</div>
                    <div style={{ color: 'var(--text-muted)' }}>Site {activeSite.name} forecasts are entirely clear of thresholds across all workloads and active tasks.</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px' }}>Last Trace: {new Date().toLocaleTimeString()}</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
                    {alerts.map((alert) => (
                        <div key={alert.id} className="glass-panel" style={{ padding: '20px', borderLeft: `4px solid ${alert.type === 'CRITICAL' ? 'var(--heat-red)' : alert.type === 'NO_DATA' ? 'var(--text-muted)' : 'var(--heat-orange)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ fontSize: '1.1rem', color: alert.type === 'CRITICAL' ? 'var(--heat-red)' : alert.type === 'NO_DATA' ? 'var(--text-main)' : 'var(--heat-orange)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {alert.type === 'CRITICAL' ? <LucideAlertTriangle size={20} /> : alert.type === 'WARN' ? <LucideActivity size={20} /> : <LucideClock size={20} />}
                                    {alert.title}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <div style={{ color: 'var(--text-main)' }}>{alert.description}</div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .spin { animation: spin 2s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
