import { useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export function StatusBanner() {
    const [apiVersion, setApiVersion] = useState<'pending' | 'connected' | 'disconnected'>('pending');

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/health`)
            .then(res => res.json())
            .then(data => setApiVersion(data.status === 'ok' ? 'connected' : 'disconnected'))
            .catch(() => setApiVersion('disconnected'));
    }, []);

    return (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className={`badge ${apiVersion === 'connected' ? 'green' : apiVersion === 'disconnected' ? 'red' : 'gray'}`}>
                Backend: {apiVersion.toUpperCase()}
            </div>
            <div className="badge blue" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                Weather: Open-Meteo Live Integration
            </div>
        </div>
    );
}
