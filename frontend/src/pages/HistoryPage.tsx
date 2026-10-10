import { useEffect, useState } from 'react';
import { LucideRefreshCw, LucideAlertTriangle, LucideCheckCircle, LucideXCircle, LucideClock } from 'lucide-react';

export default function HistoryPage() {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const RECORDS_PER_PAGE = 10;

    const fetchHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const res = await fetch(`${baseUrl}/history?limit=1000`);
            if (!res.ok) throw new Error('API disconnected or returned formatting violation.');
            const json = await res.json();
            // Sort by timestamp DESC (although backend probably does this, we double check)
            const sorted = (json.records || []).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setRecords(sorted);
        } catch (err: any) {
            console.error("History Fetch Error:", err);
            setError(err.message || 'Fatal data stream rejection.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const totalPages = Math.ceil(records.length / RECORDS_PER_PAGE);
    const displayedRecords = records.slice((page - 1) * RECORDS_PER_PAGE, page * RECORDS_PER_PAGE);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflow: 'hidden' }}>
            <div className="glass-panel" style={{ padding: '15px 24px', borderLeft: '4px solid var(--accent-magenta)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Evaluation Database</h3>
                    <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        Natively logged Heat Intelligence assessments and deterministic shift outcomes. (What-If simulations are strictly discarded).
                    </p>
                </div>
                <button className="btn" onClick={fetchHistory} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LucideRefreshCw size={16} className={loading ? "spin" : ""} /> Retry / Sync
                </button>
            </div>

            <div className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                {loading && records.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <LucideRefreshCw size={16} className="spin" /> Connecting to SQLite Core...
                    </div>
                ) : error ? (
                    <div style={{ color: 'var(--heat-red)', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontWeight: 'bold' }}>
                            <LucideAlertTriangle size={20} /> {error}
                        </div>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Please ensure backend is running natively and network paths are open.</p>
                        <button className="btn" onClick={fetchHistory}>Retry Connection</button>
                    </div>
                ) : records.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                        <LucideCheckCircle size={40} style={{ opacity: 0.2, marginBottom: '15px' }} />
                        <div>No historical evaluations found. System states are genuinely empty in the native database. Use the Operations Planner to evaluate active tasks.</div>
                    </div>
                ) : (
                    <>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--panel-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                    <th style={{ padding: '12px 8px' }}>Timestamp (UTC)</th>
                                    <th style={{ padding: '12px 8px' }}>Task Bound</th>
                                    <th style={{ padding: '12px 8px' }}>Location</th>
                                    <th style={{ padding: '12px 8px' }}>Outcome</th>
                                    <th style={{ padding: '12px 8px' }}>Reasoning & Shift</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedRecords.map((r, i) => {
                                    const reasons: string[] = r.explanations ? JSON.parse(r.explanations) : [];
                                    const reasonString = reasons.length > 0 ? reasons[0] : "No explicit explanation recorded.";
                                    const hasAlt = r.proposed_start && r.proposed_end;

                                    return (
                                        <tr key={r.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                                {new Date(r.timestamp).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '12px 8px', color: 'var(--accent-cyan)' }}>
                                                <strong>{r.task_name}</strong><br />
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.duration}m {r.workload ? `| ${r.workload.toUpperCase()} W/L` : ''}</span>
                                            </td>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-main)' }}>
                                                {r.site_name}
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                                                    {r.outcome === 'PROCEED' ? (
                                                        <><LucideCheckCircle size={16} color="var(--heat-green)" /> <span style={{ color: 'var(--heat-green)' }}>SAFE</span></>
                                                    ) : r.outcome === 'ESCALATE' ? (
                                                        <><LucideXCircle size={16} color="var(--heat-red)" /> <span style={{ color: 'var(--heat-red)' }}>DENIED</span></>
                                                    ) : r.outcome === 'INSUFFICIENT_DATA' ? (
                                                        <><LucideAlertTriangle size={16} color="var(--text-muted)" /> <span style={{ color: 'var(--text-muted)' }}>NO DATA</span></>
                                                    ) : (
                                                        <><LucideClock size={16} color="var(--heat-orange)" /> <span style={{ color: 'var(--heat-orange)' }}>WARN</span></>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <div style={{ color: 'var(--text-main)', marginBottom: '4px' }}>{reasonString}</div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    {hasAlt ? `Alternative Window: ${new Date(r.proposed_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(r.proposed_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : `Original Parameters Retained`}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '20px', alignItems: 'center' }}>
                                <button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
                                <span style={{ color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
                                <button className="btn" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button>
                            </div>
                        )}
                    </>
                )}

                <style>{`
                    .spin { animation: spin 2s linear infinite; }
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                `}</style>
            </div>
        </div>
    );
}
