import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LineChart, Line } from 'recharts';
import { LucideAlertTriangle, LucideRefreshCw } from 'lucide-react';

export default function Analytics() {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAnalytics = async () => {
        setLoading(true);
        setError(null);
        try {
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const res = await fetch(`${baseUrl}/history?limit=1000`);
            if (!res.ok) throw new Error('API disconnected or returned formatting violation.');
            const json = await res.json();
            setRecords(json.records || []);
        } catch (err: any) {
            console.error("Analytics Fetch Error", err);
            setError(err.message || 'Fatal data stream rejection.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, []);

    // Aggregations
    const total = records.length;
    const safeCount = records.filter(r => r.outcome === 'PROCEED').length;
    const reschedCount = records.filter(r => r.outcome === 'RESCHEDULE').length;
    const escCount = records.filter(r => r.outcome === 'ESCALATE').length;
    const missingCount = records.filter(r => r.outcome === 'INSUFFICIENT_DATA').length;

    const distributionData = [
        { name: 'SAFE', count: safeCount, color: '#22c55e' },
        { name: 'RESCHEDULE', count: reschedCount, color: '#f97316' },
        { name: 'ESCALATE', count: escCount, color: '#ef4444' },
        { name: 'NO DATA', count: missingCount, color: '#64748b' }
    ].filter(d => d.count > 0);

    // Weather Availability
    const availabilityPct = total > 0 ? (((total - missingCount) / total) * 100).toFixed(1) : "0.0";

    // Workload Breakdown
    const workloads: Record<string, number> = {};
    records.forEach(r => {
        const w = (r.workload || 'unknown').toUpperCase();
        workloads[w] = (workloads[w] || 0) + 1;
    });
    const workloadData = Object.keys(workloads).map(k => ({ name: k, value: workloads[k], fill: k === 'HEAVY' ? '#ef4444' : k === 'MODERATE' ? '#f97316' : '#3b82f6' }));

    // Trends over time (by Date)
    const trendMap: Record<string, { date: string, SAFE: number, RISK: number }> = {};
    records.forEach(r => {
        const d = new Date(r.timestamp).toLocaleDateString();
        if (!trendMap[d]) trendMap[d] = { date: d, SAFE: 0, RISK: 0 };
        if (r.outcome === 'PROCEED') trendMap[d].SAFE += 1;
        else trendMap[d].RISK += 1;
    });
    // Sort chronologically
    const trendData = Object.values(trendMap).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Common Reasons
    const reasonsMap: Record<string, number> = {};
    records.forEach(r => {
        if (r.outcome === 'PROCEED') return;
        const exps = r.explanations ? JSON.parse(r.explanations) : [];
        if (exps.length > 0) {
            // Simplify reason by extracting core words
            const rString = exps[0].split('.')[0].substring(0, 50) + "...";
            reasonsMap[rString] = (reasonsMap[rString] || 0) + 1;
        }
    });
    const topReasons = Object.entries(reasonsMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => ({ reason, count }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Risk Analytics</h2>
                <button className="btn" onClick={fetchAnalytics} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LucideRefreshCw size={16} className={loading ? "spin" : ""} /> Sync Data
                </button>
            </div>

            {loading && records.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', display: 'flex', gap: '10px', alignItems: 'center', padding: '20px' }}>
                    <LucideRefreshCw size={16} className="spin" /> Calculating datasets derived from native tracking history...
                </div>
            ) : error ? (
                <div className="glass-panel" style={{ padding: '20px', color: 'var(--heat-red)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontWeight: 'bold' }}>
                        <LucideAlertTriangle size={20} /> {error}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Could not derive analytics due to network isolation.</p>
                </div>
            ) : total === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No historical evaluations exist in the repository to calculate distributions. Run operations in the planner first.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

                    {/* KPI Cards */}
                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sample Size / Total Evaluations</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{total}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>Across {trendData.length} active days</div>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Forecast Availability Rate</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: availabilityPct === "100.0" ? 'var(--heat-green)' : 'var(--heat-orange)' }}>{availabilityPct}%</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{missingCount} missing projections</div>
                    </div>

                    {/* Outcome Distribution */}
                    <div className="glass-panel" style={{ padding: '20px', gridColumn: '1 / -1' }}>
                        <h3 style={{ margin: '0 0 20px 0' }}>Evaluation Outcomes Distribution</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={distributionData} layout="vertical" margin={{ left: 40, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
                                <XAxis type="number" allowDecimals={false} stroke="var(--text-muted)" />
                                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" width={100} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--panel-border)' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: 'var(--text-main)' }}>
                                    {distributionData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--heat-green)' }}>SAFE: {((safeCount / total) * 100).toFixed(1)}%</span>
                            <span style={{ color: 'var(--heat-orange)' }}>RESCHEDULED: {((reschedCount / total) * 100).toFixed(1)}%</span>
                            <span style={{ color: 'var(--heat-red)' }}>DENIED: {((escCount / total) * 100).toFixed(1)}%</span>
                        </div>
                    </div>

                    {/* Trend Line */}
                    <div className="glass-panel" style={{ padding: '20px' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem' }}>Outcome Trends (Safety vs Risk)</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                                <YAxis allowDecimals={false} stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--panel-border)' }} />
                                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                                <Line type="monotone" dataKey="SAFE" stroke="#22c55e" strokeWidth={2} name="Proceed" />
                                <Line type="monotone" dataKey="RISK" stroke="#ef4444" strokeWidth={2} name="Reschedule / Deny" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Workload Breakdown */}
                    <div className="glass-panel" style={{ padding: '20px' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem' }}>Workload Category Focus</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={workloadData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value" stroke="none">
                                    {workloadData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--panel-border)' }} />
                                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Common Reasons */}
                    {topReasons.length > 0 && (
                        <div className="glass-panel" style={{ padding: '20px', gridColumn: '1 / -1' }}>
                            <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem' }}>Core Rescheduling / Escalation Drivers</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {topReasons.map((tr, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--bg-dark)', borderRadius: '4px', borderLeft: '3px solid var(--heat-orange)' }}>
                                        <span style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{tr.reason}</span>
                                        <span style={{ fontWeight: 'bold', color: 'var(--heat-orange)' }}>{tr.count} incidents</span>
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
