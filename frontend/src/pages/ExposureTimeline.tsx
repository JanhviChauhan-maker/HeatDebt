import { useEffect, useState } from 'react';
import { useStore } from '../context/OperationalContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function ExposureTimeline() {
    const { activeSite } = useStore();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function fetchWeather() {
            setLoading(true);
            try {
                const now = new Date();
                const start = now.toISOString().slice(0, 10);
                const end = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

                const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                const url = new URL(`${baseUrl}/api/weather`);
                url.searchParams.append('lat', activeSite.latitude.toString());
                url.searchParams.append('lon', activeSite.longitude.toString());
                url.searchParams.append('tz', activeSite.timezone);
                url.searchParams.append('start_date', start);
                url.searchParams.append('end_date', end);

                const res = await fetch(url.toString());
                const json = await res.json();

                if (json.points) {
                    const formatted = json.points.map((p: any) => ({
                        time: new Date(p.timestamp).toLocaleTimeString('en-US', {
                            hour: '2-digit', minute: '2-digit', timeZone: activeSite.timezone
                        }),
                        temperature: p.apparent_temperature,
                        isMissing: p.apparent_temperature === null
                    }));
                    setData(formatted);
                }
            } catch (err) {
                console.error("Timeline Weather Fetch Error", err);
            } finally {
                setLoading(false);
            }
        }
        fetchWeather();
    }, [activeSite]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>

            <div className="glass-panel" style={{ padding: '15px 24px', borderLeft: '4px solid var(--accent-cyan)' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Exposure Risk Forecast</h3>
                <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Continuous mapping of Apparent Temperature (not official WBGT sensors). Demo Threshold currently set at <strong style={{ color: 'var(--heat-red)' }}>30°C (Moderate)</strong>.
                </p>
            </div>

            <div className="glass-panel" style={{ flex: 1, minHeight: '400px', padding: '30px' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        Loading external telemetry...
                    </div>
                ) : data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="time" stroke="var(--text-muted)" />
                            <YAxis domain={['auto', 'auto']} stroke="var(--text-muted)" />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--panel-border)' }} />
                            <Legend />
                            <ReferenceLine y={30} label={{ position: 'insideTopLeft', value: 'DEMO POLICY THRESHOLD', fill: '#ef4444' }} stroke="var(--heat-red)" strokeDasharray="3 3" />
                            <Line
                                type="monotone"
                                name="Apparent Temperature (°C)"
                                dataKey="temperature"
                                stroke="var(--accent-cyan)"
                                strokeWidth={3}
                                dot={{ fill: 'var(--bg-dark)', stroke: 'var(--accent-cyan)', strokeWidth: 2 }}
                                activeDot={{ r: 8 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--heat-orange)' }}>
                        Weather data unavailable for this coordinate.
                    </div>
                )}
            </div>

        </div>
    );
}
