import { useEffect, useState } from 'react';
import { useStore } from '../context/OperationalContext';
import { LucideRefreshCw, LucideAlertTriangle, LucideClock, LucideActivity, LucideThermometerSun } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ForecastMonitor() {
    const { activeSite } = useStore();
    const [changes, setChanges] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchChangeFeed = async () => {
        setLoading(true);
        setError(null);
        try {
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const res = await fetch(`${baseUrl}/api/forecast/changes?limit=50`);
            if (!res.ok) throw new Error('API disconnected or returned formatting violation.');
            const json = await res.json();

            // Filter to current site
            const siteChanges = (json.records || []).filter((r: any) => r.site_name === activeSite.name);
            setChanges(siteChanges);
        } catch (err: any) {
            console.error("Forecast Change Fetch Error", err);
            setError(err.message || 'Fatal data stream rejection.');
        } finally {
            setLoading(false);
        }
    };

    const triggerRefresh = async () => {
        setRefreshing(true);
        setError(null);
        try {
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const res = await fetch(`${baseUrl}/api/forecast/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(activeSite)
            });
            if (!res.ok) throw new Error('Refresh request rejected by backend.');
            await fetchChangeFeed();
        } catch (err: any) {
            console.error("Forecast Refresh Error", err);
            setError(err.message || 'Failed to trigger site projection refresh.');
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchChangeFeed();
    }, [activeSite]);

    // Derived states from the LATEST snapshot (first item in feed if exists)
    const latestSync = changes.length > 0 ? changes[0] : null;
    let latestAffectedTasks: any[] = [];
    let latestDeltas: any[] = [];

    if (latestSync) {
        try {
            latestAffectedTasks = JSON.parse(latestSync.affected_tasks_json || "[]");
            latestDeltas = JSON.parse(latestSync.changes_json || "[]");
        } catch (e) {
            console.error("Error parsing snapshot json");
        }
    }

    const increasedRiskCount = latestDeltas.filter(d => d.type === 'INCREASED_RISK' || d.type === 'NEW_POLICY_VIOLATION').length;

    // For charting: take all detected changes in latest sync
    const chartData = latestDeltas.map(d => ({
        time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        prev: d.prev ? parseFloat(d.prev.toFixed(1)) : 0,
        curr: d.curr ? parseFloat(d.curr.toFixed(1)) : 0
    }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
            <div className="glass-panel" style={{ padding: '15px 24px', borderLeft: '4px solid var(--accent-cyan)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <LucideActivity size={18} /> Forecast Change Monitor
                    </h3>
                    <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        Tracking thermal trajectory shifts and deterministic impacts on assigned workloads for <strong>{activeSite.name}</strong>.
                    </p>
                </div>
                <button className="btn" onClick={triggerRefresh} disabled={refreshing || loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LucideRefreshCw size={16} className={refreshing ? "spin" : ""} /> Enforce Sync
                </button>
            </div>

            {loading && changes.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', display: 'flex', gap: '10px', alignItems: 'center', padding: '20px' }}>
                    <LucideRefreshCw size={16} className="spin" /> Synchronizing differential monitor buffers...
                </div>
            ) : error ? (
                <div className="glass-panel" style={{ padding: '20px', color: 'var(--heat-red)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontWeight: 'bold' }}>
                        <LucideAlertTriangle size={20} /> {error}
                    </div>
                </div>
            ) : changes.length === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <LucideClock size={40} style={{ opacity: 0.2, marginBottom: '15px' }} />
                    <div>Collecting baseline forecast against deterministic operations.</div>
                    <div style={{ fontSize: '0.85rem', marginTop: '10px' }}>Change detection will be active after the next automated or forced global refresh.</div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

                    {/* Summary Cards */}
                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Detected Variations</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{latestDeltas.length}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>From latest snapshot ({new Date(latestSync.timestamp).toLocaleTimeString()})</div>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Risk Growth Vectors</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: increasedRiskCount > 0 ? 'var(--heat-red)' : 'var(--text-main)' }}>{increasedRiskCount}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Forecast periods intercepting higher thresholds</div>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Affected Operations</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: latestAffectedTasks.length > 0 ? 'var(--heat-orange)' : 'var(--text-main)' }}>{latestAffectedTasks.length}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Future assignments requiring immediate review</div>
                    </div>

                    {/* Chart Comparison */}
                    {chartData.length > 0 && (
                        <div className="glass-panel" style={{ padding: '20px', gridColumn: '1 / -1' }}>
                            <h4 style={{ margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><LucideThermometerSun size={18} /> Apparent Temperature Delta</h4>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={chartData} margin={{ left: -20, right: 10, top: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="time" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                                    <YAxis allowDecimals={false} stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--panel-border)', fontSize: '0.85rem' }} />
                                    <Bar dataKey="prev" name="Previous Forecast (°C)" fill="rgba(255,255,255,0.2)" radius={[2, 2, 0, 0]} />
                                    <Bar dataKey="curr" name="Latest Forecast (°C)" fill="var(--accent-cyan)" radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Affected Tasks */}
                    {latestAffectedTasks.length > 0 && (
                        <div className="glass-panel" style={{ padding: '20px', gridColumn: '1 / -1', borderLeft: '3px solid var(--heat-orange)' }}>
                            <h4 style={{ margin: '0 0 15px 0' }}>Dynamically Affected Operations</h4>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                                Forecast fluctuations have altered the deterministic pathway of these actively scheduled assignments.
                                Note: These recalculations are strictly advisory and do not overwrite your native history. You must explicitly evaluate through the Planner to enact changes.
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {latestAffectedTasks.map((t, i) => (
                                    <div key={i} style={{ background: 'var(--bg-dark)', padding: '12px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t.task_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Workload Profile: {t.workload.toUpperCase()}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                Previous State: <span style={{ color: t.previous_outcome === 'PROCEED' ? 'var(--heat-green)' : 'var(--heat-orange)' }}>{t.previous_outcome}</span>
                                            </div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                                Latest Viability: <span style={{ color: t.new_outcome === 'PROCEED' ? 'var(--heat-green)' : 'var(--heat-orange)' }}>{t.new_outcome}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Change Feed */}
                    {latestDeltas.length > 0 && (
                        <div className="glass-panel" style={{ padding: '20px', gridColumn: '1 / -1' }}>
                            <h4 style={{ margin: '0 0 15px 0' }}>Forecaster Shift Events</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {latestDeltas.map((d, i) => (
                                    <div key={i} style={{
                                        padding: '12px 15px',
                                        background: 'var(--bg-dark)',
                                        borderRadius: '4px',
                                        borderLeft: `3px solid ${d.type.includes('RISK') || d.type.includes('VIOLATION') ? 'var(--heat-red)' : d.type === 'MISSING_DATA' ? 'var(--text-muted)' : 'var(--heat-green)'}`
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{new Date(d.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</strong>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>{d.type.replace(/_/g, ' ')}</span>
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            {d.description}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                .spin { animation: spin 2s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
