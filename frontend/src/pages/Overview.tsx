import { useEffect, useState } from 'react';
import { useStore } from '../context/OperationalContext';

export default function Overview() {
    const { activeSite } = useStore();
    const [currentTemp, setCurrentTemp] = useState<number | null>(null);
    const [stats, setStats] = useState({ total: 0, safe: 0, escalated: 0, rescheduled: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchOverview() {
            setLoading(true);
            try {
                const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

                // Fetch recent history
                const resHist = await fetch(`${baseUrl}/history?limit=100`);
                if (resHist.ok) {
                    const json = await resHist.json();
                    const records = json.records || [];
                    setStats({
                        total: records.length,
                        safe: records.filter((r: any) => r.outcome === 'PROCEED').length,
                        escalated: records.filter((r: any) => r.outcome === 'ESCALATE').length,
                        rescheduled: records.filter((r: any) => r.outcome === 'RESCHEDULE').length,
                    });
                }

                // Fetch current weather
                const now = new Date();
                const start = now.toISOString().slice(0, 10);
                const end = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
                        setCurrentTemp(wjson.points[0].apparent_temperature);
                    } else {
                        setCurrentTemp(null);
                    }
                } else {
                    setCurrentTemp(null);
                }
            } catch (err) {
                console.error("Overview Fetch Error", err);
            } finally {
                setLoading(false);
            }
        }
        fetchOverview();
    }, [activeSite]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
            <h2 style={{ margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-main)' }}>Operations Overview</h2>

            {loading ? (
                <div style={{ color: 'var(--text-muted)' }}>Syncing telemetry...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent-cyan)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Sector: {activeSite.name}</div>
                        <div style={{ fontSize: '2rem', color: 'var(--text-main)', marginTop: '10px' }}>
                            {currentTemp !== null ? `${currentTemp.toFixed(1)}°C` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Current Apparent Temperature</div>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--heat-orange)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Tasks Evaluated</div>
                        <div style={{ fontSize: '2rem', color: 'var(--text-main)', marginTop: '10px' }}>
                            {stats.total}
                        </div>
                        <div style={{ display: 'flex', gap: '15px', marginTop: '10px', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--heat-green)' }}>SAFE: {stats.safe}</span>
                            <span style={{ color: 'var(--heat-orange)' }}>RESCHED: {stats.rescheduled}</span>
                            <span style={{ color: 'var(--heat-red)' }}>DENIED: {stats.escalated}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ flex: 1, padding: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0' }}>Engine Status</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    The Heat Intelligence Platform is connected and operating under strict deterministic algorithms.
                    Ensure Operations Planners target timezone-aware parameters.
                </p>
                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                    <span className="badge cyan">SQLite Tracking Active</span>
                    <span className="badge green">Live Forecasting Enabled</span>
                </div>
            </div>
        </div>
    );
}
