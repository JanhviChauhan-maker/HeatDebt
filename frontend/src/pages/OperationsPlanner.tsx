import { useState } from 'react';
import { WorkPlanForm } from '../components/WorkPlanForm';
import type { WorkPlanSubmitData } from '../components/WorkPlanForm';
import { EvaluationResult } from '../components/EvaluationResult';
import type { PlanResult } from '../components/EvaluationResult';
import { useStore } from '../context/OperationalContext';

export default function OperationsPlanner() {
    const { setActiveSite } = useStore();
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<PlanResult | null>(null);

    const handleSubmit = async (data: WorkPlanSubmitData) => {
        setIsLoading(true);
        setActiveSite(data.site);

        try {
            // Note: Since VITE_API_BASE_URL might be undefined in dev, default to localhost
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const res = await fetch(`${baseUrl}/api/plans/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const json = await res.json();
            setResult(json);
        } catch (err) {
            console.error("Evaluation Error", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) minmax(400px, 1fr)', gap: '24px', alignItems: 'start' }}>
            <WorkPlanForm onSubmit={handleSubmit} isLoading={isLoading} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="glass-panel">
                    <h3 style={{ color: 'var(--text-main)', marginBottom: '10px' }}>Deterministic Scheduler Policy</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        The engine deterministically selects the <strong>earliest continuous safe window</strong> occurring after the <code>Earliest Bound</code> constraint. If <strong style={{ color: 'var(--accent-cyan)' }}>06:00 - 08:00</strong> is repeatedly suggested, it mathematically represents the first unblocked grid resolving strict duration and safe Apparent Temperature bounds natively!
                    </p>
                </div>

                {result ? (
                    <EvaluationResult result={result} />
                ) : (
                    <div className="glass-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', opacity: 0.5 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⏱️</div>
                            <h4 style={{ color: 'var(--text-muted)' }}>Awaiting Plan Submission</h4>
                            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Configure constraints and submit for evaluation</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
