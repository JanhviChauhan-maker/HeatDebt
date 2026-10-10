export interface PlanResult {
    outcome: 'PROCEED' | 'RESCHEDULE' | 'ESCALATE' | 'INSUFFICIENT_DATA';
    explanation: string;
    original_assessment: string;
    proposed_plan?: {
        start_time: string;
        end_time: string;
        adjustments: string[];
    };
    rejected_candidate_explanations: string[];
    missing_information: string[];
    recommended_controls: string[];
    requires_human_review: boolean;
    provenance: {
        data_source: string;
        data_kind: string;
        fetch_timestamp: string;
        timezone: string;
        policy_metadata: { policy: string };
    };
}

interface Props {
    result: PlanResult | null;
}

export function EvaluationResult({ result }: Props) {
    if (!result) return null;

    const getStyleForOutcome = (outcome: string) => {
        switch (outcome) {
            case 'PROCEED': return { color: 'var(--success)', badge: 'badge green', title: 'Schedule Approved' };
            case 'RESCHEDULE': return { color: 'var(--warning)', badge: 'badge yellow', title: 'Modification Required' };
            case 'ESCALATE': return { color: 'var(--error)', badge: 'badge red', title: 'Action Blocked' };
            case 'INSUFFICIENT_DATA': return { color: 'var(--text-muted)', badge: 'badge gray', title: 'Data Missing' };
            default: return { color: '#fff', badge: 'badge gray', title: 'Unknown' };
        }
    };

    const style = getStyleForOutcome(result.outcome);

    return (
        <div className="glass-panel" style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ color: style.color }}>{style.title}</h3>
                <span className={style.badge}>{result.outcome}</span>
            </div>

            <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>System Assessment:</strong>
                <span style={{ fontSize: '0.95rem' }}>{result.explanation}</span>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>Original Baseline Limits</h4>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#f87171' }}>{result.original_assessment}</p>
            </div>

            {result.proposed_plan && (
                <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-color)', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4 style={{ marginBottom: '12px', color: 'var(--accent-hover)' }}>Proposed Safe Alternative</h4>
                    <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>
                        <strong>Start:</strong> {new Date(result.proposed_plan.start_time).toLocaleString('en-US', { timeZone: result.provenance.timezone })} <br />
                        <strong>End:</strong> {new Date(result.proposed_plan.end_time).toLocaleString('en-US', { timeZone: result.provenance.timezone })}
                    </p>
                    {result.proposed_plan.adjustments.map((adj, i) => (
                        <span key={i} className="badge blue" style={{ marginRight: '6px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd' }}>{adj}</span>
                    ))}
                </div>
            )}

            {result.rejected_candidate_explanations.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>Rejected Alternatives ({result.rejected_candidate_explanations.length})</h4>
                    <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px' }}>
                        {result.rejected_candidate_explanations.map((exp, i) => (
                            <div key={i} style={{ marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                                {exp}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {result.missing_information.length > 0 && (
                <div style={{ marginBottom: '20px', color: '#fca5a5' }}>
                    <strong>Missing Datapoints:</strong> {result.missing_information.join(', ')}
                </div>
            )}

            <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px', marginTop: '20px' }}>
                <h4 style={{ marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Data Provenance</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <div><strong>Source:</strong> {result.provenance.data_source} ({result.provenance.data_kind})</div>
                    <div><strong>Live Timestamp:</strong> {new Date(result.provenance.fetch_timestamp).toLocaleString()}</div>
                    <div><strong>Policy:</strong> {result.provenance.policy_metadata.policy}</div>
                    <div><strong>Note:</strong> Estimates utilize Apparent Temperature, not official WBGT sensors.</div>
                </div>
            </div>
        </div>
    );
}
