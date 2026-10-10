import { useState } from 'react';
import { WorkPlanForm } from '../components/WorkPlanForm';
import type { WorkPlanSubmitData } from '../components/WorkPlanForm';
import type { PlanResult } from '../components/EvaluationResult';
import { useStore } from '../context/OperationalContext';

export interface Scenario {
    id: number;
    title: string;
    payload: WorkPlanSubmitData;
    result: PlanResult | null;
    error: string | null;
}

export default function WhatIfPlanner() {
    const { setActiveSite } = useStore();
    const [isLoading, setIsLoading] = useState(false);
    const [scenarios, setScenarios] = useState<Scenario[]>([]);

    const handleSubmit = async (data: WorkPlanSubmitData) => {
        setIsLoading(true);
        setActiveSite(data.site);

        const newId = Date.now();
        const baseScenario: Scenario = {
            id: newId,
            title: `Scenario ${scenarios.length + 1}`,
            payload: data,
            result: null,
            error: null
        };

        // Optimistically add to state
        setScenarios(prev => [...prev, baseScenario]);

        try {
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const res = await fetch(`${baseUrl}/api/plans/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, simulate: true }) // simulate: true ensures no DB persistence
            });
            if (!res.ok) throw new Error("API Failure");
            const json = await res.json();

            setScenarios(prev => prev.map(s => s.id === newId ? { ...s, result: json } : s));
        } catch (err: any) {
            console.error("Evaluation Error", err);
            setScenarios(prev => prev.map(s => s.id === newId ? { ...s, error: err.message || "Failed to evaluate schedule" } : s));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ color: 'var(--text-main)', margin: '0 0 8px 0' }}>What-If Heat Planner</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                        Compare multiple scheduling scenarios side-by-side without persisting to history.
                        Adjust your parameters below and submit multiple times to build comparison columns.
                    </p>
                </div>
                {scenarios.length > 0 && (
                    <button className="btn-primary" style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)' }} onClick={() => setScenarios([])}>
                        Clear Comparisons
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 400px) 1fr', gap: '24px', alignItems: 'start' }}>
                {/* Left Side: Form */}
                <div style={{ position: 'sticky', top: '24px' }}>
                    <WorkPlanForm onSubmit={handleSubmit} isLoading={isLoading} />
                </div>

                {/* Right Side: Scenario Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                    gap: '20px',
                    alignItems: 'start'
                }}>
                    {scenarios.length === 0 ? (
                        <div className="glass-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', opacity: 0.5, gridColumn: '1 / -1' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⚖️</div>
                                <h4 style={{ color: 'var(--text-muted)' }}>No Scenarios Evaluated</h4>
                                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Configure constraints on the left and submit to add a scenario.</p>
                            </div>
                        </div>
                    ) : (
                        scenarios.map(sc => (
                            <ScenarioCard key={sc.id} scenario={sc} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
    const { title, payload, result, error } = scenario;
    const task = payload.task;

    // Calculate end time synthetically based on input for display
    const plannedStart = new Date(task.planned_start);
    const plannedEnd = new Date(plannedStart.getTime() + task.duration * 60000);

    return (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                <span className="badge cyan" style={{ fontSize: '0.7rem' }}>{title}</span>
            </div>

            <h3 style={{ margin: 0, color: 'var(--accent-cyan)' }}>Scenario Input</h3>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px' }}>
                <div style={{ marginBottom: '4px' }}><strong style={{ color: 'var(--text-muted)' }}>Duration:</strong> {task.duration} min</div>
                <div style={{ marginBottom: '4px' }}><strong style={{ color: 'var(--text-muted)' }}>Proposed Window:</strong><br /> {plannedStart.toLocaleString('en-US', { timeZone: payload.site.timezone })} <br />to<br /> {plannedEnd.toLocaleString('en-US', { timeZone: payload.site.timezone })}</div>
                <div style={{ marginBottom: '4px' }}><strong style={{ color: 'var(--text-muted)' }}>Deadline:</strong> {new Date(task.deadline).toLocaleString('en-US', { timeZone: payload.site.timezone })}</div>
                <div style={{ marginBottom: '4px' }}><strong style={{ color: 'var(--text-muted)' }}>Workload Category:</strong> <span style={{ textTransform: 'capitalize' }}>{task.workload}</span></div>
                <div style={{ marginBottom: '4px' }}><strong style={{ color: 'var(--text-muted)' }}>Site Hours:</strong> {payload.site.operating_window_start} - {payload.site.operating_window_end}</div>
                <div><strong style={{ color: 'var(--text-muted)' }}>Safety Threshold:</strong> Demo Policy Limits</div>
            </div>

            {error ? (
                <div style={{ color: 'var(--error)', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', fontSize: '0.85rem' }}>
                    <strong>Evaluation Failed:</strong> {error}
                </div>
            ) : !result ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
                    Evaluating constraints...
                </div>
            ) : (
                <>
                    <h3 style={{ margin: '10px 0 0 0', color: 'var(--accent-color)' }}>Evaluation Results</h3>

                    <div style={{ borderLeft: '3px solid', borderColor: getOutcomeColor(result.outcome), paddingLeft: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <strong style={{ color: getOutcomeColor(result.outcome) }}>Decision: {result.outcome}</strong>
                        </div>
                        <div style={{ fontSize: '0.85rem', marginBottom: '12px', color: 'var(--text-main)' }}>
                            {result.explanation}
                        </div>

                        <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px', marginBottom: '12px' }}>
                            <strong style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Why this option? (Actual Constraints)</strong>
                            <span style={{ color: '#f87171' }}>{result.original_assessment}</span>
                            {result.missing_information.length > 0 && (
                                <div style={{ color: '#fca5a5', marginTop: '6px' }}>Missing Coverage: {result.missing_information.join(', ')}</div>
                            )}
                        </div>

                        {result.proposed_plan && (
                            <div style={{ fontSize: '0.8rem', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px' }}>
                                <strong style={{ color: 'var(--accent-hover)', display: 'block', marginBottom: '4px' }}>Recommended Feasible Option</strong>
                                <div>Start: {new Date(result.proposed_plan.start_time).toLocaleString('en-US', { timeZone: result.provenance.timezone })}</div>
                                <div style={{ marginTop: '4px' }}>
                                    {result.proposed_plan.adjustments.map((a, i) => <span key={i} className="badge blue" style={{ marginRight: '4px' }}>{a}</span>)}
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--panel-border)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            <strong>Provenance:</strong> {result.provenance.data_source} @ {new Date(result.provenance.fetch_timestamp).toLocaleString()}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function getOutcomeColor(outcome: string) {
    switch (outcome) {
        case 'PROCEED': return 'var(--success)';
        case 'RESCHEDULE': return 'var(--warning)';
        case 'ESCALATE': return 'var(--error)';
        case 'INSUFFICIENT_DATA': return '#94a3b8';
        default: return '#fff';
    }
}
